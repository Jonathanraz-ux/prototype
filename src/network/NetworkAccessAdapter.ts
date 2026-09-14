// ============================================================
// NetworkAccessAdapter — Abstraction d'accès au réseau Wi-Fi.
//
// L'application mobile ne communique JAMAIS directement avec le
// routeur ou le serveur RADIUS. Toutes les opérations passent par
// cette abstraction, implémentée côté mobile pour formater les
// demandes vers les Edge Functions (qui, elles, pilotent
// RADIUS/MikroTik avec les secrets serveur).
// ============================================================

export type NetworkHealth =
  | "READY"
  | "NOT_CONFIGURED"
  | "UNREACHABLE"
  | "AUTHENTICATION_FAILED"
  | "ERROR";

/**
 * Distingue un fournisseur RÉEL (pilote un équipement réseau : MikroTik,
 * RADIUS) d'un fournisseur de SIMULATION (VPN local Android, mock de
 * développement) et d'aucun fournisseur configuré.
 *
 * L'UI s'appuie sur ce drapeau pour ne JAMAIS présenter une simulation
 * comme un accès réseau réel (règle CONSIGNES_PROJET.md §2.5).
 */
export type NetworkProviderKind = "live" | "simulated" | "unconfigured";

export interface AuthorizeSessionInput {
  networkSessionReference?: string;
  username: string;
  siteId?: string;
  routerId?: string;
  allocatedSeconds: number;
  allocatedBytes: number;
  ipAddress?: string;
}

export type AuthorizeSessionResult =
  | {
      success: true;
      reference: string;
    }
  | {
      success: false;
      health: NetworkHealth;
      reason?: string;
    };

export interface SessionUsage {
  consumedSeconds: number;
  consumedBytes: number;
  available: boolean;
}

export interface NetworkAccessAdapter {
  readonly name: string;
  /** "live" = équipement réel, "simulated" = simulation locale, "unconfigured". */
  readonly providerKind: NetworkProviderKind;
  healthCheck(): Promise<NetworkHealth>;
  authorizeSession(input: AuthorizeSessionInput): Promise<AuthorizeSessionResult>;
  getSessionUsage(reference: string): Promise<SessionUsage>;
  disconnectSession(reference: string): Promise<void>;
}
