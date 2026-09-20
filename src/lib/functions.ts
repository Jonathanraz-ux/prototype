import { getConfig } from "./config";
import { logger } from "./logger";
import { getAccessToken, AuthService } from "../services/auth";

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
 * Fetch avec délai BORNÉ puis abandon RÉEL de la requête (AbortController).
 * Le Promise.race qui appelle cette fonction garde le motif typé (timeout) ;
 * l'abandon sert ici à libérer la connexion réseau plutôt que de laisser une
 * requête zombie en vol. Sans AbortController (environnement sans support),
 * on reste sur un fetch simple : le délai est toujours garanti par le race.
 */
async function fetchBounded(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  if (typeof AbortController !== "undefined") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  return fetch(url, init);
}

/** Jeton actuellement disponible (cache + reconnexion si expiré). */
export async function getApiToken(): Promise<string> {
  let token = getAccessToken();
  if (!token) {
    const session = await AuthService.getSession();
    if (!session?.access_token) {
      throw new FunctionError("Aucune session authentifiée", "unauthorized", 401);
    }
    token = session.access_token;
  }
  return token;
}

/**
 * Appelle un RPC Postgres en fetch direct (jamais via le client Supabase,
 * dont le verrou d'authentification peut geler les appels sur l'appareil).
 * Mêmes règles de jeton que callFunction.
 */
export async function callRpc<T>(
  name: string,
  body?: Record<string, unknown>,
  options?: { timeoutMs?: number }
): Promise<FunctionResponse<T>> {
  let token: string;
  try {
    token = await getApiToken();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof FunctionError ? e : new FunctionError("Impossible d'obtenir le jeton", "unauthorized", 401),
    };
  }

  const config = getConfig();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${config.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/${name}`;

  try {
    const response = await Promise.race([
      fetchBounded(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: config.EXPO_PUBLIC_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body ?? {}),
        },
        timeoutMs
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new FunctionError("Délai dépassé", "timeout", 408)), timeoutMs)
      ),
    ]);

    const raw = await response.text();

    if (!response.ok) {
      const payload = (() => {
        try {
          return JSON.parse(raw || "{}");
        } catch {
          return {};
        }
      })() as { error?: { code?: string; message?: string }; message?: string };
      const code = payload.error?.code ?? payload.message ?? "rpc_failed";
      logger.warn(TAG, `RPC ${name} a échoué (HTTP ${response.status})`, code);
      return {
        ok: false,
        error: new FunctionError(
          payload.error?.message ?? `HTTP ${response.status}`,
          code,
          response.status
        ),
      };
    }

    const data: unknown = (() => {
      try {
        return raw ? JSON.parse(raw) : null;
      } catch {
        return raw || null;
      }
    })();

    return { ok: true, data: data as T };
  } catch (e) {
    if (e instanceof FunctionError) {
      return { ok: false, error: e };
    }
    const err = e as Error;
    const message = /network|fetch|connection/i.test(err?.message ?? "")
      ? "Réseau indisponible. Réessayez."
      : err?.message ?? "Erreur inconnue";
    logger.warn(TAG, `Appel RPC ${name} impossible`, message);
    return { ok: false, error: new FunctionError(message, "network_error", 0) };
  }
}

/**
 * Appelle une Supabase Edge Function en injectant le token d'authentification
 * de l'utilisateur courant. Retourne une réponse typée.
 *
 * Le transport utilise un `fetch` DIRECT (jamais supabase.functions.invoke) :
 * l'appel passe ALORS par le verrou auth interne du client Supabase, qui peut
 * rester bloqué indéfiniment et déclencher des timeouts fantômes (408) sur
 * l'appareil. On gère nous-mêmes le jeton (cache + re-connexion si proche de
 * l'expiration), ce qui rend chaque appel déterministe.
 */
export async function callFunction<T>(
  name: string,
  body?: unknown,
  options?: { timeoutMs?: number }
): Promise<FunctionResponse<T>> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let token: string | null = null;
  try {
    token = await getApiToken();
  } catch {
    return {
      ok: false,
      error: new FunctionError(
        "Impossible d'obtenir le jeton",
        "unauthorized",
        401
      ),
    };
  }

  const config = getConfig();
  const url = `${config.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${name}`;

  try {
    const response = await Promise.race([
      fetchBounded(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: config.EXPO_PUBLIC_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body ?? {}),
        },
        timeoutMs
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new FunctionError("Délai dépassé", "timeout", 408)), timeoutMs)
      ),
    ]);

    const raw = await response.text();

    if (!response.ok) {
      const payload = (() => {
        try {
          return JSON.parse(raw || "{}");
        } catch {
          return {};
        }
      })() as { error?: { code?: string; message?: string }; message?: string };
      const code = payload.error?.code ?? payload.message ?? "function_error";
      logger.warn(TAG, `Edge Function ${name} a échoué (HTTP ${response.status})`, code);
      return {
        ok: false,
        error: new FunctionError(
          payload.error?.message ?? `HTTP ${response.status}`,
          code,
          response.status
        ),
      };
    }

    const data: unknown = (() => {
      try {
        return raw ? JSON.parse(raw) : null;
      } catch {
        return raw || null;
      }
    })();

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
