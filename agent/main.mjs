// ============================================================
// main.mjs — Point d'entrée de l'agent local WiFi Zone.
// Lecture de la config, connexion au routeur (réel ou simulé),
// démarrage du moteur, arrêt gracieux.
//
//   node main.mjs            (adaptateur selon agent/.env)
//   node main.mjs --mock     (simulateur, aucun équipement)
//   node main.mjs --doctor   (contrôle pré-vol, puis QUITTE)
// ============================================================

import { loadAgentEnv, validateConfig, formatConfig } from "./config.mjs";
import { MockRouter } from "./lib/mock-router.mjs";
import { RouterOSRest } from "./lib/routeros-rest.mjs";
import { RouterOSApi } from "./lib/routeros-api.mjs";
import { AgentEngine } from "./engine.mjs";
import { runDoctor } from "./doctor.mjs";

const MOCK_MARKER = "--mock";
const DOCTOR_MARKER = "--doctor";

const args = process.argv.slice(2);
const mock = args.includes(MOCK_MARKER);
const doctor = args.includes(DOCTOR_MARKER);

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
  • Contrôle complet avant branchement : node main.mjs --doctor
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

// Mode doctor : contrôles complets puis sortie, sans démarrer les
// boucles de fond (un simple contrôle ne doit piloter aucune session).
if (doctor) {
  const report = await runDoctor({ env, router, log: logging });
  try {
    await router.close?.();
  } catch {
    /* fermeture sans importance ici */
  }
  // Node 24 + undici sous Windows : un process.exit() effectué juste
  // après un fetch provoque un double uv_close → « Assertion failed »
  // ET un code de sortie aberrant (-1073740791) au lieu de 0/1. Un
  // pré-vol qui réussit ne doit surtout pas paraître en échec.
  // On fixe donc le code de sortie et on laisse le processus se
  // terminer proprement ; le chien de garde, sans référence, ne sert
  // qu'en cas de poignée résiduelle.
  process.exitCode = report.ok ? 0 : 1;
  const watchdog = setTimeout(() => process.exit(process.exitCode ?? 0), 2000);
  watchdog.unref?.();
} else {
  // Suite du programme : le moteur ne doit démarrer QUE hors mode
  // doctor. Sans ce bloc, un pré-vol lançait brièvement les boucles de
  // l'agent (autorisations, collectes) alors qu'il n'a qu'un droit de
  // lecture-écriture ponctuel sur le routeur.
  if (adapterType === "mikrotik") {
    try {
      const res = await router.connect();
      logging.info(`[routeur] connecté à ${env.MIKROTIK_HOST} (${res ? "OK" : "réponse pas comprise"})`);
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
    // Node 24 + undici + Windows : un process.exit() brutal après les
    // appels réseau du moteur provoque une assertion libuv et un code de
    // sortie aberrant (voir le mode doctor plus haut). Même traitement.
    process.exitCode = 0;
    const watchdog = setTimeout(() => process.exit(0), 2000);
    watchdog.unref?.();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

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
      portRest: env.restPort(),
      log,
    });
  }
  return new RouterOSApi({
    ...common,
    tlsEnabled: env.bool("MIKROTIK_TLS"),
    portApi: env.apiPort(),
    log,
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