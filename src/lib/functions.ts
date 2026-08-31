import { getSupabase } from "./supabase";
import { getConfig } from "./config";
import { logger } from "./logger";

const TAG = "functions";

export class FunctionError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "unknown", status = 500) {
    super(message);
    this.name = "FunctionError";
    this.code = code;
    this.status = status;
  }
}

type FunctionResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: FunctionError };

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Appelle une Supabase Edge Function en injectant le token d'authentification
 * de l'utilisateur courant. Retourne une réponse typée.
 */
export async function callFunction<T>(
  name: string,
  body?: unknown,
  options?: { timeoutMs?: number }
): Promise<FunctionResponse<T>> {
  const supabase = getSupabase();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let token: string | undefined;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    token = session?.access_token;
  } catch {
    token = undefined;
  }

  try {
    const response = await Promise.race([
      supabase.functions.invoke(name, {
        body: body ?? {},
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new FunctionError("Délai dépassé", "timeout", 408)), timeoutMs)
      ),
    ]);

    const { data, error } = response;

    if (error) {
      const code =
        (error.context as { code?: string } | undefined)?.code ??
        (error as { code?: string } | undefined)?.code ??
        "function_error";
      logger.warn(TAG, `Edge Function ${name} a échoué`, code);
      return { ok: false, error: new FunctionError(error.message, code) };
    }

    // Certaines fonctions renvoient { error: ... } dans le corps (HTTP 200).
    const payload = data as { error?: { code?: string; message?: string } } | null;
    if (payload && payload.error) {
      return {
        ok: false,
        error: new FunctionError(
          payload.error.message ?? "Erreur inconnue",
          payload.error.code ?? "function_error"
        ),
      };
    }

    return { ok: true, data: data as T };
  } catch (e) {
    if (e instanceof FunctionError) {
      return { ok: false, error: e };
    }
    const err = e as Error;
    const message = /network|fetch|connection/i.test(err?.message ?? "")
      ? "Réseau indisponible. Réessayez."
      : err?.message ?? "Erreur inconnue";
    logger.warn(TAG, `Appel ${name} impossible`, message);
    return { ok: false, error: new FunctionError(message, "network_error", 0) };
  }
}

/**
 * Explore la configuration de licence pour déterminer l'URL de la
 * fonction check-license (par défaut via l'URL Supabase).
 */
export function getLicenseApiUrl(): string {
  const config = getConfig();
  if (config.EXPO_PUBLIC_LICENSE_API_URL) return config.EXPO_PUBLIC_LICENSE_API_URL;
  const url = config.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  return `${url}/functions/v1`;
}
