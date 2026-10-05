import { Power, EyeOff, Clock, XCircle, AlertTriangle, type LucideIcon } from "lucide-react-native";
import { COLORS } from "../../src/constants/theme";
import type { DisconnectReason } from "../../src/types";

/**
 * Bôjô — Présentation de l'historique des sessions (mis de côté).
 *
 * Logique d'affichage pure, extraite de l'écran pour être réutilisable
 * telle quelle si l'historique est réactivé (voir README.md du dossier).
 * Aucune donnée n'est stockée ici : le lecture des sessions reste dans
 * `src/repositories/sessionRepository.ts` (utilisé par le mécanisme de
 * session et le quota).
 */

export const REASON_ICONS: Record<DisconnectReason, LucideIcon> = {
  USER_PAUSED_AD: Power,
  APP_BACKGROUND: EyeOff,
  USER_LOGOUT: Power,
  HEARTBEAT_TIMEOUT: Clock,
  QUOTA_EXHAUSTED: AlertTriangle,
  NETWORK_LOST: XCircle,
  ADMIN_DISCONNECT: Power,
  ROUTER_ERROR: AlertTriangle
};

export const REASON_COLORS: Record<DisconnectReason, string> = {
  USER_PAUSED_AD: COLORS.success,
  APP_BACKGROUND: COLORS.warning,
  USER_LOGOUT: COLORS.textMuted,
  HEARTBEAT_TIMEOUT: COLORS.warning,
  QUOTA_EXHAUSTED: COLORS.danger,
  NETWORK_LOST: COLORS.danger,
  ADMIN_DISCONNECT: COLORS.danger,
  ROUTER_ERROR: COLORS.danger
};

export type HistoryFilter = "all" | "completed" | "interrupted" | "expired";

export const HISTORY_FILTERS: readonly HistoryFilter[] = [
  "all",
  "completed",
  "interrupted",
  "expired"
] as const;

export const HISTORY_STATUS_LABELS: Record<string, string> = {
  completed: "Terminé",
  active: "Actif",
  expired: "Expiré",
  interrupted: "Interrompu"
};

export const HISTORY_STATUS_COLORS: Record<string, string> = {
  completed: COLORS.success,
  active: COLORS.accent,
  expired: COLORS.textMuted,
  interrupted: COLORS.warning
};

export function historyFilterLabel(filter: HistoryFilter): string {
  return filter === "all" ? "Tout" : HISTORY_STATUS_LABELS[filter] ?? filter;
}

/** Filtre une liste de sessions déjà chargée (aucun accès réseau ici). */
export function filterHistory<T extends { status: string }>(
  items: T[],
  filter: HistoryFilter
): T[] {
  return filter === "all" ? items : items.filter((item) => item.status === filter);
}
