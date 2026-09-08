// ============================================================
// engine.mjs — Coeur de l'agent : commandes signées, heartbeat,
// collecte des compteurs routeur, expiration et réconciliation.
// Toutes les boucles sont single-flight (aucun chevauchement) et
// tout échec réseau est journalisé sans faire tomber l'agent.
// ============================================================

import { callFunction, AgentHttpError } from "./http.mjs";
import { verifyCommand } from "./lib/signatures.mjs";

const WZ_COMMENT = (sessionId) => `wz:${String(sessionId).slice(0, 8)}`;

export class AgentEngine {
  constructor({ env, router, log = console }) {
    this.env = env;
    this.router = router;
    this.log = log;
    this.baseUrl = null;
    this.token = env.AGENT_TOKEN;
    this.secret = env.NETWORK_HMAC_SECRET && env.NETWORK_HMAC_SECRET !== "changez-moi"
      ? env.NETWORK_HMAC_SECRET
      : null;

    // sessions en mémoire : session_id -> { address, comment }
    this.sessions = new Map();
    this.lastCounters = new Map(); // session_id -> { bytes_in, bytes_out }

    this.timers = new Map();
    this.loop = new Map(); // nom -> Promise (single-flight)
    this.running = false;
    this.lastRouterOk = null;
    this.routerErrors = 0;
  }

  start() {
    this.running = true;
    this.baseUrl = `${this.env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1`;

    this.schedule("ping", this.env.int("AGENT_PING_INTERVAL_MS"), () => this.tickPing());
    this.schedule("fetch", this.env.int("AGENT_FETCH_INTERVAL_MS"), () => this.tickFetch());
    this.schedule("collect", this.env.int("AGENT_COLLECT_INTERVAL_MS"), () => this.tickCollect());
    this.schedule("expire", this.env.int("AGENT_EXPIRE_INTERVAL_MS"), () => this.tickExpire());
    this.schedule("reconcile", this.env.int("AGENT_COLLECT_INTERVAL_MS") * 2, () => this.tickReconcile());

    // Rond initial : heartbeat puis fetch pour dérouler immédiatement.
    this.fire("ping");
    this.fire("fetch");

    this.log.info(`[agent] démarré — site?, boucle ${this.env.int("AGENT_FETCH_INTERVAL_MS")}ms fetch / ${this.env.int("AGENT_PING_INTERVAL_MS")}ms ping`);
  }

  async stop() {
    this.running = false;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    await this.router.disconnect?.();
    this.log.info("[agent] arrêté");
  }

  schedule(name, ms, fn) {
    const tick = async () => {
      if (!this.running) return;
      try {
        this.loop.set(name, fn());
        await this.loop.get(name);
      } catch (err) {
        this.log.warn(`[agent] boucle ${name} en échec : ${err?.message ?? err}`);
      } finally {
        this.loop.delete(name);
        if (this.running) {
          const t = setTimeout(tick, ms);
          this.timers.set(name, t);
        }
      }
    };
    const t = setTimeout(tick, ms);
    this.timers.set(name, t);
  }

  fire(name) {
    const map = {
      ping: () => this.tickPing(),
      fetch: () => this.tickFetch(),
      collect: () => this.tickCollect(),
      expire: () => this.tickExpire(),
      reconcile: () => this.tickReconcile(),
    };
    if (!this.loop.has(name)) {
      this.loop.set(name, Promise.resolve(map[name]()).catch((e) => this.log.warn(`[agent] fire ${name}: ${e?.message ?? e}`)));
    }
  }

  // ---- Heartbeat -------------------------------------------------

  async tickPing() {
    try {
      await this.router.connect();
      this.lastRouterOk = true;
      this.routerErrors = 0;
    } catch (err) {
      this.lastRouterOk = false;
      this.routerErrors++;
      this.log.warn(`[agent] routeur injoignable : ${err?.message ?? err}`);
    }
    try {
      const res = await this.call("agent-ping", { router_ok: this.lastRouterOk });
      if (res?.agent_id) this.agentId = res.agent_id;
    } catch (err) {
      this.log.warn(`[agent] ping serveur indisponible : ${err?.message ?? err}`);
    }
  }

