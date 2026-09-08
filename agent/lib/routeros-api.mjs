// ============================================================
// lib/routeros-api.mjs — Client binaire API RouterOS (protocole
// mots, node:net/node:tls, zéro dépendance). Adaptateur SECONDAIRE :
// l'API REST est recommandée pour le test (hAP ac²).
//
// Implémente : encodage longueur (1/2/5 octets), login challenge
// (0x00+password+challenge → sha1 hex), listes d'adresses et
// compteurs simples.
// ============================================================

import net from "node:net";
import tls from "node:tls";
import { createHash } from "node:crypto";

const DEFAULT_LIST = "wz-active";

export class RouterOSApi {
  constructor({ host, username, password, tlsEnabled = false, portApi = 8728, listName = DEFAULT_LIST }) {
    this.name = "mikrotik-api";
    this.host = host;
    this.username = username;
    this.password = password;
    this.tls = tlsEnabled;
    this.port = portApi;
    this.listName = listName;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = null;
    this._log = (...args) => {};
  }

  connect() {
    return new Promise((resolve, reject) => {
      const onReady = async () => {
        try {
          await this.login();
          resolve(true);
        } catch (err) {
          reject(err);
        }
      };
      if (this.tls) {
        const sock = tls.connect(this.port, this.host, { rejectUnauthorized: false }, onReady);
        sock.on("error", reject);
        this.socket = sock;
      } else {
        const sock = net.createConnection({ host: this.host, port: this.port }, onReady);
        sock.on("error", reject);
        this.socket = sock;
      }
      this.attachData();
    });
  }

