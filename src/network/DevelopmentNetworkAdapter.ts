import { isDevelopment } from "../lib/config";
import { logger } from "../lib/logger";
import type {
  NetworkAccessAdapter,
  NetworkHealth,
  AuthorizeSessionInput,
  AuthorizeSessionResult,
  SessionUsage,
} from "./NetworkAccessAdapter";

const TAG = "net:dev";

/**
 * DevelopmentNetworkAdapter
 * -------------------------
 * Utilisé UNIQUEMENT pour les tests locaux. Il simule un accès réseau
 * sans équipement réel. Il est IMPOSSIBLE de l'activer dans une build
 * de production : le constructeur lève une erreur si l'environnement
 * n'est pas le développement.
 *
 * Il ne prétend jamais représenter une vraie intégration.
 */
export class DevelopmentNetworkAdapter implements NetworkAccessAdapter {
  readonly name = "development";

  constructor() {
    if (!isDevelopment()) {
      throw new Error(
        "DevelopmentNetworkAdapter ne peut être utilisé qu'en environnement de développement."
      );
    }
  }

  async healthCheck(): Promise<NetworkHealth> {
    return "READY";
  }

  async authorizeSession(input: AuthorizeSessionInput): Promise<AuthorizeSessionResult> {
    logger.info(TAG, "Session simulée (dev uniquement)", input.username);
    return {
      success: true,
      reference: `dev-session-${Date.now()}`,
    };
  }

  async getSessionUsage(_reference: string): Promise<SessionUsage> {
    return { consumedSeconds: 0, consumedBytes: 0, available: false };
  }

  async disconnectSession(_reference: string): Promise<void> {
    // no-op en développement
  }
}
