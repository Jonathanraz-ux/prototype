// ============================================================
// lib/routeros-api.mjs — Client binaire API RouterOS (protocole
// mots, node:net / node:tls, zéro dépendance). C'est le protocole
// retenu pour le hAP ac² du jour J : RouterOS 6.42.3 n'a AUCUNE API
// REST, qui n'apparaît qu'en 7.1+. L'adaptateur REST reste disponible
// pour un routeur 7.x, mais le défaut « en cas de doute » est `api`.
//
// Robustesse (indispensable face à un vrai routeur) :
//   • les requêtes sont SÉRIALISÉES dans une file — les boucles de
//     l'agent (ping / fetch / collect / reconcile) peuvent tourner en
//     même temps sans provoquer de « requête déjà en vol » ;
//   • reconnexion automatique si le routeur a redémarré (socket
//     fermée) ou si la connexion a été perdue ;
//   • reconnexion + rejet des requêtes en attente à la fermeture, pour
//     qu'aucune boucle ne reste bloquée indéfiniment ;
//   • les lectures utilisent .proplist : charge minimale sur le CPU du
//     routeur ;
//   • `clients()` ne voit QUE la liste de l'agent : les autres listes
//     du routeur ne sont jamais désactivées ni réconciliées.
//
// Parsers exportés en fonctions PURES → testables sans routeur.
// ============================================================

import net from "node:net";
import tls from "node:tls";
import { createHash } from "node:crypto";
import { clientTarget, countersFromQueueRow, queueNameFor, queueTargetStrings, rowTargetsAddress } from "./router-targets.mjs";

/** Erreurs de transport : la connexion est morte, la requête est rejouable. */
function isSocketError(err) {
  const code = err?.code ?? "";
  return (
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "ECONNREFUSED" ||
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    code === "EHOSTUNREACH" ||
    code === "ENOTFOUND" ||
    // Fermeture propre (FIN) du routeur : un redémarrage peut aussi
    // bien envoyer un FIN qu'un RST. Sans ce code, la requête en vol
    // était rejetée au lieu d'être rejouée.
    code === "ECONNCLOSED"
  );
}

/** Tentatives de reconnexion avant d'abandonner une requête. */
const MAX_CONNECT_ATTEMPTS = 4;

/**
 * Détruit une socket SANS déclencher la gestion de perte de connexion.
 * Indispensable : un `destroy()` provoque un événement `close` qui,
 * sans ce détachement, serait pris pour une panne du routeur et
 * consommerait le budget de reconnexion de la requête en cours.
 */
function destroySocket(socket) {
  if (!socket) return;
  socket.removeAllListeners("data");
  socket.removeAllListeners("close");
  socket.removeAllListeners("error");
  try {
    socket.destroy();
  } catch {
    /* ignore */
  }
}

/**
 * Branche les événements de lecture du socket. Volontairement hors
 * classe : la fermeture/erreur doivent être traitées par `connect()`
 * qui, en cas d'échec de connexion, détruit le socket sans déclencher
 * deux fois la perte de connexion.
 */
function attachData(client, onLost) {
  const socket = client.socket;
  socket.on("data", (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    client.parsePending();
  });
  // La socket d'origine est transmise à onLost : un 'close' tardif
  // concernant une connexion DÉJÀ abandonnée ne doit pas détruire la
  // nouvelle connexion en cours de login (sinon la requête est
  // perdue et l'agent se fige).
  socket.on("close", () =>
    onLost(Object.assign(new Error("Connexion RouterOS fermée"), { code: "ECONNCLOSED" }), socket)
  );
  socket.on("error", (err) => onLost(err, socket));
}

const DEFAULT_LIST = "wz-active";
/** File sans limitation de débit : elle ne fait que compter. */
const UNLIMITED = "0/0";

const ADDRESS_PROPLIST = ".id,list,address,comment,disabled";
/**
 * Propriétés demandées sur /queue/simple.
 *
 * `bytes` est la propriété documentée (composite "upload/download").
 * `bytes-in`/`bytes-out` n'existent PAS sur ce menu : ce sont les noms
 * SNMP. RouterOS ignore silencieusement une propriété inconnue, donc
 * l'ancienne liste renvoyait des lignes SANS aucun compteur — et un
 * compteur absent se confondait avec un compteur à zéro, c'est-à-dire
 * un quota qui ne se décompte jamais sans le moindre signal.
 */
