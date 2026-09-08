// ============================================================
// config.mjs — Lecture/validation de l'environnement de l'agent.
// Aucun secret en clair dans le dépôt : tout vient de .env / env.
// ============================================================

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
  MIKROTIK_PORT_REST: "443",
  MIKROTIK_PORT_API: "8728",
  WIFI_LIST_NAME: "wz-active",
  AGENT_FETCH_INTERVAL_MS: "2000",
  AGENT_PING_INTERVAL_MS: "15000",
  AGENT_COLLECT_INTERVAL_MS: "10000",
  AGENT_EXPIRE_INTERVAL_MS: "20000",
  AGENT_MOCK_BYTES_PER_SEC: "120000",
};

export function loadAgentEnv(overrides = {}) {
  const merged = { ...clone(DEFAULTS) };
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
  };
}

export function validateConfig(env) {
  const errors = [];

  if (!env.SUPABASE_URL) errors.push("SUPABASE_URL manquant");
  if (!env.AGENT_TOKEN || env.AGENT_TOKEN === "changez-moi") {
    errors.push("AGENT_TOKEN manquant ou non modifié");
  }

  const adapter = env.NETWORK_ADAPTER_TYPE;
  if (adapter !== "mock" && adapter !== "mikrotik") {
    errors.push(`NETWORK_ADAPTER_TYPE invalide : ${adapter}`);
  }
  if (adapter === "mikrotik") {
    if (!env.MIKROTIK_HOST) errors.push("MIKROTIK_HOST manquant (mode mikrotik)");
    if (!env.MIKROTIK_USERNAME) errors.push("MIKROTIK_USERNAME manquant");
    if (!env.NETWORK_HMAC_SECRET || env.NETWORK_HMAC_SECRET === "changez-moi") {
      errors.push("NETWORK_HMAC_SECRET requis en mode mikrotik (vérification des commandes)");
    }
    const proto = env.AGENT_ROUTER_PROTOCOL;
    if (proto !== "rest" && proto !== "api") {
      errors.push(`AGENT_ROUTER_PROTOCOL invalide : ${proto}`);
    }
  }
  if (adapter === "mock") {
    if (env.NETWORK_HMAC_SECRET && env.NETWORK_HMAC_SECRET !== "changez-moi") {
      // la vérification sera faite si la clé est présente
    }
  }

  const list = env.WIFI_LIST_NAME;
  if (!list) errors.push("WIFI_LIST_NAME manquant");

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

function clone(obj) {
  return { ...obj };
}

export function formatConfig(env) {
  return {
    supabaseUrl: env.SUPABASE_URL,
    adapter: env.NETWORK_ADAPTER_TYPE,
    protocol: env.AGENT_ROUTER_PROTOCOL,
    routerHost: env.MIKROTIK_HOST || "(aucun)",
    list: env.WIFI_LIST_NAME,
    fetchMs: env.int("AGENT_FETCH_INTERVAL_MS"),
    pingMs: env.int("AGENT_PING_INTERVAL_MS"),
    collectMs: env.int("AGENT_COLLECT_INTERVAL_MS"),
    expireMs: env.int("AGENT_EXPIRE_INTERVAL_MS"),
    hmac: env.NETWORK_HMAC_SECRET ? "configuré (len=" + env.NETWORK_HMAC_SECRET.length + ")" : "ABSENT",
  };
}