  // ---- Commandes -------------------------------------------------

  async tickFetch() {
    let res;
    try {
      res = await this.call("agent-command-fetch", { limit: 10 });
    } catch (err) {
      this.log.warn(`[agent] tirage des commandes impossible : ${err?.message ?? err}`);
      return;
    }
    const commands = Array.isArray(res?.commands) ? res.commands : [];
    for (const cmd of commands) {
      await this.processCommand(cmd);
    }
  }

  async processCommand(cmd) {
    try {
      if (this.secret && !verifyCommand(this.secret, cmd, cmd.signature)) {
        this.log.warn(`[agent] commande ${cmd.id} (${cmd.type}) : signature invalide — rejetée`);
        await this.report(cmd.id, false, "Signature HMAC invalide", null);
        return;
      }
      if (!this.secret) {
        this.log.info(`[agent] commande ${cmd.id} (${cmd.type}) : aucun secret HMAC configuré (mode test) — non vérifiée`);
      }

      let payload = {};
      try {
        payload = JSON.parse(cmd.payload ?? "{}");
      } catch {
        payload = {};
      }

      const outcome = await this.dispatchCommand(cmd, payload);
      if (!outcome) return;
      const { ok, error_message, result, session_id, router_session_reference } = outcome;
      await this.report(cmd.id, ok, error_message, result, session_id, router_session_reference);
    } catch (err) {
      this.log.error(`[agent] commande ${cmd.id} en échec : ${err?.message ?? err}`);
      try {
        await this.report(cmd.id, false, err?.message ?? "Erreur agent", null);
      } catch (reportErr) {
        this.log.error(`[agent] rapport d'échec possible : ${reportErr?.message ?? reportErr}`);
      }
    }
  }

  async dispatchCommand(cmd, payload) {
    const sessionId = payload.session_id;
    switch (cmd.type) {
      case "authorize":
        return this.handleAuthorize(sessionId, payload);
      case "disconnect":
        return this.handleDisconnect(sessionId, payload);
      case "collect_usage":
        return this.handleCollect(sessionId, payload);
      case "reconcile":
        return this.handleReconcile(payload);
      case "walled_garden":
        return this.handleWalledGarden(payload);
      default:
        return { ok: false, error_message: `Type de commande inconnu : ${cmd.type}` };
    }
  }

  async handleAuthorize(sessionId, payload) {
    const address = payload.device_observed_ip;
    if (!address) {
      return { ok: false, error_message: "Aucune adresse IP observable pour autoriser" };
    }
    const comment = WZ_COMMENT(sessionId);
    try {
      const out = await this.router.authorize({ address, comment });
      this.sessions.set(sessionId, { address, comment });
      this.lastCounters.set(sessionId, { bytes_in: 0, bytes_out: 0 });
      this.log.info(`[agent] authorised ${address} → ${out.reference}`);
      return {
        ok: true,
        result: { address, comment, reference: out.reference },
        session_id: sessionId,
        router_session_reference: out.reference,
      };
    } catch (err) {
      await this.safeDeauthorize(address);
      return { ok: false, error_message: `Autorisation routeur échouée : ${err?.message ?? err}` };
    }
  }

  async handleDisconnect(sessionId, payload) {
    const track = this.sessions.get(sessionId);
    const address = track?.address ?? payload.device_observed_ip;
    const comment = track?.comment ?? WZ_COMMENT(sessionId);
    try {
      if (address) await this.router.deauthorize({ address, comment });
      this.sessions.delete(sessionId);
      this.lastCounters.delete(sessionId);
      this.log.info(`[agent] disconnected ${address ?? sessionId} (${payload.reason ?? "?"})`);
      return { ok: true, result: { address, reason: payload.reason } };
    } catch (err) {
      return { ok: false, error_message: `Déconnexion routeur échouée : ${err?.message ?? err}` };
    }
  }