const QUEUE_PROPLIST = ".id,name,target,comment,bytes,total-bytes";

/** Découpe une réponse `!re … !re … !done` en lignes d'attributs. */
function splitRows(words) {
  const rows = [];
  let current = null;
  for (const w of words) {
    if (w === "!re" || w === "!done") {
      if (current) rows.push(current);
      if (w === "!done") break;
      current = {};
      continue;
    }
    if (!current) continue;
    if (!w.startsWith("=")) continue;
    const eq = w.indexOf("=", 1);
    if (eq < 0) continue;
    current[w.slice(1, eq)] = w.slice(eq + 1);
  }
  return rows;
}

/**
 * Réponse au DÉFI d'authentification de l'API RouterOS.
 *
 * Format normatif, tel qu'il figure dans le client de référence MikroTik
 * (`manual.mikrotik.com/docs/developer-guides/api/python3-example`) :
 *
 *     réponse = "00" + md5( 0x00 || mot_de_passe || défi )
 *
 * Trois détails font échouer l'authentification, et aucun ne se voit sans
 * matériel réel :
 *   • le préfixe littéral `00` ;
 *   • l'algorithme : **MD5**, pas SHA1 ;
 *   • l'ordre des octets : le mot de passe se place ENTRE le 0x00 et le
 *     défi (et non après le défi).
 *
 * Fonction PURE et exportée : elle se teste sans routeur, ce qui est le
 * seul moyen de verrouiller ce format.
 */
export function legacyLoginResponse(password, challengeHex) {
  const challenge = Buffer.from(challengeHex, "hex");
  const digest = createHash("md5")
    .update(Buffer.concat([Buffer.from([0]), Buffer.from(password, "latin1"), challenge]))
    .digest("hex");
  return `00${digest}`;
}

/** Lignes d'address-list → clients de l'agent (liste filtrée). */
export function parseAddressListRows(words, listName) {
  return splitRows(words)
    .filter((r) => r.address && (!listName || r.list === listName) && r.disabled !== "true")
    .map((r) => ({ id: r[".id"] ?? null, address: r.address, comment: r.comment ?? "" }));
}

/** Lignes de file simple → file du client (correspondance EXACTE). */
export function parseQueueRows(words, address) {
  const found = splitRows(words).find((r) => rowTargetsAddress(r, address));
  if (!found) return null;
  // `bytes` = "upload/download". Sans lui on retombe sur `bytes-in`/
  // `bytes-out` (noms explicites rencontrés sur certaines versions),
  // puis sur le total seul. `available: false` = RouterOS n'a renvoyé
  // AUCUN compteur : c'est distinct d'un compteur à zéro et l'agent
  // doit alors refuser de remonter une mesure plutôt que d'en inventer.
  const { bytesIn, bytesOut, available } = countersFromQueueRow(found);
  return {
    id: found[".id"] ?? null,
    name: found.name ?? null,
    target: found.target ?? null,
    comment: found.comment ?? "",
    bytesIn,
    bytesOut,
    available,
  };
}