  attachData() {
    this.socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.parsePending();
    });
    this.socket.on("close", () => {
      if (this.pending) {
        const p = this.pending;
        this.pending = null;
        p.reject(new Error("Connexion RouterOS fermée"));
      }
    });
  }

  disconnect() {
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
  }

  parsePending() {
    while (this.pending && this.buffer.length > 0) {
      const sentence = this.tryReadSentence();
      if (sentence === null) break;
      const p = this.pending;
      this.pending = null;
      p.resolve(sentence);
    }
  }

  /** Tente de lire UNE sentence complète depuis le tampon ; null si incomplète. */
  tryReadSentence() {
    let offset = 0;
    const words = [];
    while (true) {
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
    if (b0 === 0xc0) {
      if (offset + 5 > buf.length) return null;
      return {
        length:
          (buf[offset + 1] << 24) | (buf[offset + 2] << 16) | (buf[offset + 3] << 8) | buf[offset + 4],
        bytes: 5,
      };
    }
    // 0xF1..0xFF : 4 octets de longueur 32 bits (2 haut bits combinés)
    if (offset + 5 > buf.length) return null;
    return {
      length: (buf[offset + 1] << 24) | (buf[offset + 2] << 16) | (buf[offset + 3] << 8) | buf[offset + 4],
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

  request(words) {
    return new Promise(async (resolve, reject) => {
      if (this.pending) return reject(new Error("Requête RouterOS déjà en vol"));
      this.pending = {
        resolve,
        reject: (err) => {
          this.pending = null;
          reject(err);
        },
      };
      try {
        await this.writeSentence(words);
        // la résolution arrive dans parsePending (event data)
      } catch (err) {
        this.pending = null;
        reject(err);
      }
    });
  }

  async login() {
    const reply = await this.request(["/login"]);
    if (this.hasError(reply)) {
      // méthode simple (anciennes versions)
      const r2 = await this.request(["/login", `=name=${this.username}`, `=password=${this.password}`]);
      if (this.hasError(r2)) throw new Error("Authentification RouterOS refusée");
      return;
    }
    const ret = (reply.find((w) => w.startsWith("=ret=")) ?? "").slice(5);
    if (!ret) throw new Error("RouterOS n'a pas fourni de challenge");
    const challenge = Buffer.from(ret, "hex");
    const response = createHash("sha1")
      .update(Buffer.concat([Buffer.from([0]), Buffer.from(this.password, "latin1"), challenge]))
      .digest("hex");
    const r = await this.request(["/login", `=name=${this.username}`, `=response=${response}`]);
    if (this.hasError(r)) throw new Error("Authentification RouterOS (challenge) refusée");
  }

  hasError(words) {
    return words.some((w) => w.startsWith("!trap") || w.startsWith("!fatal"));
  }

  errorMessage(words) {
    const m = words.find((w) => w.startsWith("=message="));
    return m ? m.slice(9) : "Erreur RouterOS inconnue";
  }

  async authorize({ address, comment } = {}) {
    if (!address) throw new Error("authorize: adresse requise");
    const reply = await this.request([
      "/ip/firewall/address-list/add",
      `=list=${this.listName}`,
      `=address=${address}`,
      `=comment=${comment ?? ""}`,
    ]);
    if (this.hasError(reply)) throw new Error(this.errorMessage(reply));
    return { reference: `${this.name}:${address}`, address };
  }

  async deauthorize({ address, comment } = {}) {
    const entry = await this.findEntry({ address, comment });
    if (!entry) return false;
    const reply = await this.request(["/ip/firewall/address-list/remove", `=.id=${entry.id}`]);
    if (this.hasError(reply)) throw new Error(this.errorMessage(reply));
    return true;
  }

  async findEntry({ address, comment } = {}) {
    const rows = await this.clients();
    return (
      rows.find((r) => comment && r.comment === comment) ??
      rows.find((r) => address && r.address === address) ??
      null
    );
  }

  async clients() {
    const reply = await this.request(["/ip/firewall/address-list/print"]);
    const rows = [];
    let current = null;
    for (const w of reply) {
      if (w === "!re" || w === "!done") {
        if (current) rows.push(current);
        if (w === "!done") break;
        current = { id: null, address: "", comment: "" };
        continue;
      }
      if (!current) continue;
      if (w.startsWith("=.id=")) current.id = w.slice(5);
      else if (w.startsWith("=address=")) current.address = w.slice(9);
      else if (w.startsWith("=comment=")) current.comment = w.slice(9);
    }
    return rows.filter((r) => r.address && r.list !== "none");
  }

  async queueUsage(address) {
    if (!address) return null;
    const reply = await this.request(["/queue/simple/print"]);
    const rows = [];
    let current = null;
    for (const w of reply) {
      if (w === "!re" || w === "!done") {
        if (current) rows.push(current);
        if (w === "!done") break;
        current = { target: "", bytesIn: 0, bytesOut: 0 };
        continue;
      }
      if (!current) continue;
      if (w.startsWith("=target=")) current.target = w.slice(8);
      else if (w.startsWith("=total-rx-bytes=")) current.bytesIn = parseInt(w.slice(16), 10) || 0;
      else if (w.startsWith("=total-tx-bytes=")) current.bytesOut = parseInt(w.slice(16), 10) || 0;
      else if (w.startsWith("=rx-bytes=")) current.bytesIn = parseInt(w.slice(10), 10) || 0;
      else if (w.startsWith("=tx-bytes=")) current.bytesOut = parseInt(w.slice(10), 10) || 0;
      else if (w.startsWith("=bytes-in=")) current.bytesIn = parseInt(w.slice(10), 10) || 0;
      else if (w.startsWith("=bytes-out=")) current.bytesOut = parseInt(w.slice(11), 10) || 0;
      else if (w.startsWith("=total-bytes=")) {
        const v = parseInt(w.slice(13), 10) || 0;
        if (current.bytesIn === 0) current.bytesIn = v;
        else if (current.bytesOut === 0) current.bytesOut = v;
      }
    }
    const found =
      rows.find((row) => (row.target.startsWith(`${address}/`) || row.target === address || row.target.startsWith(`${address},`))) ?? null;
    if (!found) return null;
    return {
      bytesIn: found.bytesIn,
      bytesOut: found.bytesOut,
      reference: `${this.name}:${address}`,
    };
  }
}