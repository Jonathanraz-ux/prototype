// ============================================================
// network-mikrotik-authorize — Autorise une session sur un
// routeur MikroTik (API RouterOS). Secrets serveur uniquement.
//
// ⚠️ FONCTION DÉCONNECTÉE (docs/ETAT_PROJET.md §8.2).
// La chaîne MikroTik réelle ne passe PAS par ici : l'agent local
// exécute les commandes RouterOS signées (file `network_commands`).
// Voir src/network/MikrotikNetworkAdapter.ts, qui utilise
// `request-wifi-session` puis `quota-status`.
//
// Cette fonction reste en place comme garde-fou : elle répond
// explicitement UNREACHABLE tant qu'aucun pilotage RouterOS direct
// n'est câblé côté serveur. Elle ne prétend JAMAIS un accès réussi.
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

  // Aucun pilotage RouterOS direct n'est implémenté côté serveur (l'agent
  // local s'en charge). On refuse donc explicitement plutôt que de
  // retourner une référence de session qui n'existerait jamais.
  return ok({
    success: false,
    health: "UNREACHABLE",
    reason: "unreachable",
    detail: "Pilotage direct non implanté : utilisez l'agent local (request-wifi-session).",
  });
}

Deno.serve(networkMikrotikAuthorize);
