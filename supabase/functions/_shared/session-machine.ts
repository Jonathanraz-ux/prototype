// ============================================================
// _shared/session-machine.ts — Machine à états du côté serveur.
// Module PUR : les décisions (reprise, grâce, battements) sont
// testables sans base de données.
// ============================================================

export const SESSION_STATUSES = [
  "pending",
  "authorizing",
  "authorized",
  "active",
  "paused",
  "expired",
  "disconnected",
  "failed",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const AD_STATES = ["idle", "loading", "active", "paused", "ended", "expired"] as const;
export type AdState = (typeof AD_STATES)[number];

export const DISCONNECT_REASONS = [
  "USER_PAUSED_AD",
  "APP_BACKGROUND",
  "USER_LOGOUT",
  "HEARTBEAT_TIMEOUT",
  "QUOTA_EXHAUSTED",
  "NETWORK_LOST",
  "ADMIN_DISCONNECT",
  "ROUTER_ERROR",
] as const;
export type DisconnectReason = (typeof DISCONNECT_REASONS)[number];

/** Statuts qu'une seule fois « au plus un » par utilisateur (accord avec l'index unique SQL). */
export const ACTIVE_SESSION_STATUSES: readonly SessionStatus[] = [
  "pending",
  "authorizing",
  "authorized",
  "active",
  "paused",
];

export function isSessionActive(status: SessionStatus): boolean {
  return ACTIVE_SESSION_STATUSES.includes(status);
}

/**
 * La grâce de battement est expirée dès que now - lastHeartbeat > grace.
 * Un heartbeat absent (null) est toujours considéré expiré.
 */
export function isGraceExpired(
  lastHeartbeatAtMs: number | null,
  nowEpochMs: number,
  graceSeconds: number
): boolean {
  if (lastHeartbeatAtMs === null || lastHeartbeatAtMs === undefined) return true;
  if (graceSeconds <= 0) return true;
  return nowEpochMs - lastHeartbeatAtMs > graceSeconds * 1000;
}

/** Date d'expiration du battement courant (utilisée par le serveur SQL). */
export function heartbeatDeadline(nowEpochMs: number, graceSeconds: number): number {
  return nowEpochMs + graceSeconds * 1000;
}

export type ResumeDecision = "resume" | "close_timeout";

/** Unité décisionnelle serveyée par begin_network_session : reprise ou clôture. */
export function decideResumeOrClose(
  lastHeartbeatAtMs: number | null,
  nowEpochMs: number,
  graceSeconds: number
): ResumeDecision {
  return isGraceExpired(lastHeartbeatAtMs, nowEpochMs, graceSeconds) ? "close_timeout" : "resume";
}

export type HeartbeatOutcome =
  | "ok"
  | "no_session"
  | "not_active"
  | "quota_exhausted";

/** Normalise une raison de fin en un membre connu (repli sûr pour l'audit). */
export function normalizeReason(reason: string | null | undefined): DisconnectReason {
  const candidate = String(reason ?? "").trim().toUpperCase() as DisconnectReason;
  return (DISCONNECT_REASONS as readonly string[]).includes(candidate)
    ? candidate
    : "USER_PAUSED_AD";
}

/** Intervalle de battement en millisecondes (borne basse de sécurité). */
export function heartbeatIntervalMs(intervalSeconds: number): number {
  const s = Math.max(1, Math.floor(intervalSeconds));
  return s * 1000;
}