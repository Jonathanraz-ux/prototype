import type { ConnectionState, DisconnectReason } from "../types";

type Transition = {
  from: ConnectionState[];
  to: ConnectionState;
  action: string;
  reason?: DisconnectReason;
};

const TRANSITIONS: Transition[] = [
  { from: ["deconnected"], to: "connecting", action: "CONNECT" },
  { from: ["connecting"], to: "connected", action: "CONNECT_SUCCESS" },
  { from: ["connecting"], to: "network_error", action: "CONNECT_FAIL" },
  { from: ["connected"], to: "ad_found", action: "AD_FOUND" },
  { from: ["ad_found"], to: "connected", action: "AD_REMOVED" },
  { from: ["connected", "ad_found"], to: "ad_missing", action: "AD_MISSING" },
  { from: ["connected", "ad_found"], to: "quota_exhausted", action: "QUOTA_EXHAUSTED" },
  { from: ["connected", "ad_found"], to: "suspended", action: "SUSPEND" },
  { from: ["ad_missing"], to: "deconnected", action: "DISCONNECT", reason: "ad_closed" },
  { from: ["quota_exhausted"], to: "deconnected", action: "DISCONNECT", reason: "quota_exhausted" },
  { from: ["suspended"], to: "deconnected", action: "DISCONNECT", reason: "suspended" },
  { from: ["network_error"], to: "deconnected", action: "DISCONNECT", reason: "network_error" },
  { from: ["connected", "ad_found", "deconnected"], to: "deconnected", action: "LOGOUT", reason: "user_disconnected" },
  { from: ["ad_missing", "quota_exhausted", "suspended", "network_error"], to: "deconnected", action: "RESET" },
  { from: ["deconnected"], to: "deconnected", action: "STAY_DISCONNECTED" },
];

export function canTransition(from: ConnectionState, action: string): ConnectionState | null {
  const transition = TRANSITIONS.find(
    (t) => t.from.includes(from) && t.action === action
  );
  return transition ? transition.to : null;
}

export function getDisconnectReason(from: ConnectionState, action: string): DisconnectReason | undefined {
  const transition = TRANSITIONS.find(
    (t) => t.from.includes(from) && t.action === action
  );
  return transition?.reason;
}

export const CONNECTION_ACTIONS = {
  CONNECT: "CONNECT" as const,
  CONNECT_SUCCESS: "CONNECT_SUCCESS" as const,
  CONNECT_FAIL: "CONNECT_FAIL" as const,
  AD_FOUND: "AD_FOUND" as const,
  AD_REMOVED: "AD_REMOVED" as const,
  AD_MISSING: "AD_MISSING" as const,
  QUOTA_EXHAUSTED: "QUOTA_EXHAUSTED" as const,
  SUSPEND: "SUSPEND" as const,
  DISCONNECT: "DISCONNECT" as const,
  LOGOUT: "LOGOUT" as const,
  RESET: "RESET" as const,
  STAY_DISCONNECTED: "STAY_DISCONNECTED" as const,
} as const;

export const STATE_LABELS: Record<ConnectionState, string> = {
  deconnected: "Déconnecté",
  connecting: "Connexion en cours",
  connected: "Connecté",
  ad_found: "Publicité active",
  ad_missing: "Publicité absente",
  quota_exhausted: "Quota épuisé",
  suspended: "Connexion suspendue",
  network_error: "Erreur réseau"
};

export const REASON_LABELS: Record<DisconnectReason, string> = {
  ad_closed: "Publicité fermée",
  ad_hidden: "Publicité masquée",
  quota_exhausted: "Quota épuisé",
  session_expired: "Session expirée",
  network_error: "Erreur réseau",
  user_disconnected: "Déconnexion utilisateur",
  suspended: "Connexion suspendue"
};
