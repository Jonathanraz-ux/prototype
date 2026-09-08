// ============================================================
// http.mjs — Appels HTTP vers les Edge Functions (fetch natif).
// L'agent s'authentifie avec son token via Authorization: Bearer.
// ============================================================

export class AgentHttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AgentHttpError";
    this.status = status;
  }
}

export function functionsBaseUrl(supabaseUrl) {
  return `${String(supabaseUrl ?? "").replace(/\/$/, "")}/functions/v1`;
}

/**
 * POST vers une Edge Function, réponse JSON. Retourne le corps ou null.
 * Lève AgentHttpError en cas d'échec HTTP.
 */
export async function callFunction({ baseUrl, token, name, body, timeoutMs = 20000 }) {
  const url = `${baseUrl}/${name}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    const text = await res.text();
    const json = text ? safeJson(text) : null;
    if (!res.ok) {
      const message = json?.error?.message ?? `HTTP ${res.status}`;
      throw new AgentHttpError(message, res.status);
    }
    if (json?.error) {
      throw new AgentHttpError(json.error.message ?? "Erreur Edge Function", 500);
    }
    return json;
  } catch (err) {
    if (err instanceof AgentHttpError) throw err;
    throw new AgentHttpError(`Appel ${name} impossible : ${err?.message ?? "inconnu"}`, 0);
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}