// ============================================================
// network-radius-disconnect — Déconnecte une session sur un
// serveur FreeRADIUS. Secrets serveur uniquement.
//
// ⚠️ NON IMPLÉMENTÉ : aucuneDisconnect-Request n'est émis. La fonction
// répond donc UNREACHABLE plutôt que de prétendre une révocation.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { resolveNetworkConfig } from "../_shared/network-config.ts";

interface DisconnectBody {
  reference?: string;
}

export async function networkRadiusDisconnect(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const cfg = resolveNetworkConfig();
  if (cfg.adapterType !== "radius" || !cfg.configured) {
    return ok({ success: false, health: "NOT_CONFIGURED", reason: "not_configured" });
  }

  let body: DisconnectBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.reference) return fail("reference requis", 400, "missing_reference");

  // 👇 Intégration FreeRADIUS réelle (RADIUS Disconnect-Request) à implémenter.
  return ok({ success: false, health: "UNREACHABLE", reason: "unreachable" });
}

Deno.serve(networkRadiusDisconnect);
