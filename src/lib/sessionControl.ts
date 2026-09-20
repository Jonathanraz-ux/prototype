// ============================================================
// sessionControl.ts — Contrôle central, PUR et testable, des sessions.
//
// Objectif : éliminer les courses (autorisations concurrentes, réponses
// tardives qui réactiveraient une session suspendue), rendre idempotentes
// les suspensions, décider de l'état des écrans depuis UNE seule source
// (le serveur + l'autorisation native réellement en place), et imposer
// des unités explicites pour le quota (octets côté serveur, Mo affichés).
//
// Aucune dépendance React Native : tout ce module s'exécute sous Node (jest).
// Les effets I/O (réseau, VpnService) restent dans ConnectionContext et les
// adaptateurs, qui consomment les décisions ci-dessous.
// ============================================================

import { heartbeatTtlMsFromServer } from "./serverAuth";
import type {
  ConnectionState,
  DisconnectReason,
  InternetStatus,
} from "../types";

// ————————————————————————————————————————————————————————————
// Unités du quota — TOUJOURS explicites.
// La vérité est côté serveur et réseau (octets). L'affichage utilise
// le mébioctet (1 Mo = 1024*1024 octets) pour rester cohérent avec
// les compteurs MikroTik (relation 1:1, base 1024).
// ————————————————————————————————————————————————————————————
export const BYTES_PER_MEBIBYTE = 1024 * 1024;
export const QUOTA_UNIT_LABEL = "Mo";
export const SERVER_QUOTA_UNIT = "bytes";
export const DEMO_QUOTA_BYTES = 5 * BYTES_PER_MEBIBYTE * 1024; // 5 GiB = 5 * 1024 * 1024 * 1024 octets

export function bytesToMiB(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.round(bytes / BYTES_PER_MEBIBYTE);
}

/**
 * Consommation déduite de l'allocation serveur (source de vérité) :
 * quota_total − quota_restant. Jamais lue dans un compteur local.
 * Bornée à zéro pour résister aux données incohérentes.
 */
export function quotaConsumedBytes(
  quotaBytes: number | undefined,
  remainingBytes: number | undefined
): number {
  const total = Number(quotaBytes ?? 0);
  const remaining = Math.max(0, Number(remainingBytes ?? total));
  return Math.max(0, total - remaining);
}

// ————————————————————————————————————————————————————————————
// Époque de session — invalide TOUTES les réponses en vol.
// Toute continuation asynchrone (finalizeAdView, resumeFromPaused,
// heartbeat, waitForAuthorization) capture l'époque à son départ et
// abandonne dès qu'elle a changé : une réponse tardive ne peut donc
// JAMAIS réactiver une session déjà suspendue/expirée.
// ————————————————————————————————————————————————————————————
export interface SessionEpoch {
  readonly current: number;
  advance(): number;
  isCurrent(gen: number): boolean;
}

export function createSessionEpoch(start = 0): SessionEpoch {
  let epoch = start;
  return {
    get current() {
      return epoch;
    },
    advance() {
      epoch += 1;
      return epoch;
    },
    isCurrent(gen) {
      return gen === epoch;
    },
  };
}

// ————————————————————————————————————————————————————————————
// Porte de flux — bloque les autorisations CONCURRENTES.
// Un seul établissement de session (connexion/reprise) à la fois :
// un double appui ou un événement lecteur pendant une requête est
// simplement ignoré (idempotence au niveau du déclencheur).
// ————————————————————————————————————————————————————————————
export interface FlowGate {
  isOpen(): boolean;
  /** Ouvre un flux. Retourne null si un flux est déjà ouvert. */
  begin(): string | null;
  /** Referme le flux s'il a été ouvert avec ce jeton. */
  end(token: string): boolean;
  /** Referme le flux quoi qu'il arrive (suspension, déconnexion). */
  forceClose(): boolean;
}

export function createFlowGate(): FlowGate {
  let token: string | null = null;
  return {
    isOpen() {
      return token !== null;
    },
    begin() {
      if (token !== null) return null;
      token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      return token;
    },
    end(t) {
      if (token === t) {
        token = null;
        return true;
      }
      return false;
    },
    forceClose() {
      if (token === null) return false;
      token = null;
      return true;
    },
  };
}

// ————————————————————————————————————————————————————————————
// Décision du battement de présence (ad-heartbeat).
// Le serveur est l'AUTORITÉ : il décide seul de la vie/expiration de
// la session. Le client ne fait que traduire la réponse en action,
// sans jamais prolonger localement une autorisation obsolète.
//
//  - authorize        → renouveler l'autorisation native (TTL = dates
//                       SERVEUR, jamais l'horloge du client).
//  - block            → couper immédiatement (TTL inutilisable, réponse
//                       inconnue ou battement en échec).
//  - require_reauth   → session fermée/expirée : une NOUVELLE autorisation
//                       vérifiée (publicité) est obligatoire.
//  - quota_exhausted  → quota épuisé : couper et afficher l'état dédié.
// ————————————————————————————————————————————————————————————
export interface HeartbeatResponseView {
  outcome?: string;
  server_time?: string;
  last_heartbeat_at?: string;
  heartbeat_expires_at?: string;
}

