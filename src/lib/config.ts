import { z } from "zod";

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url("EXPO_PUBLIC_SUPABASE_URL doit être une URL valide"),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "EXPO_PUBLIC_SUPABASE_ANON_KEY est requis"),
  EXPO_PUBLIC_APP_ENV: z.enum(["development", "pilot", "production"]).default("development"),
  EXPO_PUBLIC_LICENSE_API_URL: z.preprocess(
    emptyToUndefined,
    z.string().url("EXPO_PUBLIC_LICENSE_API_URL doit être une URL valide").optional()
  ),
  EXPO_PUBLIC_PRIVACY_POLICY_URL: z.preprocess(
    emptyToUndefined,
    z.string().url("EXPO_PUBLIC_PRIVACY_POLICY_URL doit être une URL valide").optional()
  ),
  EXPO_PUBLIC_TERMS_URL: z.preprocess(
    emptyToUndefined,
    z.string().url("EXPO_PUBLIC_TERMS_URL doit être une URL valide").optional()
  ),
  EXPO_PUBLIC_SUPPORT_PHONE: z.preprocess(emptyToUndefined, z.string().optional()),
  EXPO_PUBLIC_SUPPORT_EMAIL: z.preprocess(
    emptyToUndefined,
    z.string().email("EXPO_PUBLIC_SUPPORT_EMAIL doit être un email valide").optional()
  ),
  EXPO_PUBLIC_DEFAULT_SITE_ID: z.preprocess(
    emptyToUndefined,
    z.string().uuid("EXPO_PUBLIC_DEFAULT_SITE_ID doit être un UUID valide").optional()
  ),
  EXPO_PUBLIC_NETWORK_MODE: z.enum(["mikrotik", "android_vpn_demo", "mock"]).default("mikrotik"),
  // La démo VPN (blocage d'annonces Android) ne doit JAMAIS partir en
  // production par inadvertance : en production elle exige une
  // confirmation explicite.
  EXPO_PUBLIC_ALLOW_VPN_DEMO_IN_PRODUCTION: z
    .enum(["true", "false"])
    .default("false"),
});

type EnvConfig = z.infer<typeof envSchema>;

let _config: EnvConfig | null = null;

/**
 * Règle métier pure : la démo VPN est-elle autorisée ?
 *
 * Extraite de `getConfig` pour être testable directement : babel
 * fige les `process.env.EXPO_PUBLIC_*` à la compilation, donc aucun
 * test ne peut injecter d'environnement en réassignant `process.env`.
 *
 * @returns message d'erreur, ou null si la combinaison est acceptable.
 */
export function checkNetworkModeAllowed(input: {
  appEnv?: string;
  networkMode?: string;
  allowVpnDemoInProduction?: string;
}): string | null {
  const { appEnv, networkMode, allowVpnDemoInProduction } = input;
  if (appEnv !== "production") return null;
  if (networkMode !== "android_vpn_demo") return null;
  if (allowVpnDemoInProduction === "true") return null;
  return (
    "Configuration refusée : EXPO_PUBLIC_NETWORK_MODE=android_vpn_demo est interdit en production " +
    "(le blocage d'annonces ne remplace pas le filtrage du routeur).\n" +
    "Utilisez EXPO_PUBLIC_NETWORK_MODE=mikrotik, ou explicitement " +
    "EXPO_PUBLIC_ALLOW_VPN_DEMO_IN_PRODUCTION=true pour une démo assumée."
  );
}

export function getConfig(): EnvConfig {
  if (_config) return _config;

  const raw = {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV ?? "development",
    EXPO_PUBLIC_LICENSE_API_URL: process.env.EXPO_PUBLIC_LICENSE_API_URL ?? "",
    EXPO_PUBLIC_PRIVACY_POLICY_URL: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? "",
    EXPO_PUBLIC_TERMS_URL: process.env.EXPO_PUBLIC_TERMS_URL ?? "",
    EXPO_PUBLIC_SUPPORT_PHONE: process.env.EXPO_PUBLIC_SUPPORT_PHONE ?? "",
    EXPO_PUBLIC_SUPPORT_EMAIL: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "",
    EXPO_PUBLIC_DEFAULT_SITE_ID: process.env.EXPO_PUBLIC_DEFAULT_SITE_ID ?? "",
    EXPO_PUBLIC_NETWORK_MODE: process.env.EXPO_PUBLIC_NETWORK_MODE ?? "mikrotik",
    EXPO_PUBLIC_ALLOW_VPN_DEMO_IN_PRODUCTION:
      process.env.EXPO_PUBLIC_ALLOW_VPN_DEMO_IN_PRODUCTION ?? "false",
  };

  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([key, val]) => `  ${key}: ${val?.join(", ")}`)
      .join("\n");
    throw new Error(
      `Configuration d'environnement invalide :\n${messages}\n\nCopiez .env.example en .env et renseignez les valeurs.`
    );
  }

  const parsed = result.data;

  // Garde-fou production : la démo VPN simule le blocage d'annonces
  // sur le téléphone de l'abonné. La laisser active en production
  // donnerait l'illusion que le WiFi est filtré alors que seul le
  // routeur MikroTik peut le garantir.
  const refusal = checkNetworkModeAllowed({
    appEnv: parsed.EXPO_PUBLIC_APP_ENV,
    networkMode: parsed.EXPO_PUBLIC_NETWORK_MODE,
    allowVpnDemoInProduction: parsed.EXPO_PUBLIC_ALLOW_VPN_DEMO_IN_PRODUCTION,
  });
  if (refusal) throw new Error(refusal);

  _config = parsed;
  return _config;
}

export function isDevelopment(): boolean {
  return getConfig().EXPO_PUBLIC_APP_ENV === "development";
}

export function isPilot(): boolean {
  return getConfig().EXPO_PUBLIC_APP_ENV === "pilot";
}

export function isProduction(): boolean {
  return getConfig().EXPO_PUBLIC_APP_ENV === "production";
}

export function isDevModeEnabled(): boolean {
  return isDevelopment() && __DEV__;
}

export function isAndroidVpnDemo(): boolean {
  return getConfig().EXPO_PUBLIC_NETWORK_MODE === "android_vpn_demo";
}

/** Mode réseau effectif : la source de vérité du blocage des annonces. */
export function networkMode(): "mikrotik" | "android_vpn_demo" | "mock" {
  return getConfig().EXPO_PUBLIC_NETWORK_MODE;
}
