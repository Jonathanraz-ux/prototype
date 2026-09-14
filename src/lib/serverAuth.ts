/**
 * Logique pure de validation du flux « ad → session → autorisation native ».
 * Aucune dépendance React Native : testable en Node.
 *
 * Unités : les dates serveur (timestamptz → ISO 8601) sont converties en
 * millisecondes via Date.parse (peut être négatif). Les durées natives sont
 * en millisecondes. Les durées publicitaires en secondes.
 */

export const MAX_NATIVE_AUTH_TTL_MS = 25_000;

/**
 * Durée d'autorisation native (ms) dérivée des DATES SERVEUR renvoyées par
 * le battement : heartbeat_expires_at - base serveur (server_time, sinon
 * last_heartbeat_at). N'utilise JAMAIS l'horloge du client pour ne pas être
 * faussé par son décalage.
 *
 * Contrat serveur documenté et validé en réel : le battement renvoie
 * toujours server_time (ou last_heartbeat_at) ET heartbeat_expires_at.
 * Une réponse SANS échéance serveur exploitable (dates absentes,
 * illisibles, passées ou incohérentes) NE DONNE AUCUNE autorisation :
 * on renvoie 0 = blocage natif, et le JavaScript signale l'erreur.
 * Aucun repli local : pas de 25 s accordée automatiquement.
 */
export function heartbeatTtlMsFromServer(r: {
  server_time?: string;
  last_heartbeat_at?: string;
  heartbeat_expires_at?: string;
}): number {
  const base = r.server_time ?? r.last_heartbeat_at;
  const until = r.heartbeat_expires_at;
  if (!base || !until) return 0;
  const b = Date.parse(base);
  const u = Date.parse(until);
  if (Number.isNaN(b) || Number.isNaN(u)) return 0;
  const ttl = u - b;
  // Échéance passée ou dates incohérentes → 0 déclenche le blocage natif
  // (jamais une extension aveugle, jamais une prolongation locale).
  if (ttl <= 0) return 0;
  return Math.min(Math.round(ttl), MAX_NATIVE_AUTH_TTL_MS);
}

/**
 * Secondes RÉELLEMENT regardées envoyées à complete_ad_view à partir du
 * temps de lecture effectif (ms du lecteur). Plancher : on ne revendique
 * JAMAIS plus que le temps réellement visionné. Le seuil de campagne
 * (duration_seconds) doit être cohérent : durée de média réelle exprimée
 * en secondes entières (plancher) ; la récompense n'est accordée qu'au
 * visionnage COMPLET (requête complete_ad_view >= duration_seconds).
 */
export function watchedSecondsFromDurationMillis(watchedMillis: number): number {
  if (!Number.isFinite(watchedMillis) || watchedMillis <= 0) return 0;
  return Math.floor(watchedMillis / 1000);
}

export type QuotaDecision = "ok" | "inactive" | "quota_exhausted";

/**
 * Décision de reprise/connect à partir de l'allocation serveur (source de
 * vérité). « ok » exige une allocation active avec quota restant strictement
 * positif. Une allocation révoquée est « inactive » (jamais « épuisée »,
 * pour ne pas prêter à confusion).
 */
export function resumeQuotaDecision(a?: {
  status?: string;
  remaining_bytes?: number;
} | null): QuotaDecision {
  if (!a) return "inactive";
  if (a.status === "revoked") return "inactive";
  const remaining = a.remaining_bytes ?? 0;
  if (a.status !== "active" || remaining <= 0) return "quota_exhausted";
  return "ok";
}