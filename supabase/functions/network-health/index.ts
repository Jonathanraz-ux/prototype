// ============================================================
// network-health — État de santé de la chaîne réseau.
//
// Pour le test MikroTik : l'adaptateur « mikrotik » est piloté par
// l'AGENT LOCAL (file network_commands + API RouterOS), plus par le
// serveur directement. La santé reflète donc :
//   - la configuration serveur (NETWORK_ADAPTER_TYPE, MIKROTIK_HOST) ;
//   - la présence d'un agent local enregistré et ONLINE ;
//   - l'état des routeurs connus du site.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { resolveNetworkConfig, type NetworkConfig } from "../_shared/network-config.ts";

interface HealthBody {
  adapter?: string;
}

export async function networkHealth(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  let body: HealthBody = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const cfg: NetworkConfig = resolveNetworkConfig();

  if (body.adapter && cfg.adapterType && body.adapter !== cfg.adapterType) {
    return ok({
      configured: false,
      health: "NOT_CONFIGURED",
      adapterType: cfg.adapterType,
      simulated: cfg.simulated,
    });
  }

  if (!cfg.configured || !cfg.adapterType) {
    return ok({
      configured: false,
      health: cfg.health,
      adapterType: cfg.adapterType,
      simulated: cfg.simulated,
    });
  }

  // Chaîne MikroTik pilotée par l'agent : pas de prétention de READY
  // sans agent enregistré et en ligne.
  let agents: Array<Record<string, unknown>> = [];
  let routers: Array<Record<string, unknown>> = [];
  if (cfg.adapterType === "mikrotik") {
    const { serviceClient } = await import("../_shared/supabase.ts");
    const admin = serviceClient();
    const [{ data: a }, { data: r }] = await Promise.all([
      admin
        .from("local_agents")
        .select("id, name, status, site_id, last_seen_at")
        .order("last_seen_at", { ascending: false })
        .limit(5),
      admin
        .from("routers")
        .select("id, name, model, status, site_id, last_seen_at")
        .limit(20),
    ]);
    agents = (a ?? []) as Array<Record<string, unknown>>;
    routers = (r ?? []) as Array<Record<string, unknown>>;
  }

  const agentOnline = agents.some((ag) => ag.status === "online");
  const routerOnline = routers.some((rt) => rt.status === "active" || rt.status === "online");

  let health: NetworkConfig["health"] = cfg.health;
  if (cfg.adapterType === "mikrotik") {
    if (!agentOnline) health = "UNREACHABLE";
    if (!routers.length) health = "NOT_CONFIGURED";
  }

  return ok({
    configured: cfg.configured,
    health,
    adapterType: cfg.adapterType,
    agents,
    routers,
    agentOnline,
    routerOnline,
    // Honnêteté : l'agent peut être un agent de test branché sur
    // mock-router.mjs. Le client DOIT alors annoncer une simulation et
    // masquer les compteurs, même si la chaîne répond « READY ».
    simulated: cfg.simulated,
  });
}

Deno.serve(networkHealth);