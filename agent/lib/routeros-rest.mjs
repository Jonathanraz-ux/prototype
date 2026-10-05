// ============================================================
// lib/routeros-rest.mjs — Pilote MikroTik via l'API REST RouterOS
// (>= 7.1). Zéro dépendance.
//
// !! CONTRAT HTTP RouterOS — à ne PAS inverser !!
//   GET    = print  (lire)
//   PATCH  = set    (modifier UN enregistrement)
//   PUT    = add    (CRÉER)          <-- création
//   DELETE = remove (supprimer)
//   POST   = exécuter une commande console arbitraire
//
// Le pilote utilisait POST pour créer l'entrée d'address-list et la
// file simple : sur un routeur réel, RouterOS interprète ces URL comme
// des CHEMINS DE COMMANDES (`no such command or directory`), donc
// rien n'était créé. Comme l'autorisation est refusée dès qu'un objet
// routeur manque (règle d'or : pas d'accès sans file de comptage),
// la conséquence n'était pas « un compteur en trop » mais « aucun
// client n'aurait jamais eu Internet ».
//
// Transport : `fetch` natif en HTTP, `node:https` en HTTPS.
// Le choix n'est pas esthétique : le `fetch` natif de Node IGNORE
// l'option `agent`, donc `rejectUnauthorized: false` n'a jamais été
// appliqué. Or un routeur MikroTik présente un certificat AUTO-SIGNÉ :
// en MIKROTIK_TLS=true, la connexion échouait systématiquement sur
// SELF_SIGNED_CERT_IN_CHAIN. node:https applique réellement
// l'option de vérification et le délai d'attente.
//
// Cycle de vie d'une session autorisée (2 objets routeur) :
//   1. /ip/firewall/address-list  → le client est « dans la liste »
//      (c'est cette liste que référencent les règles firewall de
//      l'avant-projet MikroTik) ;
//   2. /queue/simple              → la file de COMPTAGE du client.
//      SANS elle, aucun octet n'est remonté par l'agent et le quota
//      ne se décompte jamais : elle fait donc partie intégrante de
//      l'autorisation (échec = autorisation refusée), jamais un
//      best-effort silencieux.
//
// Les deux opérations sont IDEMPOTENTES : une reconnexion, une
// reprise de session ou un doublon de commande ne créent ni double
// entrée ni double file.
// ============================================================

import { request as httpsRequest } from "node:https";
import {
  clientTarget,
  countersFromQueueRow,
  queueNameFor,
  queueTargetStrings,
  rowTargetsAddress,
} from "./router-targets.mjs";

const DEFAULT_LIST = "wz-active";
/** File sans limitation de débit : elle ne fait que compter. */
const UNLIMITED = "0/0";
/** Sans réponse en 12 s, on considère le routeur injoignable. */
const REQUEST_TIMEOUT_MS = 12000;
/**
 * Propriétés demandées sur /queue/simple. `bytes` est la propriété
 * documentée (composite "upload/download") : c'est elle qu'il faut
 * lire, `bytes-in`/`bytes-out` n'existent PAS sur ce menu (ces noms
 * sont ceux du SNMP) et une demande de propriété inconnue est
 * simplement ignorée par RouterOS.
 */
const QUEUE_PROPLIST = ".id,name,target,comment,bytes,total-bytes";

export class RouterOSRest {
  constructor({
    host,
    username,
    password,
    tls = false,
    portRest = null,
    listName = DEFAULT_LIST,
    maxLimit = UNLIMITED,
    httpsRequestImpl = null,
    log = null,
  }) {
    this.name = "mikrotik-rest";
    this.host = host;
    this.username = username;
    this.password = password;
    this.tls = tls;
    // REST RouterOS écoute sur 80 en HTTP et 443 en HTTPS : ne
    // jamais hériter 443 d'un mode non chiffré (connexion refusée).
    this.port = portRest ?? (tls ? 443 : 80);
    this.listName = listName;
    this.maxLimit = maxLimit;
    // Point d'injection pour les tests : seule façon de vérifier le
    // câblage HTTPS sans certificat réel.
    this.httpsRequest = httpsRequestImpl ?? httpsRequest;
    this.log = log;
    this.versionLogged = false;
  }

  base() {
    const proto = this.tls ? "https" : "http";
    return `${proto}://${this.host}:${this.port}/rest`;
  }

