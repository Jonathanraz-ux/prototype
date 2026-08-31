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
}

export function resolveNetworkConfig(): NetworkConfig {
  const type = Deno.env.get("NETWORK_ADAPTER_TYPE") ?? "";

  if (type === "mikrotik") {
    if (!Deno.env.get("MIKROTIK_HOST")) {
      return { adapterType: "mikrotik", configured: false, health: "NOT_CONFIGURED" };
    }
    return { adapterType: "mikrotik", configured: true, health: "READY" };
  }

  if (type === "radius") {
    if (!Deno.env.get("RADIUS_HOST") || !Deno.env.get("RADIUS_SECRET")) {
      return { adapterType: "radius", configured: false, health: "NOT_CONFIGURED" };
    }
    return { adapterType: "radius", configured: true, health: "READY" };
  }

  return { adapterType: null, configured: false, health: "NOT_CONFIGURED" };
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
