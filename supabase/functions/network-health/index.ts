// ============================================================
// network-health — État de santé de l'adaptateur réseau configuré.
// Le téléphone n'a aucun secret : cette fonction reflète l'état
// réel du serveur (configuré ou non).
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { resolveNetworkConfig, matchesAdapter, type NetworkHealth } from "../_shared/network-config.ts";

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
    // corps vide accepté
  }

  const cfg = resolveNetworkConfig();

  if (body.adapter && cfg.adapterType && body.adapter !== cfg.adapterType) {
    // L'app demande un adaptateur différent de celui configuré.
    return ok({ configured: false, health: "NOT_CONFIGURED" });
  }

  // Pour un prototype : tant que l'équipement réel n'est pas joignable,
  // on répercute l'état réel de la configuration. En présence d'un
  // équipement réel, effectuer ici le ping réseau réel.
  if (!cfg.configured || cfg.adapterType === "development" || !cfg.adapterType) {
    return ok({ configured: false, health: "NOT_CONFIGURED" });
  }

  const health: NetworkHealth = await probeReachability(cfg.adapterType as "mikrotik" | "radius");
  return ok({ configured: true, health });
}

// Réel : remplacer par un ping HTTP / protocole vers MIKROTIK_HOST ou
// RADIUS_HOST. Pour éviter un faux "READY", on renvoie UNREACHABLE tant
// que l'équipement réel n'a pas répondu.
async function probeReachability(type: "mikrotik" | "radius"): Promise<NetworkHealth> {
  try {
    const host = type === "mikrotik"
      ? Deno.env.get("MIKROTIK_HOST")
      : Deno.env.get("RADIUS_HOST");
    if (!host) return "NOT_CONFIGURED";

    // Tenir compte du fait que plusieurs hôtes peuvent être listés.
    // Ici : implémenter le probe réel selon l'équipement. Sans protocole
    // implémenté, on ne prétend jamais être prêt.
    return "UNREACHABLE";
  } catch {
    return "ERROR";
  }
}
