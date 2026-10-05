// ============================================================
// network-radius-authorize — Autorise une session sur un serveur
// FreeRADIUS. Secrets serveur uniquement (RADIUS_HOST/PORT/SECRET).
//
// ⚠️ NON IMPLÉMENTÉ : l'échange RADIUS (Access-Accept) n'est pas
// câblé. La fonction échoue donc franchement (UNREACHABLE) au lieu de
// laisser croire à une autorisation. Le chemin MikroTik (agent local)
// est le seul fournisseur « live » opérationnel.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { resolveNetworkConfig } from "../_shared/network-config.ts";

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

  // Aucun échange RADIUS (Access-Accept) n'est implanté côté serveur : on
  // refuse explicitement plutôt que de renvoyer une référence de session
  // qui n'aurait jamais été concédue par l'équipement.
  return ok({
    success: false,
    health: "UNREACHABLE",
    reason: "unreachable",
    detail: "Échange RADIUS non implanté : RADIUS_HOST/RADIUS_SECRET seuls ne suffisent pas.",
  });
}

Deno.serve(networkRadiusAuthorize);
