// ============================================================
// lib/routeros-rest.mjs — Pilote MikroTik via l'API REST RouterOS
// (>= 6.47, hAP ac² capable après mise à jour). zéro dépendance :
// fetch natif + https.Agent (certificat auto-signé toléré quand
// MIKROTIK_TLS est activé).
//
// Les payloads s'appuient sur l'address-list et une simple queue
// par client pour les compteurs. Le parcage reste permissif :
// bytes-in / bytes-out / total-bytes / rx-bytes / tx-bytes…
// ============================================================

import { Agent } from "node:https";

const DEFAULT_LIST = "wz-active";

export class RouterOSRest {
  constructor({ host, username, password, tls = false, portRest = 443, listName = DEFAULT_LIST }) {
    this.name = "mikrotik-rest";
    this.host = host;
    this.username = username;
    this.password = password;
    this.tls = tls;
    this.port = portRest;
    this.listName = listName;
    this.httpsAgent = tls ? new Agent({ rejectUnauthorized: false }) : undefined;
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

  async request(method, path, body) {
    const url = `${this.base()}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
      agent: this.httpsAgent,
    });
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

  async connect() {
    const ok = await this.request("GET", "/system/resource");
    return Array.isArray(ok) && ok.length > 0;
  }

  async disconnect() {
    // sans état, rien à fermer localement
  }

  async authorize({ address, comment } = {}) {
    if (!address) throw new Error("authorize: adresse requise");
    // Coupe dure : ajout dans l'address-list dédiée (idempotent).
    const existing = await this.findEntry({ address });
    if (existing) {
      await this.request("PATCH", `/ip/firewall/address-list/${existing[".id"]}`, { comment });
    } else {
      await this.request("POST", "/ip/firewall/address-list", {
        list: this.listName,
        address,
        comment,
      });
    }
    return { reference: `${this.name}:${address}`, address };
  }

  async deauthorize({ address, comment } = {}) {
    const entry = await this.findEntry({ address, comment });
    if (entry) {
      await this.request("DELETE", `/ip/firewall/address-list/${entry[".id"]}`);
      return true;
    }
    return false;
  }

  async findEntry({ address, comment } = {}) {
    let url = `/ip/firewall/address-list?list=${encodeURIComponent(this.listName)}`;
    if (address) url += `&address=${encodeURIComponent(address)}`;
    if (comment) url += `&comment=${encodeURIComponent(comment)}`;
    const rows = await this.request("GET", url);
    if (Array.isArray(rows) && rows.length > 0) return rows[0];
    return null;
  }

  async clients() {
    const url = `/ip/firewall/address-list?list=${encodeURIComponent(this.listName)}`;
    const rows = await this.request("GET", url);
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      address: r.address,
      comment: r.comment,
      reference: `${this.name}:${r.address}`,
    }));
  }

  async queueUsage(address) {
    if (!address) return null;
    const rows = await this.request("GET", `/queue/simple`);
    const list = Array.isArray(rows) ? rows : [];
    const found = list.find(
      (q) =>
        (q.target || q["target-address"] || "").slice(0, (q.target || "").length) === address ||
        (q.target || q["target-address"] || "").startsWith(`${address}/`) ||
        (q.tags || []).includes(`wz:${address}`)
    ) ?? list.find((q) => (q.target || q["target-address"] || "") === address);
    if (!found) return null;

    return {
      bytesIn: parseCounter(found["bytes-in"] ?? found["rx-bytes"] ?? found["total-bytes"]),
      bytesOut: parseCounter(found["bytes-out"] ?? found["tx-bytes"] ?? found["total-bytes"]),
      reference: `${this.name}:${address}`,
    };
  }
}

function parseCounter(value) {
  if (typeof value === "number") return Math.max(0, Math.floor(value));
  if (typeof value === "string") {
    const clean = value.replace(/,/g, "").trim();
    const n = Number(clean);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
  }
  return 0;
}