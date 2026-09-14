import type {
  NetworkAccessAdapter,
  NetworkHealth,
  AuthorizeSessionInput,
  AuthorizeSessionResult,
  SessionUsage,
} from "./NetworkAccessAdapter";
import { vpnBlocker } from "../services/vpnBlocker";
import { logger } from "../lib/logger";

const TAG = "net:android-vpn";

/**
 * AndroidVpnDemoAdapter — Adaptateur réseau pour la démonstration locale Android.
 *
 * Dans ce mode :
 * - Aucun routeur physique MikroTik ni agent local n'est requis.
 * - L'application contrôle localement l'accès Internet des autres applications via VpnBlocker.
 * - Bôjô conserve son accès réseau (exclu via addDisallowedApplication).
 * - L'état ALLOWED retire le tunnel TUN, BLOCKED établit le tunnel de capture.
 */
export class AndroidVpnDemoAdapter implements NetworkAccessAdapter {
  readonly name = "android_vpn_demo";

  async healthCheck(): Promise<NetworkHealth> {
    if (!vpnBlocker.isAvailable()) {
      return "NOT_CONFIGURED";
    }
    const granted = await vpnBlocker.isConsentGranted();
    if (!granted) {
      return "AUTHENTICATION_FAILED";
    }
    const status = await vpnBlocker.getStatus();
    if (status.state === "ERROR") {
      return "ERROR";
    }
    return "READY";
  }

  async authorizeSession(_input: AuthorizeSessionInput): Promise<AuthorizeSessionResult> {
    if (!vpnBlocker.isAvailable()) {
      return {
        success: false,
        health: "NOT_CONFIGURED",
        reason: "Module VpnBlocker non disponible sur cette plateforme.",
      };
    }

    const consentGranted = await vpnBlocker.isConsentGranted();
    if (!consentGranted) {
      return {
        success: false,
        health: "AUTHENTICATION_FAILED",
        reason: "Consentement VPN requis.",
      };
    }

    // Ce chemin n'autorise JAMAIS le trafic par lui-même : l'autorisation
    // native n'est accordée qu'après une validation serveur explicite
    // (request_demo_wifi_session / heartbeat) effectuée par ConnectionContext.
    // Ici on refuse (état BLOCKED) plutôt que de débloquer sans preuve serveur.
    await vpnBlocker.setAuthorized(0);
    return {
      success: false,
      health: "ERROR",
      reason: "Autorisation native subordonnée à une validation serveur.",
    };
  }

  async getSessionUsage(_reference: string): Promise<SessionUsage> {
    // Dans le mode démo, le compteur est simulé / géré côté serveur
    return {
      consumedSeconds: 0,
      consumedBytes: 0,
      available: true,
    };
  }

  async disconnectSession(_reference: string): Promise<void> {
    logger.info(TAG, "Déconnexion session démo VPN");
    await vpnBlocker.blockNow();
  }
}