export type HeartbeatDecision =
  | { action: "authorize"; ttlMs: number }
  | { action: "block"; reason: DisconnectReason }
  | { action: "require_reauth"; reason?: DisconnectReason }
  | { action: "quota_exhausted" };

export function decideHeartbeat(r: HeartbeatResponseView): HeartbeatDecision {
  const outcome = r.outcome ?? "unknown";

  if (outcome === "quota_exhausted") {
    return { action: "quota_exhausted" };
  }
  if (outcome === "no_session") {
    return { action: "require_reauth" };
  }
  if (outcome === "session_not_active") {
    // La grâce serveur est dépassée : expiration confirmée.
    return { action: "require_reauth", reason: "HEARTBEAT_TIMEOUT" };
  }
  if (outcome === "ok") {
    const ttlMs = heartbeatTtlMsFromServer(r);
    if (ttlMs <= 0) {
      // Le serveur répond « ok » mais sans échéance exploitable : AUCUNE
      // extension aveugle. Une panne de contrôle ne doit pas accorder un
      // accès illimité.
      return { action: "block", reason: "HEARTBEAT_TIMEOUT" };
    }
    return { action: "authorize", ttlMs };
  }

  // heartbeat_failed, réponse inconnue → blocage préventif.
  return { action: "block", reason: "HEARTBEAT_TIMEOUT" };
}

// ————————————————————————————————————————————————————————————
// Signal serveur (quota-status) → décision d'écran.
// Le téléphone reflète UNIQUEMENT ce que le serveur a confirmé. Une
// session « authorized/active » SANS référence routeur n'est pas encore
// un accès : c'est un « unconfirmed » (à n'afficher JAMAIS comme
// « Connecté »).
// ————————————————————————————————————————————————————————————
export interface ServerSessionView {
  status?: string;
  disconnect_reason?: string | null;
  router_session_reference?: string | null;
  heartbeat_expires_at?: string | null;
  bytes_in?: number;
  bytes_out?: number;
  bytes_total?: number;
}

export type ServerSignal =
  | { mode: "none" }
  | { mode: "active" }
  | { mode: "suspended" }
  | { mode: "authorizing" }
  | { mode: "unconfirmed" }
  | { mode: "quota_exhausted" }
  | { mode: "closed"; reason: DisconnectReason | undefined };

export function signalFromServer(
  s?: ServerSessionView | null,
  opts?: { enforceExpiry?: boolean; now?: number }
): ServerSignal {
  const status = s?.status ?? "";
  if (!status) return { mode: "none" };

  if (status === "paused") return { mode: "suspended" };
  if (status === "pending" || status === "authorizing") return { mode: "authorizing" };

  const reason = (s?.disconnect_reason as DisconnectReason | null | undefined) ?? undefined;
  if (status === "authorized" || status === "active") {
    // En démo, une session « active » SANS battement de présence frais est
    // une session échue : la grâce serveur (heartbeat_expires_at) est dépassée,
    // elle n'est PLUS un accès valide (obsolète il peut en rester une après
    // un ancien octroi — elle ne doit ni imposer authorizing_wifi ni
    // interférer avec un nouveau flux de connexion).
    if (opts?.enforceExpiry && opts.now !== undefined && s?.heartbeat_expires_at) {
      const exp = Date.parse(s.heartbeat_expires_at);
      if (!Number.isNaN(exp) && exp <= opts.now) {
        return { mode: "closed", reason: "HEARTBEAT_TIMEOUT" };
      }
    }
    return Boolean(s?.router_session_reference) ? { mode: "active" } : { mode: "unconfirmed" };
  }
  if (reason === "QUOTA_EXHAUSTED") return { mode: "quota_exhausted" };
  return { mode: "closed", reason };
}

// ————————————————————————————————————————————————————————————
// Application du signal serveur sur la machine locale.
//  - En mode démo Android, « active » exige une autorisation NATIVE
//    réellement en place (state ALLOWED + TTL positif). Sans elle, une
//    panne de contrôle ne montre JAMAIS un accès actif.
//  - En mode MikroTik, la confirmation routeur (référence de session
//    posée par l'agent) suffit : le serveur est l'autorité du routeur.
// ————————————————————————————————————————————————————————————
export type ClientDecision =
  | { apply: false }
  | {
      apply: true;
      wantState?: ConnectionState;
      wantInternet?: InternetStatus;
      reason?: DisconnectReason;
    };

