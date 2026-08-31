// ============================================================
// network-radius-authorize — Autorise une session sur un serveur
// FreeRADIUS. Secrets serveur uniquement (RADIUS_HOST/PORT/SECRET).
// Nécessite un serveur réel ; sinon renvoie un état explicite.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { resolveNetworkConfig, newSessionReference } from "../_shared/network-config.ts";

interface AuthorizeBody {
  username?: string;
  site_id?: string;
  router_id?: string;
  allocated_seconds?: number;
  allocated_bytes?: number;
  ip_address?: string;
  network_session_reference?: string;
}

export async function networkRadiusAuthorize(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const cfg = resolveNetworkConfig();
  if (cfg.adapterType !== "radius" || !cfg.configured) {
    return ok({ success: false, health: "NOT_CONFIGURED", reason: "not_configured" });
  }

  let body: AuthorizeBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.username) return fail("username requis", 400, "missing_username");

  const reference = body.network_session_reference ?? newSessionReference("rad");

  // 👇 Intégration FreeRADIUS réelle (RADIUS Access-Accept) à implémenter ici.
  const unreachable = true; // TODO
  if (unreachable) {
    return ok({ success: false, health: "UNREACHABLE", reason: "unreachable" });
  }

  return ok({ success: true, reference });
}