export class RouterOSApi {
  constructor({
    host,
    username,
    password,
    tlsEnabled = false,
    portApi = 8728,
    listName = DEFAULT_LIST,
    maxLimit = UNLIMITED,
    reconnectBaseDelayMs = 1000,
    log = null,
  }) {
    this.name = "mikrotik-api";
    this.host = host;
    this.username = username;
    this.password = password;
    this.tls = tlsEnabled;
    this.port = portApi;
    this.listName = listName;
    this.maxLimit = maxLimit;
    this.reconnectBaseDelayMs = reconnectBaseDelayMs;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.queue = []; // requêtes en attente
    this.inFlight = null; // requête courante
    this.loggingIn = false;
    this.retryTimer = null;
    this.log = log;
    this.versionLogged = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.loggingIn = true;
      const onReady = async () => {
        try {
          await this.login();
          this.loggingIn = false;
          resolve(true);
        } catch (err) {
          this.loggingIn = false;
          // Un mot de passe refusé laisse une socket ouverte et
          // « connectée » mais non authentifiée : les requêtes
          // suivantes partiraient sur une session morte et
          // repartiraient en boucle sur « not logged in ». On
          // détruit donc la socket avant de signaler l'échec.
          if (this.socket) {
            destroySocket(this.socket);
            this.socket = null;
          }
          reject(err);
        }
      };
      // Échec de la CONNEXION (TCP) uniquement. Le nettoyage de la
      // socket est laissé à onConnectionLost : ce gestionnaire ne doit
      // surtout pas détruire `this.socket`, qui peut déjà être la
      // connexion suivante (c'était le cas lors d'une reconnexion
      // après redémarrage du routeur : la requête était perdue et
      // l'agent se figeait).
      const onConnectError = (err) => {
        this.loggingIn = false;
        reject(err);
      };
      try {
        if (this.tls) {
          this.socket = tls.connect(this.port, this.host, { rejectUnauthorized: false }, onReady);
        } else {
          this.socket = net.createConnection({ host: this.host, port: this.port }, onReady);
        }
        // Le socket d'origine est relayé : c'est lui qui permet
        // d'ignorer un 'close' tardif d'une connexion déjà remplacée.
        attachData(this, (err, originSocket) => this.onConnectionLost(err, originSocket));
        this.socket.once("error", onConnectError);
      } catch (err) {
        onConnectError(err);
      }
    });
  }

  /**
   * Plus aucune requête ne peut aboutir : on rejette proprement les
   * requêtes en vol ET celles en file, puis on libère le socket.
   * L'ordre importe : le socket est capturé puis détruit AVANT que
   * `this.socket` ne soit remis à null, sinon la fermeture propre
   * n'a jamais lieu et la connexion fuit à chaque arrêt de l'agent.
   */
  onConnectionLost(err, socket = this.socket) {
    // Événement obsolète : il concerne une connexion déjà remplacée.
    if (socket && this.socket && socket !== this.socket) return;
    destroySocket(socket ?? this.socket);
    this.socket = null;
    // Une connexion morte en pleine requête (RST après redémarrage,
    // coupure réseau) n'est pas une erreur métier : la requête est
    // rejouée sur une connexion neuve, une seule fois.
    if (this.inFlight && isSocketError(err) && this.inFlight.allowReconnect) {
      const job = this.inFlight;
      this.inFlight = null;
      job.allowReconnect = false;
      this.queue.unshift(job);
      this.drain();
      return;
    }
    if (this.inFlight) {
      const job = this.inFlight;
      this.inFlight = null;
      job.reject(err);
    }
    const queued = this.queue.splice(0, this.queue.length);
    for (const job of queued) job.reject(err);
  }

  disconnect() {
    this.cancelRetry();
    this.onConnectionLost(new Error("Agent arrêté"));
  }

  /** Alias explicite (utilisé par `--doctor`). */
  async close() {
    this.disconnect();
  }

  isConnected() {
    return Boolean(this.socket && !this.socket.destroyed);
  }

  /**
   * Résout la requête en vol à la phrase qui la termine.
   *
   * Le protocole RouterOS envoie UNE phrase par enregistrement, chacune
   * close par un mot vide ; `!done` n'arrive qu'à la toute fin. Le
   * client de référence boucle donc en accumulant les phrases jusqu'à
   * `!done`.
   *
   * Résoudre dès la PREMIÈRE phrase — comme le fait une lecture naïve —
   * marche sur un seul enregistrement et se désynchronise dès qu'il y en
   * a deux : le reste arrive sur la requête SUIVANTE, qui reçoit alors la
   * ligne du routeur précédent. Sur `/ip/firewall/address-list/print` ou
   * `/queue/simple/print`, cela revient à lire une seule file et à
   * attribuer les compteurs d'un client à un autre. Aucun test ne le
   * voyait, car le double envoyait toutes les lignes d'un seul bloc.
   */
  parsePending() {
    while (this.inFlight && this.buffer.length > 0) {
      const sentence = this.tryReadSentence();
      if (sentence === null) break;
      this.inFlight.reply.push(...sentence);
      const finished = sentence.includes("!done") || sentence.includes("!fatal");
      if (!finished) continue;
      const job = this.inFlight;
      this.inFlight = null;
      job.resolve(job.reply);
      this.drain();
    }
  }

  /** Tente de lire UNE sentence complète depuis le tampon ; null si incomplète. */
  tryReadSentence() {
    let offset = 0;
    const words = [];
    for (;;) {
      const len = this.readWordLength(this.buffer, offset);
      if (len === null) return null;
      offset += len.bytes;
      if (len.length === 0) break; // mot vide = fin de phrase
      if (offset + len.length > this.buffer.length) return null;
      words.push(this.buffer.toString("latin1", offset, offset + len.length));
      offset += len.length;
    }
    this.buffer = this.buffer.subarray(offset);
    return words;
  }

  readWordLength(buf, offset) {
    if (offset >= buf.length) return null;
    const b0 = buf[offset];
    if ((b0 & 0x80) === 0) return { length: b0, bytes: 1 };
    if ((b0 & 0xc0) === 0x80) {
      if (offset + 2 > buf.length) return null;
      return { length: ((b0 & 0x3f) << 8) | buf[offset + 1], bytes: 2 };
    }
    if (offset + 5 > buf.length) return null;
    return {
      length:
        (buf[offset + 1] << 24) | (buf[offset + 2] << 16) | (buf[offset + 3] << 8) | buf[offset + 4],
      bytes: 5,
    };
  }

  encodeWordLength(length) {
    if (length < 0x80) return Buffer.from([length]);
    if (length < 0x4000) {
      return Buffer.from([(length >> 8) | 0x80, length & 0xff]);
    }
    const out = Buffer.alloc(5);
    out[0] = 0xc0;
    out.writeUInt32BE(length >>> 0, 1);
    return out;
  }

  writeSentence(words) {
    const parts = [];
    for (const w of words) {
      const data = Buffer.from(String(w), "latin1");
      parts.push(this.encodeWordLength(data.length));
      parts.push(data);
    }
    parts.push(Buffer.from([0]));
    const frame = Buffer.concat(parts);
    if (!this.socket || this.socket.destroyed) {
      throw new Error("Socket RouterOS fermé");
    }
    return new Promise((resolve, reject) => {
      this.socket.write(frame, (err) => (err ? reject(err) : resolve()));
    });
  }

  /**
   * Repousse la reprise de la file après un échec de reconnexion.
   * SANS ce minuteur, une requête en attente d'un routeur redémarré
   * restait coincée indéfiniment : l'agent ne gelait plus visuellement
   * (aucune erreur), mais aucune autorisation ni collecte n'était plus
   * traitée. Le minuteur est unique et sans référence (unref) pour ne
   * pas maintenir le processus en vie.
   */
  scheduleRetry(delayMs) {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.drain();
    }, delayMs);
    this.retryTimer.unref?.();
  }

  cancelRetry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Requête sérialisée : une seule en vol, les autres en file
   * d'attente (au lieu d'un rejet « requête déjà en vol » qui faisait
   * perdre des authorize/collect sur un routeur lent).
   */
  request(words, { allowReconnect = true } = {}) {
    return new Promise((resolve, reject) => {
      const job = { words, reply: [], resolve, reject, allowReconnect, attempts: 0 };
      this.queue.push(job);
      this.drain();
    });
  }

  async drain() {
    if (this.inFlight || this.queue.length === 0) return;
    const job = this.queue.shift();

    if (job.words[0] !== "/login" && !this.isConnected() && !this.loggingIn) {
      // Routeur redémarré / connexion perdue : on se reconnecte une fois.
      try {
        await this.connect();
      } catch (err) {
        if (job.attempts >= MAX_CONNECT_ATTEMPTS) {
          // Budget de reconnexion épuisé : on rend l'erreur à l'appelant
          // (l'agent journalise l'échec et la boucle suivante retentera).
          job.reject(err);
          this.drain();
          return;
        }
        job.attempts += 1;
        // Nouvelles tentatives : le routeur met plusieurs dizaines de
        // secondes à revenir après un redémarrage, on l'attend.
        this.queue.unshift(job);
        this.scheduleRetry(
          Math.min(this.reconnectBaseDelayMs * 2 ** (job.attempts - 1), 15000)
        );
        return;
      }
    }

    this.inFlight = job;
    try {
      await this.writeSentence(job.words);
    } catch (err) {
      this.inFlight = null;
      // La connexion peut être morte ENTRE la vérification ci-dessus
      // et l'écriture (le RST d'un routeur redémarré n'arrive qu'après
      // coup) : on rejoue la requête sur une connexion neuve au lieu de
      // faire échouer une autorisation ou une collecte.
      if (isSocketError(err) && job.allowReconnect) {
        job.allowReconnect = false;
        this.forgetSocket();
        this.queue.unshift(job);
        this.drain();
        return;
      }
      job.reject(err);
      this.drain();
    }
  }

  /** Ferme la socket courante sans rejeter la file (retry en cours). */
  forgetSocket() {
    destroySocket(this.socket);
    this.socket = null;
  }

  /**
   * Authentification, dans l'ordre exact du client de référence MikroTik.
   *
   * On envoie d'abord `name` + `password` en clair et c'est le ROUTEUR qui
   * décide :
   *   • 6.43+ / 7.x → `!done` sans défi : session ouverte ;
   *   • < 6.43      → le routeur IGNORE ces identifiants et répond par un
   *                   défi (`=ret=`) : on répond alors par le MD5.
   *
   * Le hAP ac² du jour J est un 6.42.3 d'usine : il est dans le second
   * cas. Faire l'inverse (attendre un défi sur un `/login` nu, puis
   * répondre en SHA1) échoue avec « cannot log in » — sans que rien dans
   * les tests ne le montre, les doubles reproduisant la même erreur que
   * le code.
   */
  async login() {
    const reply = await this.request(
      ["/login", `=name=${this.username}`, `=password=${this.password}`],
      { allowReconnect: false }
    );
    if (this.hasError(reply)) throw new Error("Authentification RouterOS refusée");

    const ret = (reply.find((w) => w.startsWith("=ret=")) ?? "").slice(5);
    // Pas de défi = routeur récent, mot de passe accepté tel quel.
    if (!ret) return;

    const r = await this.request(
      ["/login", `=name=${this.username}`, `=response=${legacyLoginResponse(this.password, ret)}`],
      { allowReconnect: false }
    );
    if (this.hasError(r)) throw new Error("Authentification RouterOS (défi MD5) refusée");
  }

  /**
   * Exécution d'une commande de configuration quelconque, avec les
   * LIGNES renvoyées — le strict nécessaire pour configurer et
   * inspecter un routeur sans écrire une méthode par menu
   * (`/ip/firewall/filter`, `/interface/list`, `/user/group`,
   * `/system/backup/save`…). `provision.mjs` s'appuie dessus.
   *
   * Renvoyer `{ ok, rows, message }` plutôt que lever : une commande
   * refusée est un RÉSULTAT (l'outil doit pouvoir dire « le routeur a
   * refusé »), pas une panne. `add`/`set`/`move` ne renvoient pourtant
   * aucune ligne — d'où `rows: []` sans que ce soit une erreur.
   */
  async exec(command, attrs = {}, { proplist = null } = {}) {
    const words = [command];
    if (proplist) words.push(`=.proplist=${proplist}`);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === "") continue;
      words.push(`=${key}=${value}`);
    }
    const reply = await this.request(words);
    if (this.hasError(reply)) {
      return { ok: false, rows: [], message: this.errorMessage(reply) };
    }
    return { ok: true, rows: splitRows(reply), message: null };
  }

  hasError(words) {
    return words.some((w) => w.startsWith("!trap") || w.startsWith("!fatal"));
  }

  errorMessage(words) {
    const m = words.find((w) => w.startsWith("=message="));
    return m ? m.slice(9) : "Erreur RouterOS inconnue";
  }

  /** Sonde de connectivité + identifiants. */
  async connectAndPing() {
    const reply = await this.request([
      "/system/resource/print",
      "=.proplist=uptime,version,board-name",
    ]);
    if (this.hasError(reply)) {
      const message = this.errorMessage(reply);
      // Message le plus fréquent au jour J : mauvais mot de passe.
      // RouterOS répond « not logged in » puis coupe la connexion :
      // sans ce texte, l'exploitant cherche un problème réseau.
      if (/not logged in|invalid user|login/i.test(message)) {
        throw new Error(
          `Identifiants routeur refusés (${message}) — vérifiez MIKROTIK_USERNAME / ` +
            "MIKROTIK_PASSWORD dans Winbox (System > Users)."
        );
      }
      throw new Error(message);
    }
    const row = splitRows(reply)[0] ?? null;
    if (row?.version && !this.versionLogged) {
      this.versionLogged = true;
      this.log?.info?.(`[routeur] ${row["board-name"] ?? "MikroTik"} — RouterOS ${row.version}`);
    }
    return true;
  }

  async authorize({ address, comment } = {}) {
    if (!address) throw new Error("authorize: adresse requise");
    const existing = await this.findEntry({ address });
    if (existing) {
      if (comment && existing.comment !== comment) {
        const reply = await this.request([
          "/ip/firewall/address-list/set",
          `=.id=${existing.id}`,
          `=comment=${comment}`,
        ]);
        if (this.hasError(reply)) throw new Error(this.errorMessage(reply));
      }
    } else {
      const reply = await this.request([
        "/ip/firewall/address-list/add",
        `=list=${this.listName}`,
        `=address=${address}`,
        `=comment=${comment ?? ""}`,
      ]);
      if (this.hasError(reply)) throw new Error(this.errorMessage(reply));
    }
    return { reference: `${this.name}:${address}`, address };
  }

  async deauthorize({ address, comment } = {}) {
    void comment;
    const entry = await this.findEntry({ address });
    if (!entry) return false;
    const reply = await this.request(["/ip/firewall/address-list/remove", `=.id=${entry.id}`]);
    if (this.hasError(reply)) throw new Error(this.errorMessage(reply));
    return true;
  }

  /**
   * Entrée de NOTRE liste correspondant à cette adresse. La
   * correspondance se fait sur l'ADRESSE, jamais sur le commentaire :
   * deux sessions peuvent porter le même commentaire (session
   * rejouée, bail DHCP renouvelé) et supprimer l'entrée d'un autre
   * client reviendrait à lui offrir le WiFi.
   */
  async findEntry({ address, comment } = {}) {
    if (address) {
      const rows = await this.clients();
      return rows.find((r) => r.address === address) ?? null;
    }
    if (comment) {
      const rows = await this.clients();
      return rows.find((r) => r.comment === comment) ?? null;
    }
    return null;
  }

  /**
   * Baux DHCP vus par le routeur. C'est la SEULE source fiable de
   * l'adresse du client : l'application ne la connaît pas et ne doit pas
   * la connaître (invariant « aucun identifiant routeur dans l'app »).
   *
   * `active-address` est l'adresse réellement attribuée ; `address` peut être
   * une plage pour une entrée dynamique sans client. On lit les deux, la
   * résolution tranche en amont.
   */
  async dhcpLeases() {
    const reply = await this.request([
      "/ip/dhcp-server/lease/print",
      "=.proplist=address,mac-address,host-name,status,active-address,blocked,dynamic",
    ]);
    if (this.hasError(reply)) {
      // RouterOS sans serveur DHCP configuré : ce n'est pas une erreur
      // fatale, l'appelant doit juste apprendre qu'il n'y a rien à lire.
      return [];
    }
    const rows = reply.filter((r) => r && !Array.isArray(r) && r[".id"] !== undefined);
    return rows.map((r) => ({
      address: r.address ?? null,
      activeAddress: r["active-address"] ?? null,
      macAddress: r["mac-address"] ?? null,
      hostName: r["host-name"] ?? null,
      status: r.status ?? null,
      blocked: r.blocked ?? null,
      dynamic: r.dynamic ?? null,
    }));
  }

  async clients() {
    const reply = await this.request([
      "/ip/firewall/address-list/print",
      `=list=${this.listName}`,
      `=.proplist=${ADDRESS_PROPLIST}`,
    ]);
    if (this.hasError(reply)) throw new Error(this.errorMessage(reply));
    return parseAddressListRows(reply, this.listName).map((r) => ({
      id: r.id,
      address: r.address,
      comment: r.comment,
      reference: `${this.name}:${r.address}`,
    }));
  }

  /**
   * File de COMPTAGE du client — créée si absente. Condition de
   * validité de l'autorisation (sans file, le quota ne se décompte
   * jamais) : voir lib/routeros-rest.mjs pour le même contrat.
   */
  async ensureQueue({ address, comment } = {}) {
    if (!address) throw new Error("ensureQueue: adresse requise");
    const target = clientTarget(address);
    const existing = await this.findQueue(address);
    if (existing) {
      const wanted = queueNameFor(address, comment);
      // Idempotence « convergente » : on corrige le champ qui a
      // dérivé (nom OU commentaire), sans jamais dupliquer la file.
      const needsName = existing.name !== wanted;
      const needsComment = comment && existing.comment !== comment;
      if (needsName || needsComment) {
        const words = ["/queue/simple/set", `=.id=${existing.id}`];
        if (needsName) words.push(`=name=${wanted}`);
        if (needsComment) words.push(`=comment=${comment}`);
        const reply = await this.request(words);
        if (this.hasError(reply)) throw new Error(this.errorMessage(reply));
      }
      return { created: false, id: existing.id, name: wanted, target };
    }
    const name = queueNameFor(address, comment);
    const reply = await this.request([
      "/queue/simple/add",
      `=name=${name}`,
      `=target=${target}`,
      `=max-limit=${this.maxLimit}`,
      `=comment=${comment ?? ""}`,
      `=disabled=false`,
    ]);
    if (this.hasError(reply)) throw new Error(this.errorMessage(reply));
    return { created: true, id: null, name, target };
  }

  async removeQueue({ address } = {}) {
    if (!address) return false;
    const existing = await this.findQueue(address);
    if (!existing?.id) return false;
    const reply = await this.request(["/queue/simple/remove", `=.id=${existing.id}`]);
    if (this.hasError(reply)) throw new Error(this.errorMessage(reply));
    return true;
  }

  async findQueue(address) {
    // `=stats=` est INDISPENSABLE : sans cet argument de `print`,
    // RouterOS n'expose AUCUNE propriété en lecture seule. Les
    // compteurs de file (`bytes`, `total-bytes`) en font partie : sans
    // lui, la file était retrouvée mais vide de toute mesure, et le
    // quota restait figé à zéro sans le moindre signal d'erreur.
    //
    // REPLI : `=stats=` n'existe pas sur les très anciennes versions
    // (« unknown parameter »). Un hAP ac² d'usine est en 6.42 : on
    // retente alors SANS `=stats=`. Si les compteurs restent absents,
    // `parseQueueRows` marque la file `available:false` et le doctor
    // BLOQUE — on ne décompte jamais du trafic non mesuré.
    let reply = await this.request([
      "/queue/simple/print",
      "=stats=",
      `=.proplist=${QUEUE_PROPLIST}`,
    ]);
    if (this.hasError(reply)) {
      const msg = this.errorMessage(reply);
      if (!/unknown parameter|no such|no such command/i.test(msg)) {
        throw new Error(msg);
      }
      reply = await this.request(["/queue/simple/print", `=.proplist=${QUEUE_PROPLIST}`]);
      if (this.hasError(reply)) throw new Error(this.errorMessage(reply));
    }
    return parseQueueRows(reply, address);
  }

  /**
   * Compteurs CUMULÉS de la file du client. Renvoie `null` quand
   * RouterOS n'a renvoyé aucun compteur : une file non mesurée n'est
   * pas une file à zéro octet.
   */
  async queueUsage(address) {
    if (!address) return null;
    const found = await this.findQueue(address);
    if (!found || found.available === false) return null;
    return {
      bytesIn: found.bytesIn,
      bytesOut: found.bytesOut,
      reference: `${this.name}:${address}`,
    };
  }
}
