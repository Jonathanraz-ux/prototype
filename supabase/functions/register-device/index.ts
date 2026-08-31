// ============================================================
// register-device — Enregistre / réactive l'appareil de l'utilisateur.
// Convertit l'installation_id (chaîne opaque du client) en un uuid
// déterministe pour satisfaire la contrainte unique de la table devices.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { publicClient } from "../_shared/supabase.ts";

interface RegisterDeviceBody {
  installation_id?: string;
  platform?: string;
  app_version?: string;
}

export async function registerDevice(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return fail("Authentification requise", 401, "unauthorized");

  const supabase = publicClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token);
  if (userErr || !user) {
    return fail("Jeton invalide ou expiré", 401, "unauthorized");
  }

  let body: RegisterDeviceBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.installation_id) {
    return fail("installation_id requis", 400, "missing_installation");
  }

  // Identifiant uuid déterministe dérivé de l'installation_id renvoyé par le
  // client (stable dans le temps, évite les doublons).
  const deviceId = await installationToUuid(body.installation_id);

  // Profession : organisation de l'utilisateur.
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  const organizationId = profile?.organization_id ?? null;

  // Upsert : réactive un appareil suspendu ou inactif.
  const { data, error } = await supabase
    .from("devices")
    .upsert(
      {
        id: deviceId,
        organization_id: organizationId,
        user_id: user.id,
        installation_id: deviceId,
        platform: body.platform ?? null,
        app_version: body.app_version ?? null,
        status: "active",
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("id, status, installation_id")
    .single();

  if (error || !data) {
    // Un appareil déjà récompensé/suspendu peut refuser l'insertion RLS ;
    // on tente alors une mise à jour du statut.
    const { data: upd, error: updErr } = await supabase
      .from("devices")
      .update({ status: "active", last_seen_at: new Date().toISOString() })
      .eq("id", deviceId)
      .eq("user_id", user.id)
      .select("id, status")
      .single();
    if (updErr || !upd) {
      return fail("Enregistrement de l'appareil impossible", 500, "device_failed");
    }
    return ok({ device_id: upd.id, status: upd.status ?? "active" });
  }

  return ok({ device_id: data.id, status: data.status ?? "registered" });
}

async function installationToUuid(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  // Version 4/v4 bits : fixe le nible de version et la variante.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes.slice(0, 16)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
