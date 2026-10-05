// ============================================================
// _shared/network-config.ts — Détection et résolution de la
// configuration de l'adaptateur réseau côté serveur.
// ============================================================

export type NetworkHealth =
  | "READY"
  | "NOT_CONFIGURED"
  | "UNREACHABLE"
  | "AUTHENTICATION_FAILED"
  | "ERROR";

export interface NetworkConfig {
  adapterType: "mikrotik" | "radius" | "development" | null;
  configured: boolean;
  health: NetworkHealth;
  /**
   * true quand la chaîne n'est PAS confirmée comme matériel réel : agent de
   * TEST parlant à `lib/mock-router.mjs` au lieu d'un RouterOS
   * (`MIKROTIK_MOCK`), OU absence de confirmation opérateur
   * (`MIKROTIK_REAL`). Voir `isMikrotikSimulated` pour la règle complète.
   *
   * Règle absolue du projet : ne JAMAIS présenter une simulation comme un
   * fonctionnement réseau réel. Le client affiche donc « routeur simulé »
   * et masque les compteurs lorsque ce drapeau est levé. Le défaut est
   * `true` : mieux vaut afficher une prudence que d'affirmer du matériel
   * qui n'existe pas.
   */
  simulated: boolean;
}

/**
 * Le pilote MikroTik est-il RÉELMENT branché sur du matériel ?
 *
 * MODE « FAIL CLOSED » — c'est un choix de sûreté, à conserver.
 *
 * L'agent local choisit son pilote par l'argument CLI `--mock`, dans SON
 * propre processus. La fonction serveur ne voit pas cet argument : le seul
 * moyen fiable de savoir si le routeur existe est donc qu'un opérateur
 * l'affirme explicitement. Sans preuve, l'application ne peut pas prétendre
 * piloter un routeur réel.
 *
 *   MIKROTIK_MOCK=1   → simulation affirmée (prioritaire si les deux sont posés)
 *   MIKROTIK_REAL=1   → matériel réel AFFIRMÉ par l'opérateur
 *   (rien)            → SIMULÉ par prudence : on ne fabrique pas de certitude
 *
 * Toute valeur « vraie » est acceptée (`1`, `true`, `yes`, `on`), insensible à
 * la casse et aux espaces. Si les deux variables se contredisent, c'est la
 * simulation qui l'emporte : afficher « routeur simulé » est réversible,
 * afficher « routeur réel » sur du matériel absent ne l'est pas.
 */
function isTruthyEnv(name: string): boolean {
  const raw = (Deno.env.get(name) ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Le hardware MikroTik est-il confirmé par un opérateur ? */
export function isMikrotikHardwareReal(): boolean {
  if (isTruthyEnv("MIKROTIK_MOCK")) return false;
  return isTruthyEnv("MIKROTIK_REAL");
}

/**
 * Le pilote MikroTik est-il simulé ? `true` par défaut : voir la note
 * « fail closed » ci-dessus.
 */
export function isMikrotikSimulated(): boolean {
  return !isMikrotikHardwareReal();
}

export function resolveNetworkConfig(): NetworkConfig {
  const type = Deno.env.get("NETWORK_ADAPTER_TYPE") ?? "";
  // Le drapeau de simulation ne concerne QUE MikroTik : ni un adaptateur
  // absent ni un adaptateur RADIUS ne peuvent être « simulés ».
  const simulated = type === "mikrotik" ? isMikrotikSimulated() : false;

  if (type === "mikrotik") {
    if (!Deno.env.get("MIKROTIK_HOST")) {
      // `health: NOT_CONFIGURED` porte déjà l'honnêteté ici : on ne déclare
      // pas « simulé » un adaptateur inexistant, on le déclare absent.
      return { adapterType: "mikrotik", configured: false, health: "NOT_CONFIGURED", simulated: false };
    }
    // Configuré : c'est ici que l'app pourrait afficher « routeur réel ».
    return { adapterType: "mikrotik", configured: true, health: "READY", simulated: isMikrotikSimulated() };
  }

  if (type === "radius") {
    if (!Deno.env.get("RADIUS_HOST") || !Deno.env.get("RADIUS_SECRET")) {
      return { adapterType: "radius", configured: false, health: "NOT_CONFIGURED", simulated };
    }
    return { adapterType: "radius", configured: true, health: "READY", simulated };
  }

  return { adapterType: null, configured: false, health: "NOT_CONFIGURED", simulated };
}

export function matchesAdapter(adapter?: string): boolean {
  const cfg = resolveNetworkConfig();
  if (!cfg.adapterType) return false;
  if (!adapter) return true;
  return cfg.adapterType === adapter;
}

/** Génère une référence de session réseau (jamais de secrets). */
export function newSessionReference(prefix: string): string {
  const rand = crypto.randomUUID();
  return `${prefix}-${rand}`;
}
