import { callFunction, getLicenseApiUrl } from "../lib/functions";
import { getSupabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import type { LicenseCheckResult, LicenseInfo } from "../types";

const TAG = "license";

export type LicenseState =
  | "valid"
  | "expired"
  | "suspended"
  | "revoked"
  | "unreachable"
  | "unknown";

export interface LicenseStatus {
  state: LicenseState;
  details?: LicenseInfo;
  message?: string;
  checkedAt: string;
}

/**
 * Vérifie la licence via la Edge Function sécurisée 'check-license'.
 * L'application ne décide JAMAIS elle-même si la licence est valide :
 * elle dépend d'un jeton signé émis par le serveur.
 */
export async function checkLicense(): Promise<LicenseStatus> {
  const baseUrl = getLicenseApiUrl();

  try {
    const res = await callFunction<LicenseCheckResult>("check-license", {
      app_version: getAppVersionSafe(),
    });

    if (!res.ok) {
      // Le serveur est indisponible : on ne peut pas statuer. L'app affichera
      // un état explicite, sauf si un jeton signé encore valide est en cache.
      return { state: "unreachable", checkedAt: new Date().toISOString() };
    }

    const result = res.data;
    return {
      state: result.status,
      details: result.license,
      checkedAt: new Date().toISOString(),
    };
  } catch (e) {
    logger.warn(TAG, "Vérification de licence impossible", e);
    return { state: "unreachable", checkedAt: new Date().toISOString() };
  }
}

function getAppVersionSafe(): string {
  try {
    const constants = require("expo-constants") as typeof import("expo-constants");
    return constants.default.expoConfig?.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Lecture locale en lecture seule de la licence (consommation UI),
 * jamais utilisée pour autoriser une action critique.
 */
export async function getLicenseInfoLocal(): Promise<LicenseInfo | undefined> {
  const { data } = await getSupabase()
    .from("licenses")
    .select("*")
    .maybeSingle();
  return data ? (data as unknown as LicenseInfo) : undefined;
}