  headers() {
    const basic = Buffer.from(`${this.username}:${this.password}`).toString("base64");
    return {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Transport HTTPS : `node:https` est le SEUL moyen d'accepter le
   * certificat auto-signé d'un routeur MikroTik. Le délai d'attente est
   * posé sur la requête : sans lui, un routeur en panne laisserait
   * l'agent bloqué jusqu'au timeout du système.
   */
  requestViaHttps(method, url, payload) {
    return new Promise((resolve, reject) => {
      const req = this.httpsRequest(
        url,
        {
          method,
          headers: this.headers(),
          rejectUnauthorized: false,
          timeout: REQUEST_TIMEOUT_MS,
        },
        (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () =>
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              text: async () => data,
            })
          );
          res.on("error", reject);
        }
      );
      req.on("timeout", () => req.destroy(new Error("délai dépassé")));
      req.on("error", reject);
      if (payload !== undefined) req.write(JSON.stringify(payload));
      req.end();
    });
  }

  async request(method, path, body) {
    const url = `${this.base()}${path}`;
    let res;
    if (this.tls) {
      try {
        res = await this.requestViaHttps(method, url, body);
      } catch (err) {
        throw new Error(
          `RouterOS REST ${method} ${path} → injoignable (${this.base()}) : ${err?.message ?? err}`
        );
      }
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        res = await fetch(url, {
          method,
          headers: this.headers(),
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        // Un routeur muet ne doit pas figer la boucle de l'agent.
        throw new Error(
          `RouterOS REST ${method} ${path} → injoignable (${this.base()}) : ${err?.message ?? err}`
        );
      } finally {
        clearTimeout(timer);
      }
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const msg = Array.isArray(json)
        ? json.map((e) => e.message ?? e.detail ?? "").filter(Boolean).join("; ")
        : json?.error ?? text;
      throw new Error(`RouterOS REST ${method} ${path} → ${res.status}: ${msg}`);
    }
    return json;
  }

  /** Sonde de connectivité + identifiants. */
  async connect() {
    let res;
    try {
      res = await this.request("GET", "/system/resource");
    } catch (err) {
      // 404 = le service `www`/`www-ssl` n'expose pas /rest. C'est le
      // symptôme exact d'un routeur RouterOS 6.x, ou d'un service web
      // désactivé. Le message doit le dire : sinon l'exploitant
      // cherchera un problème de réseau pendant des heures.
      if (/\b404\b/.test(err?.message ?? "")) {
        throw new Error(
          `API REST absente sur ${this.base()} (HTTP 404). ` +
            "L'API REST RouterOS n'existe qu'à partir de RouterOS 7.1 " +
            "(et le service `www` en HTTP clair seulement à partir de 7.9). " +
            "Vérifiez la version dans Winbox > System > Resources, puis : " +
            "RouterOS 6.x → AGENT_ROUTER_PROTOCOL=api ; " +
            "RouterOS 7.x → activez le service `www-ssl` (IP > Services) et " +
            "passez MIKROTIK_TLS=true."
        );
      }
      throw err;
    }
    if (Array.isArray(res) && res.length > 0) {
      // Une seule fois que l'on tient une réponse lisible : c'est le
      // moment de dire quel routeur on pilote réellement (utile quand
      // l'IP de gestion a été changée la veille).
      const version = res[0].version;
      if (version && !this.versionLogged) {
        this.versionLogged = true;
        this.log?.info?.(`[routeur] ${res[0]["board-name"] ?? "MikroTik"} — RouterOS ${version}`);
      }
    }
    return Array.isArray(res) && res.length > 0;
  }

  async disconnect() {
    if (this.httpsAgent) this.httpsAgent.destroy();
  }

  /** Alias explicite (utilisé par `--doctor` puis la fermeture). */
  async close() {
    await this.disconnect();
  }

  /** Autorisation : le client rejoint la liste d'adresses pilotée. */
  async authorize({ address, comment } = {}) {
    if (!address) throw new Error("authorize: adresse requise");
    const existing = await this.findEntry({ address });
    if (existing) {
      if (comment && existing.comment !== comment) {
        await this.request("PATCH", `/ip/firewall/address-list/${existing[".id"]}`, { comment });
      }
    } else {
      await this.request("PUT", "/ip/firewall/address-list", {
        list: this.listName,
        address,
        comment: comment ?? "",
      });
    }
    return { reference: `${this.name}:${address}`, address };
  }

  /** Révocation : le client quitte la liste (l'agent ne SUPPRIME pas
   *  les autres listes du routeur — elles appartiennent à l'exploitant). */
  async deauthorize({ address, comment } = {}) {
    void comment;
    const entry = await this.findEntry({ address });
    if (entry) {
      await this.request("DELETE", `/ip/firewall/address-list/${entry[".id"]}`);
      return true;
    }
    return false;
  }

  /**
   * Recherche d'une entrée dans NOTRE liste. Le commentaire n'est
   * volontairement pas filtré : une entrée dont le commentaire a
   * dérivé doit rester trouvable, sinon la révocation laisserait une
   * autorisation résiduelle (le client garderait le WiFi).
   */
  async findEntry({ address } = {}) {
    let url = `/ip/firewall/address-list?list=${encodeURIComponent(this.listName)}`;
    if (address) url += `&address=${encodeURIComponent(address)}`;
    const rows = await this.request("GET", url);
    if (Array.isArray(rows) && rows.length > 0) return rows[0];
    return null;
  }

  async clients() {
    const url = `/ip/firewall/address-list?list=${encodeURIComponent(this.listName)}`;
    const rows = await this.request("GET", url);
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => r.address)
      .map((r) => ({
        address: r.address,
        comment: r.comment,
        reference: `${this.name}:${r.address}`,
      }));
  }

  /**
   * File de comptage du client — CRÉÉE SI ABSENTE.
   * Sans cette file, `queueUsage` ne trouve rien et le quota reste
   * bloqué à zéro : l'autorisation ne doit donc pas être considérée
   * comme réussie tant que la file n'existe pas.
   */
  async ensureQueue({ address, comment } = {}) {
    if (!address) throw new Error("ensureQueue: adresse requise");
    const target = clientTarget(address);
    const wanted = queueNameFor(address, comment);
    const existing = await this.findQueue(address);
    if (existing) {
      // Idempotence « convergente » : on corrige le champ qui a
      // dérivé (nom OU commentaire OU cible), sans dupliquer la file.
      // La cible est comparée APRÈS normalisation : RouterOS 7 la
      // renvoie imbriquée, une comparaison brute verrait un « drift »
      // imaginaire et réécrirait la file à chaque collecte.
      const patch = {};
      if (existing.name !== wanted) patch.name = wanted;
      if (comment && existing.comment !== comment) patch.comment = comment;
      if (!queueTargetStrings(existing).includes(target)) patch.target = target;
      if (Object.keys(patch).length > 0) {
        await this.request("PATCH", `/queue/simple/${existing[".id"]}`, patch);
      }
      return { created: false, id: existing[".id"] ?? null, name: wanted, target };
    }

    const created = await this.request("PUT", "/queue/simple", {
      name: queueNameFor(address, comment),
      target,
      "max-limit": this.maxLimit,
      comment: comment ?? "",
    });
    const row = Array.isArray(created) ? created[0] : created;
    return { created: true, id: row?.[".id"] ?? null, name: row?.name ?? null, target };
  }

  /** Supprime la file du client (libère le routeur après déconnexion). */
  async removeQueue({ address } = {}) {
    if (!address) return false;
    const existing = await this.findQueue(address);
    if (!existing) return false;
    await this.request("DELETE", `/queue/simple/${existing[".id"]}`);
    return true;
  }

  /**
   * Lignes de /queue/simple AVEC les compteurs.
   *
   * `GET /rest/queue/simple` équivaut à `/queue/simple/print` SANS
   * l'argument `stats` : les compteurs (propriétés en lecture seule)
   * n'y figurent donc pas. Comme `GET` ne permet pas de passer un
   * argument de `print`, on utilise `POST /queue/simple/print` — la
   * méthode universelle qui donne accès à toutes les commandes
   * console — en fournissant `stats` et `.proplist` dans le corps.
   *
   * On retombe sur le `GET` si le routeur refuse le `POST` : la liste
   * des files reste alors trouvable (donc aucune fuite de files), seule
   * la mesure est absente — ce que `--doctor` signale comme bloquant.
   */
  async queueRows() {
    try {
      const rows = await this.request("POST", "/queue/simple/print", {
        stats: "",
        ".proplist": QUEUE_PROPLIST,
      });
      if (Array.isArray(rows)) return rows;
    } catch {
      /* routeur sans `print` en POST : on tente le GET simple */
    }
    try {
      const rows = await this.request("GET", "/queue/simple");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  async findQueue(address) {
    const rows = await this.queueRows();
    return rows.find((q) => rowTargetsAddress(q, address)) ?? null;
  }

  /**
   * Compteurs CUMULÉS (octets) de la file du client.
   *
   * `available: false` = aucun compteur lu sur le routeur. L'agent
   * refuse alors de remonter une mesure : une file sans compteur n'est
   * pas une file à zéro octet, et la traiter comme telle facturerait
   * un client pour un trafic jamais mesuré.
   */
  async queueUsage(address) {
    if (!address) return null;
    const found = await this.findQueue(address);
    if (!found) return null;
    const { bytesIn, bytesOut, available } = countersFromQueueRow(found);
    if (!available) return null;
    return { bytesIn, bytesOut, reference: `${this.name}:${address}` };
  }
}
