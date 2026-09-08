// ============================================================
// network-session-usage — Consommation réelle d'une session réseau.
// Le client appelle cette fonction (state adaptateur) — sans secret.
// Nécessite un équipement réel ; sinon disponible=false explicite.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { resolveNetworkConfig, matchesAdapter } from "../_shared/network-config.ts";

interface UsageBody {
  reference?: string;
  adapter?: string;
}

export async function networkSessionUsage(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  let body: UsageBody = {};
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.reference) return fail("reference requis", 400, "missing_reference");

  const cfg = resolveNetworkConfig();
  if (!cfg.configured || (body.adapter && !matchesAdapter(body.adapter))) {
    return ok({ consumed_seconds: 0, consumed_bytes: 0, available: false });
  }

  // 👇 Interroger l'équipement réel (RouterOS / RADIUS) via la référence.
  // Tant que l'équipement n'est pas joignable, on rapporte "indisponible".
  return ok({ consumed_seconds: 0, consumed_bytes: 0, available: false });
}

Deno.serve(networkSessionUsage);
