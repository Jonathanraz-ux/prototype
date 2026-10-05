import { logger } from "../lib/logger";
import type { NetworkAccessAdapter, NetworkHealth } from "./NetworkAccessAdapter";
import { DevelopmentNetworkAdapter } from "./DevelopmentNetworkAdapter";
import { RadiusNetworkAdapter } from "./RadiusNetworkAdapter";
import { MikrotikNetworkAdapter } from "./MikrotikNetworkAdapter";
import { AndroidVpnDemoAdapter } from "./AndroidVpnDemoAdapter";

export { AndroidVpnDemoAdapter } from "./AndroidVpnDemoAdapter";
export { DevelopmentNetworkAdapter } from "./DevelopmentNetworkAdapter";
export { MikrotikNetworkAdapter, type MikrotikHealthDetail } from "./MikrotikNetworkAdapter";
export { RadiusNetworkAdapter } from "./RadiusNetworkAdapter";
export type { NetworkProviderKind } from "./NetworkAccessAdapter";
export * from "./NetworkAccessAdapter";

const TAG = "net:factory";

/**
 * Lecture d'environnement NON bloquante.
 *
 * `getConfig()` lève une erreur volontaire quand la configuration est
 * absente ou invalide : c'est le comportement voulu au démarrage de
 * l'application. La fabrique d'adaptateur, elle, ne doit jamais faire
 * exploser un arbre de composants (tests, previews, écrans partiels) :
 * elle lit donc la valeur brute et laisse la validation à `getConfig()`.
 */