export function applyServerSignal(
  signal: ServerSignal,
  current: ConnectionState,
  opts: { isVpnDemo: boolean; nativeAllowed: boolean }
): ClientDecision {
  switch (signal.mode) {
    case "none":
      return { apply: false };

    case "suspended":
      // Session vivante mais en pause côté serveur : on reflète la pause
      // (trafic coupé localement, libellé « en pause »).
      return {
        apply: true,
        wantInternet: "active",
        wantState: current === "wifi_active" ? "paused" : undefined,
      };

    case "authorizing":
      return {
        apply: true,
        wantState: current === "idle" || current === "wifi_active" ? "authorizing_wifi" : undefined,
      };

    case "unconfirmed":
      // authorized/active SANS référence routeur → pas un accès confirmé.
      return {
        apply: true,
        wantInternet: "cut",
        wantState: current === "idle" || current === "wifi_active" ? "authorizing_wifi" : undefined,
      };

    case "active": {
      const confirmed = opts.isVpnDemo ? opts.nativeAllowed : true;
      if (!confirmed) {
        // En démo, une session serveur active ne vaut RIEN sans autorisation
        // native vérifiée (le VpnService peut être bloqué) : jamais « Connecté ».
        return {
          apply: true,
          wantInternet: "cut",
          wantState: current === "idle" || current === "wifi_active" ? "authorizing_wifi" : undefined,
        };
      }
      return {
        apply: true,
        wantInternet: "active",
        wantState:
          current === "idle" || current === "authorizing_wifi" || current === "paused"
            ? "wifi_active"
            : undefined,
      };
    }

    case "quota_exhausted":
      return {
        apply: true,
        wantInternet: "cut",
        wantState: current === "quota_exhausted" ? undefined : "quota_exhausted",
        reason: "QUOTA_EXHAUSTED",
      };

    case "closed":
      // Sécurité : une session fermée/expirée n'accorde JAMAIS d'accès.
      // La seule issue est une autorisation vérifiée (nouvelle publicité).
      return {
        apply: true,
        wantInternet: "cut",
        wantState: current === "idle" ? undefined : "idle",
        reason: signal.reason,
      };
  }
}

// ————————————————————————————————————————————————————————————
// Réconciliation avec les compteurs MikroTik (préparation).
// Documente la paire { serveur, routeur } attendue par l'edge function
// de réconciliation : le DELTA = consommation serveur − total routeur.
// Un delta négatif signale une consommation non (encore) reportée.
// ————————————————————————————————————————————————————————————
export interface RouterCountersView {
  bytesIn?: number;
  bytesOut?: number;
  bytesTotal?: number;
}

export interface ReconciliationReport {
  server: { quotaBytes: number; consumedBytes: number; remainingBytes: number; unit: string };
  router: { bytesIn: number; bytesOut: number; bytesTotal: number };
  quotaRemainingPerServerBytes: number;
  /** null tant que le compteur routeur total est inconnu. */
  deltaWhenRouterTotalKnown: number | null;
}

export function buildReconciliationReport(
  allocation: { quota_bytes?: number; remaining_bytes?: number } | null | undefined,
  session: ServerSessionView | null | undefined
): ReconciliationReport {
  const quotaBytes = Number(allocation?.quota_bytes ?? 0);
  const remainingBytes = Math.max(0, Number(allocation?.remaining_bytes ?? quotaBytes));
  const consumedBytes = quotaConsumedBytes(quotaBytes, remainingBytes);
  const router = {
    bytesIn: Number(session?.bytes_in ?? 0),
    bytesOut: Number(session?.bytes_out ?? 0),
    bytesTotal: Number(session?.bytes_total ?? 0),
  };
  const routerTotalKnown = Boolean(session?.bytes_total);
  return {
    server: { quotaBytes, consumedBytes, remainingBytes, unit: SERVER_QUOTA_UNIT },
    router,
    quotaRemainingPerServerBytes: remainingBytes,
    deltaWhenRouterTotalKnown: routerTotalKnown ? consumedBytes - router.bytesTotal : null,
  };
}

/**
 * Seuil de défaillances consécutives du contrôle (heartbeat + quota-status)
 * au-delà duquel le client considère la liaison de contrôle perdue et exige
 * une ré-autorisation vérifiée (motif NETWORK_LOST). Une panne de contrôle
 * ne doit JAMAIS se traduire par un maintien silencieux de l'accès.
 */
export const CONTROL_FAILURE_THRESHOLD = 3;

// ————————————————————————————————————————————————————————————
// Décision d'échec de REPRISE (resumeFromPaused).
// Une panne TRANSITOIRE (réseau, serveur indisponible, délai dépassé) ne doit
// JAMAIS volatiliser l'état « en pause » : on reste suspendu, on affiche une
// erreur compréhensible et l'utilisateur peut réessayer. Seule une fin de
// session CONFIRMÉE (quota, échéance inutilisable, session fermée) sort
// définitivement de la pause (→ idle, nouvelle autorisation exigée).
// ————————————————————————————————————————————————————————————
export type ResumeFailure = "stay_paused" | "quota_exhausted" | "to_idle";

const DEFAULT_TRANSIENT_REASONS: ReadonlySet<string> = new Set([
  "timeout",
  "network_error",
  "session_failed",
  "unknown",
]);

export function resumeFailureAction(
  reason: string | undefined,
  opts?: { transientReasons?: ReadonlySet<string> }
): ResumeFailure {
  if (reason === "quota_exhausted") return "quota_exhausted";
  const transients = opts?.transientReasons ?? DEFAULT_TRANSIENT_REASONS;
  if (!reason || transients.has(reason)) return "stay_paused";
  return "to_idle";
}