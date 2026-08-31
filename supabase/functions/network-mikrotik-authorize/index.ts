// ============================================================
// network-mikrotik-authorize — Autorise une session sur un
// routeur MikroTik (API RouterOS). Secrets serveur uniquement.
// Nécessite un équipement réel ; sinon renvoie un état explicite.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { resolveNetworkConfig, matchesAdapter, newSessionReference } from "../_shared/network-config.ts";

interface AuthorizeBody {
  username?: string;
  site_id?: string;
  router_id?: string;
  allocated_seconds?: number;
  allocated_bytes?: number;
  ip_address?: string;
}

export async function networkMikrotikAuthorize(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const cfg = resolveNetworkConfig();
  if (cfg.adapterType !== "mikrotik" || !cfg.configured) {
    return ok({ success: false, health: "NOT_CONFIGURED", reason: "not_configured" });
  }

  let body: AuthorizeBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.username) return fail("username requis", 400, "missing_username");

  // Référence de session générée côté serveur pour idempotence et traçabilité.
  const reference = newSessionReference("mk");

  // 👇 Intégration RouterOS réelle à implémenter ici (libssh / API REST
  // Mikrotik) en utilisant MIKROTIK_HOST / USERNAME / PASSWORD.
  // Tant que l'équipement n'est pas joignable, on ne prétend pas la
  // connexion : on renvoie UNREACHABLE.
  const unreachable = true; // TODO: remplacer par le résultat du pilotage réel
  if (unreachable) {
    return ok({ success: false, health: "UNREACHABLE", reason: "unreachable" });
  }

  return ok({ success: true, reference });
}
