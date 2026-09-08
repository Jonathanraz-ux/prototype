// ============================================================
// network-mikrotik-disconnect — Déconnecte une session sur un
// routeur MikroTik (API RouterOS). Secrets serveur uniquement.
// Nécessite un équipement réel ; sinon état explicite.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { resolveNetworkConfig } from "../_shared/network-config.ts";

interface DisconnectBody {
  reference?: string;
}

export async function networkMikrotikDisconnect(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const cfg = resolveNetworkConfig();
  if (cfg.adapterType !== "mikrotik" || !cfg.configured) {
    return ok({ success: false, health: "NOT_CONFIGURED", reason: "not_configured" });
  }

  let body: DisconnectBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.reference) return fail("reference requis", 400, "missing_reference");

  // 👇 Intégration RouterOS réelle à implémenter ici.
  return ok({ success: false, health: "UNREACHABLE", reason: "unreachable" });
}

Deno.serve(networkMikrotikDisconnect);
