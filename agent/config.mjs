// ============================================================
// config.mjs — Lecture/validation de l'environnement de l'agent.
// Aucun secret en clair dans le dépôt : tout vient de .env / env.
//
// Deux pièges classiques sont traités ici explicitement :
//   1. REST RouterOS écoute sur 80 en HTTP et 443 en HTTPS. Le
//      couple (MIKROTIK_TLS=false, MIKROTIK_PORT_REST=443) est
//      INVALIDE et échouait au jour J : le port est donc déduit du
//      TLS quand il n'est pas fourni, et l'incohérence est signalée.
//   2. Un mot de passe / secret laissé à « changez-moi » est refusé
//      en mode mikrotik : mieux vaut un démarrage refusé qu'un agent
//      qui applicable des droits trop larges ou signe des commandes
//      en clair.
// ============================================================

import { readFileSync } from "node:fs";

const DEFAULTS = {
  SUPABASE_URL: "",
  AGENT_TOKEN: "",
  NETWORK_HMAC_SECRET: "",
  NETWORK_ADAPTER_TYPE: "mock",
  AGENT_ROUTER_PROTOCOL: "rest",
  MIKROTIK_HOST: "",
  MIKROTIK_USERNAME: "",
  MIKROTIK_PASSWORD: "",
  MIKROTIK_TLS: "false",
  MIKROTIK_PORT_REST: "",
  MIKROTIK_PORT_API: "8728",
  MIKROTIK_MAX_LIMIT: "0/0",
  WIFI_LIST_NAME: "wz-active",
  AGENT_FETCH_INTERVAL_MS: "2000",
  AGENT_PING_INTERVAL_MS: "15000",
  AGENT_COLLECT_INTERVAL_MS: "10000",
  AGENT_EXPIRE_INTERVAL_MS: "20000",
  AGENT_MOCK_BYTES_PER_SEC: "120000",
  AGENT_DEBUG: "false",
};

/**
 * @param {object} overrides  valeurs forcées (priorité maximale)
 * @param {object} [options]
 * @param {boolean} [options.useDotEnv=true]  lire agent/.env.
 *   Les tests passent `false` : la suite ne doit JAMAIS dépendre du
 *   .env local du développeur (ni faire fuiter ses secrets).
 */
export function loadAgentEnv(overrides = {}, { useDotEnv = true } = {}) {
  const merged = { ...DEFAULTS };
  // agent/.env est lu automatiquement (sans dépendance) pour que
  // `node main.mjs` fonctionne sans `--env-file`. Priorité :
  // DEFAULTS < agent/.env < variables d'environnement < overrides.
  if (useDotEnv) {
    for (const [key, value] of readDotEnv()) {
      if (key in merged) merged[key] = value;
    }
  }
  for (const key of Object.keys(merged)) {
    if (process.env[key] !== undefined) merged[key] = process.env[key];
  }
  Object.assign(merged, overrides);

  return {
    ...merged,
    bool: (key) => String(merged[key] ?? "").toLowerCase() === "true",
    int: (key) => {
      const n = Number(merged[key]);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    },
    /** Port REST effectif : celui de l.env s'il est cohérent, sinon celui du TLS. */
    restPort: () => resolveRestPort(merged),
    /** Port API binaire effectif. */
    apiPort: () => Number(merged.MIKROTIK_PORT_API) || 8728,
  };
}

const PLACEHOLDER = "changez-moi";

/**
 * Lecteur .env minimaliste (sans dépendance) : `CLE=valeur`,
 * `#` commentaire, guillemets optionnels, `export` toléré.
 * Ne lit que les clés connues et ne lève jamais d'exception —
 * un .env mal formé ne doit pas empêcher l'agent de démarrer.
 */
export function readDotEnv(file = new URL("./.env", import.meta.url)) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out.push([key, value]);
  }
  return out;
}

/** 80 en HTTP, 443 en HTTPS — sauf port explicite ET cohérent. */
export function resolveRestPort(env) {
  const explicit = Number(env.MIKROTIK_PORT_REST);
  const tls = String(env.MIKROTIK_TLS ?? "").toLowerCase() === "true";
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  return tls ? 443 : 80;
}

/** true si le couple (TLS, port) ne peut pas fonctionner. */
export function restPortMismatch(env) {
  const port = resolveRestPort(env);
  const tls = String(env.MIKROTIK_TLS ?? "").toLowerCase() === "true";
  if (!tls && port === 443) return "MIKROTIK_TLS=false demande le port 80 (REST HTTP), pas 443";
  if (tls && port === 80) return "MIKROTIK_TLS=true demande le port 443 (REST HTTPS), pas 80";
  return null;
}

