// ============================================================
// check-license — Vérifie la licence de l'organisation de
// l'utilisateur et émet un jeton signé (LICENSE_SIGNING_SECRET)
// que l'application N'auto-valide jamais elle-même.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { publicClient, serviceClient } from "../_shared/supabase.ts";

interface CheckLicenseBody {
  app_version?: string;
}

export async function checkLicense(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return fail("Authentification requise", 401, "unauthorized");

  const supabase = publicClient(token);
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token);
  if (userErr || !user) {
    return fail("Jeton invalide ou expiré", 401, "unauthorized");
  }

  let body: CheckLicenseBody = {};
  try {
    body = await req.json();
  } catch {
    // corps optionnel
  }

  // Organisation de l'utilisateur.
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.organization_id) {
    return ok(buildResult("revoked", null));
  }

  // Lecture de la licence : via le client service (lecture seule) car la
  // policy RLS `licenses_org_admin_select` restreint la lecture aux admin.
  // La vérification de licence doit rester possible pour tout utilisateur
  // de l'organisation, sans jamais permettre d'écriture.

  const admin = serviceClient();
  const { data: license } = await admin
    .from("licenses")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (!license) {
    return ok(buildResult("expired", null));
  }

  const status = computeStatus(license, profile);

  // Émission d'un jeton signé.
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min
  const licenseToken = await signLicenseToken({
    orgId: license.organization_id,
    licenseId: license.id,
    status,
    issuedAt,
    expiresAt,
    appVersion: body.app_version ?? null,
  });

  return ok({
    status,
    license: license.status === "revoked" ? undefined : mapLicense(license),
    issuedAt,
    expiresAt,
    token: licenseToken,
  });
}

function computeStatus(
  license: Record<string, unknown>,
  profile: Record<string, unknown>
): string {
  if (license.status === "revoked") return "revoked";
  if (profile.status && profile.status !== "active") return "suspended";

  const now = Date.now();
  const validUntilRaw = license.valid_until as string | null;
  if (validUntilRaw) {
    const graceMs = ((license.grace_period_hours as number) ?? 0) * 3600 * 1000;
    if (new Date(validUntilRaw).getTime() + graceMs < now) {
      return "expired";
    }
  }
  if (license.status === "suspended") return "suspended";
  return "valid";
}

function mapLicense(row: Record<string, unknown>) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    status: row.status,
    plan: row.plan,
    validFrom: row.valid_from,
    validUntil: row.valid_until ?? undefined,
    gracePeriodHours: row.grace_period_hours ?? 0,
    maxSites: row.max_sites ?? 1,
    maxRouters: row.max_routers ?? 1,
    maxAdmins: row.max_admins ?? 1,
    features: row.features ?? [],
  };
}

function buildResult(status: string, license: Record<string, unknown> | null, token?: string) {
  return {
    status,
    license: license ? mapLicense(license) : undefined,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    ...(token ? { token } : {}),
  };
}

async function signLicenseToken(payload: Record<string, unknown>): Promise<string> {
  const secret = Deno.env.get("LICENSE_SIGNING_SECRET") ?? "";
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 300 }));
  const data = `${header}.${body}`;
  if (!secret) return `${data}..unsecured`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const b64sig = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${b64sig}`;
}

Deno.serve(checkLicense);
