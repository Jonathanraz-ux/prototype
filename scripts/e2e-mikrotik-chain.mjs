// ============================================================
// scripts/e2e-mikrotik-chain.mjs — Validation bout-en-bout de la
// chaîne MikroTik SANS équipement réel : l'agent utilise un
// MockRouter (compteurs simulés).
//
//   NETWORK_HMAC_SECRET=<secret-serveur> AGENT_TOKEN=<token-agent> \
//   [EXEC_AGENT=1] node scripts/e2e-mikrotik-chain.mjs
//
// Clés lues depuis .env (EXPO_PUBLIC_SUPABASE_URL/ANON_KEY,
// EXPO_PUBLIC_DEMO_PASSWORD, EXPO_PUBLIC_DEFAULT_SITE_ID) avec
// surcharges par variables d'environnement. Aucun secret en dur.
//
// Flux validé :
//   JWT utilisateur → request-wifi-session (begin_network_session SQL)
//   → enqueue_network_command(authorize signé) → agent → MockRouter
//   → agent-command-result (sets router_session_reference)
//   → quota-status = active → compteurs agent-collect → end-wifi-session.
//
// NOTE : le test S'INSRIT dans le vrai projet Supabase ; il crée une
// vraie session (quota démo 5 Go). Les sessions sont soldées en fin de
// test. N'exécuter que sur l'environnement de TEST.
// ============================================================

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentEngine } from "../agent/engine.mjs";
import { MockRouter } from "../agent/lib/mock-router.mjs";
import { callFunction } from "../agent/http.mjs";
import { loadAgentEnv } from "../agent/config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const envRaw = readFileSync(join(ROOT, ".env"), "utf8");
const getEnv = (k) => {
  const m = envRaw.match(new RegExp(`^${k}=(.+)$`, "m"));
  return m ? m[1].trim() : "";
};
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? getEnv("EXPO_PUBLIC_SUPABASE_URL");
const BASE = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1`;
const PUBLIC =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? getEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY");

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@wifizone.app";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? getEnv("EXPO_PUBLIC_DEMO_PASSWORD");
const SITE_ID = process.env.SITE_ID ?? getEnv("EXPO_PUBLIC_DEFAULT_SITE_ID");

if (!SUPABASE_URL || !PUBLIC || !DEMO_PASSWORD || !SITE_ID) {
  console.error("Clés manquantes : renseignez .env (ou les variables dédiées).");
  process.exit(1);
}

const HMAC_SECRET = process.env.NETWORK_HMAC_SECRET;
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const EXEC_AGENT = process.env.EXEC_AGENT === "1";

let failures = 0;
function check(name, ok, detail = "") {
  const icon = ok ? "✅" : "❌";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function env(name) {
  const m = process.env[name] ?? "";
  return m.replace(/^"|"$/g, "");
}

async function post(name, body, token) {
  return callFunction({
    baseUrl: BASE,
    token,
    name,
    body,
    timeoutMs: 30000,
  });
}

async function demoUserJwt() {
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: PUBLIC,
    },
    body: JSON.stringify({
      grant_type: "password",
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description ?? data?.msg ?? `HTTP ${res.status}`);
  return data.access_token;
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Démarrage moteur/serveur simulé -------------------------
let engine;
async function startAgent() {
  const mockRouter = new MockRouter({ bytesPerSec: 120000 });
  const agentEnv = loadAgentEnv({
    SUPABASE_URL,
    AGENT_TOKEN,
    NETWORK_HMAC_SECRET: HMAC_SECRET ?? "",
    AGENT_FETCH_INTERVAL_MS: "1500",
    AGENT_PING_INTERVAL_MS: "15000",
    AGENT_COLLECT_INTERVAL_MS: "1500",
    AGENT_EXPIRE_INTERVAL_MS: "30000",
    AGENT_MOCK_BYTES_PER_SEC: "120000",
    NETWORK_ADAPTER_TYPE: "mock",
    WIFI_LIST_NAME: "wz-active",
  });
  engine = new AgentEngine({
    env: agentEnv,
    router: mockRouter,
  });
  engine.start();
  return mockRouter;
}

// ---- Test ----------------------------------------------------
async function main() {
  console.log(`Cible : ${SUPABASE_URL}`);
  console.log(`Site   : ${SITE_ID}`);
  console.log(`Simulé : ${EXEC_AGENT ? "OUI (MockRouter)" : "non spécifié"}`);

  if (!HMAC_SECRET) console.log("ℹ️  NETWORK_HMAC_SECRET non fourni — les commandes ne seront PAS vérifiées (mode test).");

  // 1) JWT utilisateur démo
  let jwt;
  try {
    jwt = await demoUserJwt();
    check("authentification utilisateur démo", Boolean(jwt));
  } catch (err) {
    check("authentification utilisateur démo", false, err.message);
    return;
  }

  // 2) Lancer l'agent mock (option)
  let mockRouter;
  if (EXEC_AGENT) {
    try {
      mockRouter = await startAgent();
      check("démarrage agent mock", true);
    } catch (err) {
      check("démarrage agent mock", false, err.message);
      return;
    }
  }

  // 3) request-wifi-session
  const sessionToken = `e2e-${Date.now()}`;
  let req;
  try {
    req = await post("request-wifi-session", {
      site_id: SITE_ID,
      session_token: sessionToken,
    }, jwt);
    const okCreate = ["created", "resume"].includes(req?.outcome);
    check("request-wifi-session → session", okCreate, `outcome=${req?.outcome ?? "-"}`);
  } catch (err) {
    check("request-wifi-session → session", false, err.message);
    return;
  }

  const sessionId = req?.session_id;
  if (sessionId) console.log(`     session_id : ${sessionId}`);

  // 4) Attendre active (routeur_session_reference renseignée par l'agent)
  const timeout = 20000;
  const started = Date.now();
  let status = null;
  while (Date.now() - started < timeout) {
    try {
      const q = await post("quota-status", { site_id: SITE_ID }, jwt);
      if (q?.session?.router_session_reference && q?.session?.status === "active") {
        status = q.session;
        break;
      }
      if (q?.allocation?.status === "exhausted") break;
    } catch {
      /* retry */
    }
    await delay(1500);
  }

  const okActive = Boolean(status?.router_session_reference);
  check(
    "session active avec référence routeur (agent exécuté)",
    okActive,
    status ? `status=${status.status} ref=${status.router_session_reference}` : "timeout"
  );

  // 5) Compteurs routeur
  if (okActive && mockRouter) {
    const before = status?.bytes_total ?? 0;
    await delay(2000);
    const q = await post("quota-status", { site_id: SITE_ID }, jwt);
    const after = q?.session?.bytes_total ?? 0;
    check("remontée des octets (agent-collect / apply_data_usage)", after > before,
      `avant=${before} après=${after}`);
  }

  // 6) Fin de session
  try {
    const end = await post("end-wifi-session", { session_id: sessionId, reason: "TEST_CLEANUP" }, jwt);
    check("fin de session propre", Boolean(end?.success ?? end?.outcome), JSON.stringify(end ?? {}).slice(0, 120));
  } catch (err) {
    check("fin de session propre", false, err.message);
  }

  // 7) Vérification finale : plus de session active
  await delay(2000);
  const qf = await post("quota-status", { site_id: SITE_ID }, jwt);
  const stillActive = qf?.session?.status === "active" || qf?.session?.status === "paused" || qf?.session?.status === "authorizing";
  check("aucune session active résiduelle", !stillActive, qf?.session?.status ?? "-");

  if (engine) {
    await engine.stop();
    console.log("ℹ️  Agent arrêté.");
  }

  console.log("\n" + (failures === 0 ? "✅ TOUS LES TESTS RÉUSSIS" : `❌ ${failures} TEST(S) EN ÉCHEC`) + "\n");
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("\n❌ Erreur fatale :", err?.message ?? err);
  process.exitCode = 1;
});