function safeEnv(key: string): string | undefined {
  const value = process.env[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function safeIsDevelopment(): boolean {
  return safeEnv("EXPO_PUBLIC_APP_ENV") === "development";
}

export type NetworkMode = "mikrotik" | "android_vpn_demo" | "mock" | "radius" | "not_configured";

const KNOWN_MODES: readonly string[] = [
  "mikrotik",
  "android_vpn_demo",
  "mock",
  "radius",
  "development",
  "not_configured",
];

/** `development` est un simple synonyme de `mock` : on le normalise. */
function normalizeMode(mode: string): NetworkMode | null {
  if (mode === "development") return "mock";
  return KNOWN_MODES.includes(mode) ? (mode as NetworkMode) : null;
}

/**
 * Mode réseau effectif, SANS jamais lire `process.env` ici.
 *
 * Fonction pure, testable : la source de vérité du mode est
 * `EXPO_PUBLIC_NETWORK_MODE` validé par Zod dans `lib/config.ts`
 * (`getConfig()`), que `ConnectionContext` appelle AVANT de résoudre
 * l'adaptateur et qui applique le garde-fou production.
 *
 * Conséquence de sûreté : `NETWORK_ADAPTER_TYPE` n'est PLUS consulté ici.
 * C'est un secret SERVEUR (déclaré dans `.env.example` sous
 * « Supabase Edge Functions Secrets ») ; s'il se retrouve dans le `.env`
 * chargé par Expo, il ne peut plus détourner silencieusement l'adaptateur
 * client ni court-circuiter la validation Zod. Un mode inconnu retombe
 * franchement sur `not_configured` (adaptateur vide) au lieu d'être
 * interprété.
 */
export function pickNetworkMode(input: {
  overrideMode?: string;
  envMode?: string;
  isDev?: boolean;
}): NetworkMode {
  const candidate = input.overrideMode ?? input.envMode;
  if (candidate) {
    const mode = normalizeMode(candidate);
    if (mode) return mode;
    // Mode EXPLICITE mais inconnu (faute de frappe d'opérateur : « mikrotiik »,
    // « Radius »…). On ne retombe JAMAIS sur une simulation : le repère est
    // l'adaptateur VIDE, qui refuse tout accès et force le diagnostic.
    logger.warn(TAG, `Mode réseau inconnu, aucun adaptateur simulé : ${candidate}`);
    return "not_configured";
  }
  // Aucun mode fourni du tout : on suit l'environnement applicatif.
  return input.isDev ? "mock" : "not_configured";
}

/**
 * Résout l'adaptateur réseau selon le mode demandé ou configuré.
 *
 * - android_vpn_demo : contrôle VPN local Android autonome (sans routeur physique)
 * - mikrotik          : pilote MikroTik via commandes serveur et agent local
 * - mock / development : mock local développement
 * - radius            : pilote FreeRADIUS
 * - not_configured    : adaptateur vide
 *
 * `overrideMode` provient de `getConfig()` côté application : la validation
 * et le garde-fou production ont donc déjà été joués. Sans override, on lit
 * `EXPO_PUBLIC_NETWORK_MODE` par une lecture non bloquante (`safeEnv`) afin
 * que la résolution ne puisse pas exploser hors d'un environnement configuré.
 */
export function resolveNetworkAdapter(overrideMode?: string): NetworkAccessAdapter {
  const adapterType = pickNetworkMode({
    overrideMode,
    envMode: safeEnv("EXPO_PUBLIC_NETWORK_MODE"),
    isDev: safeIsDevelopment(),
  });

  switch (adapterType) {
    case "android_vpn_demo":
      return new AndroidVpnDemoAdapter();
    case "mock":
      return new DevelopmentNetworkAdapter();
    case "radius":
      return new RadiusNetworkAdapter({ enabled: true });
    case "mikrotik":
      return new MikrotikNetworkAdapter({ enabled: true });
    case "not_configured":
    default:
      return new UnconfiguredAdapter();
  }
}

/**
 * Adaptateur "vide" renvoyant NOT_CONFIGURED : utilisé tant que les
 * données réseau réelles ne sont pas fournies. Ne simule rien.
 */
class UnconfiguredAdapter implements NetworkAccessAdapter {
  readonly name = "unconfigured";
  readonly providerKind = "unconfigured" as const;

  async healthCheck(): Promise<NetworkHealth> {
    return "NOT_CONFIGURED";
  }
  async authorizeSession() {
    return { success: false as const, health: "NOT_CONFIGURED" as const, reason: "NOT_CONFIGURED" };
  }
  async getSessionUsage() {
    return { consumedSeconds: 0, consumedBytes: 0, available: false };
  }
  async disconnectSession() {
    // no-op
  }
}

/** Santé résolue + honnêteté de la chaîne amont. */
export interface NetworkDetail {
  health: NetworkHealth;
  /**
   * true quand le fournisseur « live » n'est PAS confirmé comme matériel
   * réel : agent de test (`MIKROTIK_MOCK`) ou information absente. Dans les
   * deux cas l'interface affiche une simulation et masque les compteurs : on
   * ne prétend JAMAIS qu'un routeur pilote le trafic sans preuve.
   */
  agentSimulated: boolean;
}

/**
 * Lit la santé de la chaîne réseau en UN seul appel quand l'adaptateur sait
 * donner le détail (MikroTik), et se rabat proprement sur `healthCheck()`
 * pour les autres.
 *
 * Fonction volontairement tolérante : une erreur de détail ne doit jamais
 * empêcher la connexion — elle se traduit par un repli sur `healthCheck()`.
 *
 * Ce repli est « fail closed » : un adaptateur qui ne sait PAS dire s'il est
 * simulé est traité comme simulé. Un serveur plus ancien (avant le champ
 * `simulated`) ou une réponse tronquée font donc afficher « routeur simulé »
 * plutôt que d'affirmer un routeur réel que personne n'a confirmé. Le
 *hiccup est visible et réversible ; un faux « réel » ne l'est pas.
 */
export async function readNetworkDetail(adapter: NetworkAccessAdapter): Promise<NetworkDetail> {
  const withDetail = adapter as {
    healthCheckDetail?: () => Promise<{ health: NetworkHealth; simulated?: boolean }>;
  };
  if (typeof withDetail.healthCheckDetail === "function") {
    try {
      const detail = await withDetail.healthCheckDetail();
      if (detail) {
        // `simulated` absent ⇒ non confirmé ⇒ traité comme simulé.
        return { health: detail.health, agentSimulated: detail.simulated !== false };
      }
    } catch {
      // On retombe sur healthCheck() ci-dessous.
    }
  }
  return { health: await adapter.healthCheck(), agentSimulated: true };
}
