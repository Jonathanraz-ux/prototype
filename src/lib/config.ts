import { z } from "zod";

const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url("EXPO_PUBLIC_SUPABASE_URL doit être une URL valide"),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "EXPO_PUBLIC_SUPABASE_ANON_KEY est requis"),
  EXPO_PUBLIC_APP_ENV: z.enum(["development", "pilot", "production"]).default("development"),
  EXPO_PUBLIC_LICENSE_API_URL: z.string().url("EXPO_PUBLIC_LICENSE_API_URL doit être une URL valide").optional(),
  EXPO_PUBLIC_PRIVACY_POLICY_URL: z.string().url().optional(),
  EXPO_PUBLIC_TERMS_URL: z.string().url().optional(),
  EXPO_PUBLIC_SUPPORT_PHONE: z.string().optional(),
  EXPO_PUBLIC_SUPPORT_EMAIL: z.string().email().optional(),
  EXPO_PUBLIC_DEFAULT_SITE_ID: z.string().uuid().optional(),
});

type EnvConfig = z.infer<typeof envSchema>;

let _config: EnvConfig | null = null;

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

  _config = result.data;
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
