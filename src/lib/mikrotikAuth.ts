// ============================================================
// mikrotikAuth.ts — Attente vérifiée de la confirmation d'une
// session MikroTik côté SERVEUR.
//
// Le client n'accède JAMAIS au routeur : l'autorisation est
// confirmée lorsque la vue serveur (quota-status) passe à
// « active » (router_session_reference renseignée par l'agent).
// Rien n'est assumé : toute échéance, toute session non confirmée
// est traitée comme un échec, jamais comme un accès acquis.
// ============================================================

import { signalFromServer, type ServerSignal } from "./sessionControl";
import type { QuotaStatusShape } from "../repositories/sessionRepository";

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_POLL_INTERVAL_MS = 1200;

export interface WaitForAuthorizationOptions {
  /** Relit l'état serveur (quota-status). */
  fetchStatus: () => Promise<QuotaStatusShape>;
  /** Délai maximal d'attente de la confirmation. */
  timeoutMs?: number;
  /** Période de scrutation. */
  pollIntervalMs?: number;
  /** Injectable pour les tests (setTimeout). */
  delay?: (ms: number) => Promise<void>;
  /** Annulation (session suspendue / arrière-plan) — toute réponse tardive ignorée. */
  isCancelled?: () => boolean;
  /** Dérivation du signal serveur (injectable pour les tests). */
  getSignal?: (st: QuotaStatusShape) => ServerSignal;
  /** Rappel à chaque lecture (met à jour l'affichage quota). */
  onPoll?: (st: QuotaStatusShape) => void;
}

export interface WaitForAuthorizationResult {
  ok: boolean;
  signal?: ServerSignal;
  interrupted?: boolean;
}

function defaultDelay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scrute la vue serveur jusqu'à ce que la session soit confirmée
 * « active », ou jusqu'à un verdict terminal (quota épuisé, session
 * fermée) ou l'expiration du délai. Ne renvoie ok:true que sur un
 * signal serveur « active » explicite.
 */
export async function waitForMikrotikAuthorization(
  options: WaitForAuthorizationOptions
): Promise<WaitForAuthorizationResult> {
  const {
    fetchStatus,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    delay = defaultDelay,
    isCancelled = () => false,
    getSignal = (st) => signalFromServer(st.session),
    onPoll,
  } = options;

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (isCancelled()) return { ok: false, interrupted: true };

    const st = await fetchStatus();
    if (isCancelled()) return { ok: false, interrupted: true };
    onPoll?.(st);

    const signal = getSignal(st);
    if (signal.mode === "active") return { ok: true, signal };
    if (signal.mode === "quota_exhausted" || signal.mode === "closed") {
      return { ok: false, signal };
    }
    if (Date.now() >= deadline) return { ok: false, signal };

    await delay(pollIntervalMs);
  }
}