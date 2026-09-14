/*
 * Validation backend du flux « ad → session démo → heartbeat » avec le
 * COMPTE RÉEL (pilote@wifizone.app) sur le projet hwwivzsdepzdgonfbkxq.
 *
 * Réplique EXACTEMENT les chemins appelés par l'application :
 *   - Edge Functions (get-available-campaign, start-ad-view,
 *     complete-ad-view, quota-status, ad-heartbeat) via session user réelle
 *   - RPC request_demo_wifi_session via supabase.rpc (session user réelle)
 *   - RPC ad_heartbeat_tick / get_quota_status via service_role (comme les EF)
 *
 * Aucun secret exposé : les clés sont lues depuis .env et sb_sr.txt.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const ROOT = __dirname + "/..";
const envRaw = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
const getEnv = (k) => {
  const m = envRaw.match(new RegExp(`^${k}=(.+)$`, "m"));
  return m ? m[1].trim() : "";
};
const URL = getEnv("EXPO_PUBLIC_SUPABASE_URL");
const ANON = getEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY");
const SITE_ID = getEnv("EXPO_PUBLIC_DEFAULT_SITE_ID");
const SERVICE_ROLE = fs
  .readFileSync(process.env.SB_SR_PATH || "C:/Users/JONATHAN/AppData/Local/Temp/opencode/sb_sr.txt", "utf8")
  .trim();

const EMAIL = "pilote@wifizone.app";
// Mot de passe fourni par l'utilisateur ; jamais écrit en dur dans le dépôt.
const PASSWORD = process.env.PILOTE_PASSWORD;
const WATCHED_SECONDS = 52; // plancher du réellement regardé : 52.209 s → 52 s = duration_seconds=52

function ok(label, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) process.exitCode = 1;
}
function info(label, detail) {
  console.log(`INFO  ${label}  ${detail}`);
}

async function main() {
  if (!URL || !ANON || !SERVICE_ROLE) throw new Error("Clés manquantes (URL/ANON/service_role)");

  const user = createClient(URL, ANON, { auth: { persistSession: false } });
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // 1. Connexion compte réel
  const sign = await user.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (sign.error) {
    console.log(`FAIL  connexion ${EMAIL}  (${sign.error.message})`);
    console.log("      (mot de passe : définir PILOTE_PASSWORD ou corriger le script)");
    process.exit(1);
  }
  const uid = sign.data.user.id;
  info("connexion", `${EMAIL} → ${uid}`);

  // 2. Profil / organisation (idem requestDemoWifiSession)
  const { data: profile, error: profErr } = await user
    .from("profiles")
    .select("organization_id")
    .eq("id", uid)
    .maybeSingle();
  ok("profil -> organization_id", !profErr && !!profile?.organization_id, JSON.stringify(profile ?? profErr));

  // 3. Inventaire serveur (idem getAvailableCampaign)
  const camp = await user.functions.invoke("get-available-campaign", { body: {} });
  ok("get-available-campaign ok", !camp.error && camp.data && camp.data.campaign, JSON.stringify(camp.data));
  const campaignId = camp.data?.campaign?.id;
  if (!campaignId) throw new Error("Pas de campagne disponible");
  ok("campagne durée_seconds≥1", Number(camp.data.campaign.durationSeconds) >= 1, `durationSeconds=${camp.data.campaign.durationSeconds}`);

  // 4. Démarrage lecture (idem startAdView — la vue est { viewId, proof_nonce, campaign, expiresAt })
  const sview = await user.functions.invoke("start-ad-view", { body: { campaign_id: campaignId } });
  ok("start-ad-view ok", !sview.error && sview.data && sview.data.viewId, JSON.stringify(sview.data));
  const viewId = sview.data?.viewId;
  ok("start-ad-view viewId uuid", !!viewId && /^[0-9a-f-]{36}$/.test(viewId), `viewId=${viewId}`);
  const nonce = sview.data && (sview.data.proof_nonce || sview.data.proofNonce || sview.data.nonce);
  ok("start-ad-view nonce présent", !!nonce);
  ok("start-ad-view expiresAt ISO", !Number.isNaN(Date.parse(sview.data.expiresAt)), `expiresAt=${sview.data.expiresAt}`);
  if (!viewId) throw new Error("Pas de viewId start-ad-view");

  // 5. Fin de lecture (idem completeAdView, watched_seconds=52 = plancher réel)
  const cview = await user.functions.invoke("complete-ad-view", {
    body: { view_id: viewId, watched_seconds: WATCHED_SECONDS },
  });
  ok(
    "complete-ad-view succès",
    !cview.error && cview.data && cview.data.success === true,
    JSON.stringify(cview.data)
  );
  ok("complete-ad-view reward accordée", !cview.error && cview.data && cview.data.rewardGranted === true);

  // 6. Session démo (idem requestDemoWifiSession)
  const token = sign.data.session.access_token;
  const sessCall = await user.rpc("request_demo_wifi_session", {
    p_user_id: uid,
    p_organization_id: profile.organization_id,
    p_site_id: SITE_ID,
    p_session_token: `be-valid-${crypto.randomUUID()}`,
    p_grace_seconds: 25,
  });
  ok("request_demo_wifi_session ok", !sessCall.error, sessCall.error?.message ?? "");
  const sd = sessCall.data || {};
  ok(
    "outcome created|resume",
    ["created", "resume"].includes(sd.outcome),
    `outcome=${sd.outcome}`
  );
  ok("authorization_state granted", sd.authorization_state === "granted", `auth=${sd.authorization_state}`);
  ok("session_id présent", !!sd.session_id, `session=${sd.session_id}`);
  ok("alloc remaining>0", Number(sd.allocation?.remaining_bytes) > 0, `remaining=${sd.allocation?.remaining_bytes}`);
  ok(
    "heartbeat_expires_at ISO parseable",
    !Number.isNaN(Date.parse(sd.heartbeat_expires_at)),
    `expires=${sd.heartbeat_expires_at}`
  );
  // Unités : échéance = now + 25 s (pas de server_time dans cette RPC)
  const graceOk = Math.abs(Date.parse(sd.heartbeat_expires_at) - Date.now() / 1 - 25000) < 60000;
  ok("heartbeat_expires_at ≈ now+25s", graceOk, `delta≈${Math.round((Date.parse(sd.heartbeat_expires_at) - Date.now()) / 1000)}s`);
  const sessionId = sd.session_id;

  // 7. quota-status EF (idem fetchQuotaStatus) — server_time présent
  const qs = await user.functions.invoke("quota-status", { body: { site_id: SITE_ID } });
  ok("quota-status ok", !qs.error, JSON.stringify(qs.error));
  ok("quota-status server_time ISO", !!qs.data?.server_time && !Number.isNaN(Date.parse(qs.data.server_time)), `server_time=${qs.data?.server_time}`);
  ok(
    "quota-status allocation active >0",
    qs.data?.allocation?.status === "active" && Number(qs.data?.allocation?.remaining_bytes) > 0,
    `remaining=${qs.data?.allocation?.remaining_bytes} status=${qs.data?.allocation?.status}`
  );
  ok(
    "same allocation_id",
    qs.data?.allocation?.allocation_id === sd.allocation?.allocation_id,
    `alloc=${qs.data?.allocation?.allocation_id}`
  );

  // 8. Battement (idem EF ad-heartbeat → RPC ad_heartbeat_tick via service_role)
  const he = await admin.rpc("ad_heartbeat_tick", { p_session_id: sessionId, p_grace_seconds: 25 });
  ok("ad_heartbeat_tick ok", !he.error, he.error?.message ?? "");
  const hd = he.data || {};
  ok("heartbeat outcome ok", hd.outcome === "ok", `outcome=${hd.outcome}`);
  ok("heartbeat authorized=true", hd.authorized === true);
  ok("heartbeat last_heartbeat_at ISO", !Number.isNaN(Date.parse(hd.last_heartbeat_at)), `last=${hd.last_heartbeat_at}`);
  ok("heartbeat expires ISO", !Number.isNaN(Date.parse(hd.heartbeat_expires_at)), `expires=${hd.heartbeat_expires_at}`);
  const hbMs = Date.parse(hd.heartbeat_expires_at) - Date.parse(hd.last_heartbeat_at);
  ok("PREUVE UNITÉS : expires - last = 25 000 ms", hbMs >= 24000 && hbMs <= 26000, `diff=${hbMs}ms`);
  ok(
    "heartbeat remaining == allocation remaining",
    Number(hd.remaining_bytes) === Number(sd.allocation.remaining_bytes),
    `remaining=${hd.remaining_bytes} (session=${sd.allocation.remaining_bytes})`
  );

  // 9. Reprise (2e appel request_demo_wifi_session = idempotent/resume)
  const resume = await user.rpc("request_demo_wifi_session", {
    p_user_id: uid,
    p_organization_id: profile.organization_id,
    p_site_id: SITE_ID,
    p_session_token: `be-valid-${crypto.randomUUID()}`,
    p_grace_seconds: 25,
  });
  ok("reprise résumé (outcome=resume)", !resume.error && resume.data?.outcome === "resume", `outcome=${resume.data?.outcome}`);
  ok(
    "reprise même session_id (jamais de double allocation)",
    !resume.error && resume.data?.session_id === sessionId && resume.data?.allocation?.allocation_id === sd.allocation?.allocation_id,
    `session=${resume.data?.session_id}`
  );

  // 10. get_quota_status direct service_role (shape exacte)
  const gqs = await admin.rpc("get_quota_status", { p_user_id: uid, p_site_id: SITE_ID });
  ok(
    "get_quota_status ok",
    !gqs.error && gqs.data?.allocation && gqs.data?.session,
    JSON.stringify(gqs.error ?? gqs.data)
  );

  console.log("\nBackend (server_time absent des RPC, présent dans quota-status) : validé si tout PASS.");
}

main().catch((e) => {
  console.log("EXCEPTION", e.message);
  process.exitCode = 1;
});