// ============================================================
// main.mjs — Point d'entrée de l'agent local WiFi Zone.
// Lecture de la config, connexion au routeur (réel ou simulé),
// démarrage du moteur, arrêt gracieux.
//
//   node main.mjs            (adapter selon agent/.env)
//   node main.mjs --mock     (simulateur, aucun équipement)
// ============================================================

import { loadAgentEnv, validateConfig, formatConfig } from "./config.mjs";
import { MockRouter } from "./lib/mock-router.mjs";
import { RouterOSRest } from "./lib/routeros-rest.mjs";
import { RouterOSApi } from "./lib/routeros-api.mjs";
import { AgentEngine } from "./engine.mjs";

const MOCK_MARKER = "--mock";

const args = process.argv.slice(2);
const mock = args.includes(MOCK_MARKER);

const env = loadAgentEnv(mock ? { NETWORK_ADAPTER_TYPE: "mock" } : {});

const logging = makeLogger(env);

// Affiche la configuration de démarrage sans jamais révéler les secrets.
logging.info("WiFi Zone — agent local");
logging.info(formatConfig(env));

const errors = validateConfig(env);
if (errors.length > 0) {
  for (const e of errors) logging.error("  ✗ " + e);
  logging.error(`
Configuration incomplète.
  • Produire agent/.env à partir d'agent/.env.example.agent
  • En mode réel : NETWORK_ADAPTER_TYPE=mikrotik + identifiants.
  • Test sans équipement : .\\agent\\start.ps1 -Mock
`);
  process.exit(1);
}

const adapterType = env.NETWORK_ADAPTER_TYPE;
const router = buildRouter(adapterType, env, logging);
if (!router) {
  logging.error(`Adaptateur réseau inconnu : ${adapterType}`);
  process.exit(1);
}

logging.info(`[routeur] ${router.name}${adapterType === "mock" ? " (mode simulation)" : ""}`);
if (adapterType === "mikrotik") {
  try {
    const ok = await router.connect();
    logging.info(`[routeur] connecté à ${env.MIKROTIK_HOST} (${ok ? "OK" : "réponse pas comprise"})`);
  } catch (err) {
    // le moteur retentera à chaque battement
    logging.warn(`[routeur] connexion initiale échouée : ${err?.message ?? err}`);
  }
}

const engine = new AgentEngine({ env, router, log: logging });
engine.start();

const shutdown = async (signal) => {
  logging.info(`[agent] signal ${signal} reçu, arrêt gracieux…`);
  try {
    await engine.stop();
  } catch (err) {
    logging.warn(`[agent] arrêt imparfait : ${err?.message ?? err}`);
  }
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function buildRouter(type, env, log) {
  if (type === "mock") {
    return new MockRouter({
      listName: env.WIFI_LIST_NAME,
      bytesPerSec: env.int("AGENT_MOCK_BYTES_PER_SEC") ?? 120000,
    });
  }
  const common = {
    host: env.MIKROTIK_HOST,
    username: env.MIKROTIK_USERNAME,
    password: env.MIKROTIK_PASSWORD,
    listName: env.WIFI_LIST_NAME,
  };
  if (env.AGENT_ROUTER_PROTOCOL === "rest") {
    return new RouterOSRest({
      ...common,
      tls: env.bool("MIKROTIK_TLS"),
      portRest: env.int("MIKROTIK_PORT_REST") ?? 443,
    });
  }
  return new RouterOSApi({
    ...common,
    tlsEnabled: env.bool("MIKROTIK_TLS"),
    portApi: env.int("MIKROTIK_PORT_API") ?? 8728,
  });
}

function makeLogger(env) {
  const debug = String(env.AGENT_DEBUG ?? "").toLowerCase() === "true";
  const out = (...parts) => console.log(...parts);
  return {
    level: debug ? "debug" : "log",
    debug: (...parts) => { if (debug) out("[DBG]", ...parts); },
    info: (...parts) => out("[INFO]", ...parts),
    warn: (...parts) => out("[WARN]", ...parts),
    error: (...parts) => out("[ERR]", ...parts),
  };
}