export function validateConfig(env) {
  const errors = [];

  if (!env.SUPABASE_URL) errors.push("SUPABASE_URL manquant");
  if (!env.AGENT_TOKEN || env.AGENT_TOKEN === PLACEHOLDER) {
    errors.push("AGENT_TOKEN manquant ou non modifié");
  }

  const adapter = env.NETWORK_ADAPTER_TYPE;
  if (adapter !== "mock" && adapter !== "mikrotik") {
    errors.push(`NETWORK_ADAPTER_TYPE invalide : ${adapter}`);
  }
  if (adapter === "mikrotik") {
    if (!env.MIKROTIK_HOST) errors.push("MIKROTIK_HOST manquant (mode mikrotik)");
    if (!env.MIKROTIK_USERNAME) errors.push("MIKROTIK_USERNAME manquant");
    // Un mot de passe VIDE est la configuration d'usine des hAP
    // (hAP ac² livré sans mot de passe sur l'étiquette). Le refuser
    // ferait refuser de démarrer l'agent sur le routeur même qui
    // fonctionne. Seul le gabarit reste bloquant.
    if (env.MIKROTIK_PASSWORD === PLACEHOLDER) {
      errors.push("MIKROTIK_PASSWORD encore à « changez-moi »");
    }
    if (!env.NETWORK_HMAC_SECRET || env.NETWORK_HMAC_SECRET === PLACEHOLDER) {
      errors.push("NETWORK_HMAC_SECRET requis en mode mikrotik (vérification des commandes)");
    }
    const proto = env.AGENT_ROUTER_PROTOCOL;
    if (proto !== "rest" && proto !== "api") {
      errors.push(`AGENT_ROUTER_PROTOCOL invalide : ${proto}`);
    }
    const mismatch = restPortMismatch(env);
    if (mismatch) errors.push(mismatch);
  }

  const list = env.WIFI_LIST_NAME;
  if (!list) {
    errors.push("WIFI_LIST_NAME manquant");
  } else if (!/^[A-Za-z0-9_-]{1,32}$/.test(list)) {
    errors.push(`WIFI_LIST_NAME invalide : « ${list} » (lettres, chiffres, - et _ ; 32 car. max)`);
  }

  for (const k of [
    "AGENT_FETCH_INTERVAL_MS",
    "AGENT_PING_INTERVAL_MS",
    "AGENT_COLLECT_INTERVAL_MS",
    "AGENT_EXPIRE_INTERVAL_MS",
  ]) {
    if (env.int(k) === null) errors.push(`${k} doit être un entier > 0`);
  }

  return errors;
}

export function formatConfig(env) {
  return {
    supabaseUrl: env.SUPABASE_URL,
    adapter: env.NETWORK_ADAPTER_TYPE,
    protocol: env.AGENT_ROUTER_PROTOCOL,
    routerHost: env.MIKROTIK_HOST || "(aucun)",
    restEndpoint:
      env.NETWORK_ADAPTER_TYPE === "mikrotik" && env.AGENT_ROUTER_PROTOCOL === "rest"
        ? `${env.MIKROTIK_TLS === "true" ? "https" : "http"}://${env.MIKROTIK_HOST}:${resolveRestPort(env)}/rest`
        : undefined,
    apiEndpoint:
      env.NETWORK_ADAPTER_TYPE === "mikrotik" && env.AGENT_ROUTER_PROTOCOL === "api"
        ? `${env.MIKROTIK_TLS === "true" ? "tls" : "tcp"}://${env.MIKROTIK_HOST}:${env.MIKROTIK_PORT_API}`
        : undefined,
    list: env.WIFI_LIST_NAME,
    maxLimit: env.MIKROTIK_MAX_LIMIT,
    fetchMs: env.int("AGENT_FETCH_INTERVAL_MS"),
    pingMs: env.int("AGENT_PING_INTERVAL_MS"),
    collectMs: env.int("AGENT_COLLECT_INTERVAL_MS"),
    expireMs: env.int("AGENT_EXPIRE_INTERVAL_MS"),
    hmac: env.NETWORK_HMAC_SECRET ? `configuré (len=${env.NETWORK_HMAC_SECRET.length})` : "ABSENT",
  };
}