  async handleCollect(sessionId, payload) {
    const track = this.sessions.get(sessionId);
    const address = track?.address ?? payload.device_observed_ip;
    const usage = await this.router.queueUsage(address);
    if (!usage) return { ok: false, error_message: `Aucune queue pour ${address ?? sessionId}` };
    try {
      const res = await this.call("agent-collect", {
        session_id: sessionId,
        bytes_in: usage.bytesIn,
        bytes_out: usage.bytesOut,
      });
      return { ok: true, result: { counters: { bytes_in: usage.bytesIn, bytes_out: usage.bytesOut }, server: res } };
    } catch (err) {
      return { ok: false, error_message: `Collecte refusée par le serveur : ${err?.message ?? err}` };
    }
  }

  async handleReconcile(payload) {
    const clients = await this.router.clients();
    return { ok: true, result: { clients: clients.slice(0, 100), count: clients.length } };
  }

  async handleWalledGarden(payload) {
    const clients = await this.router.clients();
    return { ok: true, result: { clients: clients.slice(0, 100), list: this.router.listName } };
  }

  async safeDeauthorize(address) {
    try {
      if (address) await this.router.deauthorize({ address });
    } catch {
      /* best effort */
    }
  }

  async report(command_id, ok, error_message, result, session_id, router_session_reference) {
    const body = { command_id, ok, result, session_id, router_session_reference };
    if (error_message) body.error_message = error_message;
    if (result === undefined) delete body.result;
    const res = await this.call("agent-command-result", body);
    if (!ok) this.log.warn(`[agent] commande ${command_id} marquée échouée : ${error_message}`);
    return res;
  }

  // ---- Collecte périodique --------------------------------------

  async tickCollect() {
    for (const [sessionId, track] of [...this.sessions.entries()]) {
      try {
        const usage = await this.router.queueUsage(track.address);
        if (!usage) continue;
        // Le serveur calcule lui-même le delta depuis la dernière mesure
        // (apply_data_usage) : on remonte les compteurs CUMULÉS du routeur.
        const prev = this.lastCounters.get(sessionId) ?? { bytes_in: 0, bytes_out: 0 };
        const res = await this.call("agent-collect", {
          session_id: sessionId,
          bytes_in: usage.bytesIn,
          bytes_out: usage.bytesOut,
        });
        this.log.debug(
          `[agent] collect ${sessionId} : in=${usage.bytesIn} (+${usage.bytesIn - prev.bytes_in}) ` +
            `out=${usage.bytesOut} (+${usage.bytesOut - prev.bytes_out}) → ${res?.ok ?? "?"}`
        );
        this.lastCounters.set(sessionId, { bytes_in: usage.bytesIn, bytes_out: usage.bytesOut });
      } catch (err) {
        this.log.warn(`[agent] collect échoué pour ${sessionId} : ${err?.message ?? err}`);
      }
    }
  }

  // ---- Expiration & réconciliation -------------------------------

  async tickExpire() {
    try {
      const res = await this.call("agent-expire", {});
      if (res?.expired > 0) this.log.info(`[agent] ${res.expired} session(s) expirée(s) côté serveur`);
    } catch (err) {
      this.log.warn(`[agent] expiration impossible : ${err?.message ?? err}`);
    }
  }

  async tickReconcile() {
    try {
      const clients = await this.router.clients();
      const router_clients = clients.map((c) => {
        const sessionId = this.matchSessionId(c.comment);
        return { session_id: sessionId ?? undefined, mac: c.address, ip: c.address, reference: c.reference };
      });
      const res = await this.call("agent-reconcile", { router_clients });
      if (res?.reaped > 0) this.log.info(`[agent] ${res.reaped} session(s) réaperçues (NETWORK_LOST)`);
    } catch (err) {
      this.log.warn(`[agent] réconciliation impossible : ${err?.message ?? err}`);
    }
  }

  matchSessionId(comment) {
    if (!comment) return null;
    const m = String(comment).match(/^wz:([0-9a-f]{8})$/);
    return m ? m[1] : null;
  }

  // ---- Outillage HTTP --------------------------------------------

  async call(name, body) {
    return callFunction({ baseUrl: this.baseUrl, token: this.token, name, body });
  }
}