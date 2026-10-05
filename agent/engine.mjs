// ============================================================
// engine.mjs — Coeur de l'agent : commandes signées, heartbeat,
// collecte des compteurs routeur, expiration et réconciliation.
// Toutes les boucles sont single-flight (aucun chevauchement) et
// tout échec réseau est journalisé sans faire tomber l'agent.
// ============================================================

import { callFunction, AgentHttpError } from "./http.mjs";
import { verifyCommand } from "./lib/signatures.mjs";
import { isIpv4, resolveClientAddress } from "./lib/router-targets.mjs";

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

    this.log.info(
      `[agent] démarré — routeur ${this.router?.name ?? "?"}, ` +
        `fetch ${this.env.int("AGENT_FETCH_INTERVAL_MS")}ms / ` +
        `ping ${this.env.int("AGENT_PING_INTERVAL_MS")}ms / ` +
        `collect ${this.env.int("AGENT_COLLECT_INTERVAL_MS")}ms / ` +
        `expire ${this.env.int("AGENT_EXPIRE_INTERVAL_MS")}ms`
    );
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
    const declared = payload.device_observed_ip;
    let address = isIpv4(declared) ? String(declared).trim() : null;
    let resolvedHow = "declared";

    if (!address) {
      // L'app ne connaît pas son IP de gestion et ne doit pas la connaître.
      // On l'observe donc sur le routeur : plus fiable que ce que le
      // téléphone déclare, et l'adresse reste hors de la base.
      let leases = [];
      try {
        leases = (await this.router.dhcpLeases()) ?? [];
      } catch (err) {
        return {
          ok: false,
          error_message: `Lecture des baux DHCP impossible : ${err?.message ?? err}`,
        };
      }
      const resolved = resolveClientAddress({
        leases,
        wantedIp: declared,
        wantedMac: payload.device_observed_mac,
      });
      if (!resolved.ok) {
        return {
          ok: false,
          error_message: `${resolved.reason} Adresse à autoriser indéterminée.`,
        };
      }
      address = resolved.address;
      resolvedHow = resolved.how;
      this.log.info(`[agent] adresse résolue depuis le routeur (${resolvedHow}) : ${address}`);
    }

    const comment = WZ_COMMENT(sessionId);

    // 1. Entrée dans la liste pilotée.
    let reference;
    try {
      const out = await this.router.authorize({ address, comment });
      reference = out.reference;
      this.log.info(`[agent] authorised ${address} → ${out.reference}`);
    } catch (err) {
      return {
        ok: false,
        error_message: `Autorisation routeur échouée : ${err?.message ?? err}`,
      };
    }

    // 2. File de comptage : OBLIGATOIRE. Sans elle, aucun octet n'est
    //    remonté et le quota de l'abonné reste figé — mieux vaut
    //    refuser l'accès que d'accorder un accès non mesuré.
    let queue;
    try {
      queue = await this.router.ensureQueue({ address, comment });
    } catch (err) {
      // Retour arrière COMPLET. La file a pu être créée sur le
      // routeur puis faire échouer la lecture qui suit : sans ce
      // retrait, on laisserait une file orpheline qui tourne pour
      // une adresse à laquelle l'accès est refusé.
      await this.safeRemoveQueue(address);
      await this.safeDeauthorize(address);
      return {
        ok: false,
        error_message:
          `Autorisation refusée : file de comptage indisponible sur le routeur ` +
          `(${err?.message ?? err}). Aucun accès n'est accordé sans comptage.`,
      };
    }

    this.sessions.set(sessionId, { address, comment });
    this.lastCounters.set(sessionId, { bytes_in: 0, bytes_out: 0 });
    this.log.info(
      `[agent] file ${queue.name ?? "?"} ${queue.created ? "créée" : "existante"} pour ${address}`
    );
    return {
      ok: true,
      result: { address, comment, reference, queue: queue.name ?? null, addressSource: resolvedHow },
      session_id: sessionId,
      router_session_reference: reference,
    };
  }

  async handleDisconnect(sessionId, payload) {
    const track = this.sessions.get(sessionId);
    const address = track?.address ?? payload.device_observed_ip;
    const comment = track?.comment ?? WZ_COMMENT(sessionId);
    // La file de comptage doit partir même si la révocation d'accès
    // échoue : une file laissée en place continue de tourner sur le
    // routeur pour un client qui n'a plus le droit de se connecter, et
    // fausse les compteurs des sessions suivantes.
    let failure = null;
    try {
      if (address) await this.router.deauthorize({ address, comment });
    } catch (err) {
      failure = err;
    }
    if (address) await this.safeRemoveQueue(address);
    this.sessions.delete(sessionId);
    this.lastCounters.delete(sessionId);
    if (failure) {
      this.log.warn(
        `[agent] révocation d'accès échouée pour ${address} (${failure?.message ?? failure}) ` +
          "— la file de comptage a néanmoins été supprimée"
      );
      return {
        ok: false,
        error_message: `Déconnexion routeur partielle : accès non révoqué (${failure?.message ?? failure})`,
      };
    }
    this.log.info(`[agent] disconnected ${address ?? sessionId} (${payload.reason ?? "?"})`);
    return { ok: true, result: { address, reason: payload.reason } };
  }

  async handleCollect(sessionId, payload) {
    const track = this.sessions.get(sessionId);
    const address = track?.address ?? payload.device_observed_ip;
    const comment = track?.comment ?? WZ_COMMENT(sessionId);
    const usage = await this.measure(address, comment);
    if (!usage) return { ok: false, error_message: `Aucune file de comptage pour ${address ?? sessionId}` };
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

  /**
   * Walled garden — VOLONTAIREMENT non implanté côté agent : la
   * liste blanche dépend entièrement du routeur (DNS statique, règles
   * firewall par IP). On renvoie donc un résultat EXPLICITE
   * `implemented: false` : ni le serveur ni l'interface ne peuvent
   * laisser croire qu'un walled garden est actif, et la commande
   * n'échoue pas (elle n'est pas dans le chemin critique de la
   * session). Le comportement réseau reste celui du routeur.
   */
  async handleWalledGarden(payload) {
    this.log.warn(
      "[agent] commande walled_garden reçue : non implantée (à configurer sur le routeur), aucune action"
    );
    return {
      ok: true,
      result: {
        implemented: false,
        list: this.router.listName,
        note: "Le walled garden se configure sur le routeur (adresse-list + DNS), pas via l'agent.",
      },
    };
  }

  async safeDeauthorize(address) {
    try {
      if (address) await this.router.deauthorize({ address });
    } catch {
      /* best effort */
    }
  }

  async safeRemoveQueue(address) {
    try {
      if (address && typeof this.router.removeQueue === "function") {
        await this.router.removeQueue({ address });
      }
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

  /**
   * Mesure les compteurs d'un client et RÉPARE la file si elle a
   * disparu (redémarrage du routeur : les files simples et les
   * entrées d'address-list ajoutées par l'API ne sont pas persistées
   * tant que la configuration n'a pas été sauvegardée).
   *
   * Sécurité métier : le serveur calcule le delta et le borne à 0
   * (`greatest(compteur - dernier, 0)`), donc une reprise de comptage
   * après reboot ne peut jamais facturer à l'abonné plus que le
   * trafic réellement écoulé — au pire, la fenêtre de reboot n'est
   * pas comptée.
   */
  async measure(address, comment) {
    if (!address) return null;
    let usage = await this.router.queueUsage(address);
    if (!usage && typeof this.router.ensureQueue === "function") {
      const recreated = await this.router.ensureQueue({ address, comment });
      usage = await this.router.queueUsage(address);
      this.log.warn(
        `[agent] file de comptage disparue pour ${address} — recréée (${recreated.name ?? "?"})`
      );
    }
    if (!usage) {
      // File introuvable OU file dont le routeur ne renvoie aucun
      // compteur. Les deux cas se traitent pareil et c'est
      // VOLONTAIRE : on ne remonte rien plutôt qu'un « 0 octet »,
      // qui ferait croire à une mesure. Le serveur borne le delta à 0,
      // donc la sous-comptée qui en découle ne peut jamais
      // sur-facturer un abonné.
      this.log.warn(
        `[agent] aucune mesure exploitable pour ${address} — aucun octet remonté ` +
          "(file absente ou compteurs illisibles sur le routeur)"
      );
    }
    return usage ?? null;
  }

  // ---- Collecte périodique --------------------------------------

  async tickCollect() {
    for (const [sessionId, track] of [...this.sessions.entries()]) {
      try {
        const usage = await this.measure(track.address, track.comment);
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