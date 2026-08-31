// ============================================================
// expire-stale-sessions — Tâche planifiée (cron) qui expire les
// sessions Wi-Fi au-delà de leur durée allouée.
// Appelée périodiquement avec la clé service (pg_cron / scheduler).
// Délègue à la fonction PostgreSQL atomique expire_stale_sessions.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";

export async function expireStaleSessions(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const admin = serviceClient();
  const { data, error } = await admin.rpc("expire_stale_sessions");
  if (error) {
    return fail(error.message, 500, "expire_failed");
  }

  return ok({ expired: data ?? 0 });
}
