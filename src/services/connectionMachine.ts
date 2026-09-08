// ============================================================
// connectionMachine.ts — Machine à états de connexion, ALIGNÉE sur
// le serveur (migration 0008 / session-machine.ts des Edge Functions).
//
// Le téléphone n'est PAS la source de vérité : il ne fait que refléter
// l'état de la session côté serveur (quota-status) et battre pour la
// maintenir vivante (ad-heartbeat). La machine reste pure (testable).
// ============================================================

import type { ConnectionState, DisconnectReason } from "../types";

export const CONNECTION_ACTIONS = {
  CONNECT: "CONNECT",
  AD_AVAILABLE: "AD_AVAILABLE",
  AD_WATCHED: "AD_WATCHED",
  AD_FAILED: "AD_FAILED",
  SESSION_STARTED: "SESSION_STARTED",
  SESSION_AUTHORIZED: "SESSION_AUTHORIZED",
  HB_OK: "HB_OK",
  PAUSE: "PAUSE",
  RESUME: "RESUME",
  QUOTA_EXHAUSTED: "QUOTA_EXHAUSTED",
  ERROR: "ERROR",
  DISCONNECT: "DISCONNECT",
  DISCONNECTED: "DISCONNECTED",
  RESET: "RESET",
} as const;

interface Transition {
  from: ConnectionState[];
  to: ConnectionState;
  action: string;
  reason?: DisconnectReason;
}

const TRANSITIONS: Transition[] = [
  // ----- Déclenchement depuis l'idle -----
  { from: ["idle", "quota_exhausted", "error", "paused"], to: "ad_loading", action: "CONNECT" },
  { from: ["ad_loading", "ad_active"], to: "ad_active", action: "AD_AVAILABLE" },
  { from: ["ad_loading", "ad_active"], to: "error", action: "AD_FAILED" },

  // ----- Publicité terminée : demande de session Wi-Fi -----
  { from: ["ad_active"], to: "authorizing_wifi", action: "AD_WATCHED" },
  { from: ["authorizing_wifi"], to: "wifi_active", action: "SESSION_AUTHORIZED" },
  { from: ["authorizing_wifi", "wifi_active", "paused"], to: "quota_exhausted", action: "QUOTA_EXHAUSTED" },
  { from: ["authorizing_wifi"], to: "error", action: "ERROR" },

  // ----- Session active -----
  { from: ["wifi_active"], to: "paused", action: "PAUSE" },
  { from: ["paused"], to: "wifi_active", action: "RESUME" },
  { from: ["wifi_active", "paused"], to: "disconnecting", action: "DISCONNECT", reason: "USER_PAUSED_AD" },

  // ----- Rattrapage d'état serveur -----
  { from: ["paused", "wifi_active", "authorizing_wifi"], to: "wifi_active", action: "HB_OK" },

  // ----- Déconnexion -----
  { from: ["disconnecting"], to: "idle", action: "DISCONNECTED", reason: "USER_LOGOUT" },
  { from: ["error"], to: "idle", action: "DISCONNECTED", reason: "ROUTER_ERROR" },

  // ----- Retour à l'accueil -----
  { from: ["quota_exhausted", "error", "paused", "wifi_active", "authorizing_wifi", "disconnecting", "ad_active", "ad_loading"], to: "idle", action: "RESET" },
];

export function canTransition(from: ConnectionState, action: string): ConnectionState | null {
  const match = TRANSITIONS.find(
    (t) => t.action === action && t.from.includes(from)
  );
  return match ? match.to : null;
}

export function getDisconnectReason(from: ConnectionState, action: string): DisconnectReason | undefined {
  const match = TRANSITIONS.find(
    (t) => t.action === action && t.from.includes(from)
  );
  return match?.reason;
}

export const STATE_LABELS: Record<ConnectionState, string> = {
  idle: "En attente",
  ad_loading: "Recherche de publicité",
  ad_active: "Publicité en cours",
  authorizing_wifi: "Autorisation Wi-Fi",
  wifi_active: "Connecté",
  paused: "En pause",
  quota_exhausted: "Quota épuisé",
  error: "Erreur",
  disconnecting: "Déconnexion",
};

// Motifs normalisés du serveur (session-machine.ts) — jamais réinventés.
export const REASON_LABELS: Record<string, string> = {
  USER_PAUSED_AD: "Pause publicitaire",
  APP_BACKGROUND: "Application mise en arrière-plan",
  USER_LOGOUT: "Déconnexion de l'utilisateur",
  HEARTBEAT_TIMEOUT: "Battement arrêté (grâce dépassée)",
  QUOTA_EXHAUSTED: "Quota de données épuisé",
  NETWORK_LOST: "Liaison réseau perdue",
  ADMIN_DISCONNECT: "Déconnecté par un administrateur",
  ROUTER_ERROR: "Erreur routeur",
}