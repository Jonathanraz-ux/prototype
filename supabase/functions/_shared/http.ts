// ============================================================
// _shared/http.ts — Utilitaires HTTP (CORS + réponses JSON)
// ============================================================

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export function ok(data: unknown): Response {
  return json(data, 200);
}

export function fail(message: string, status = 400, code = "bad_request"): Response {
  return json({ error: { code, message } }, status);
}

export function methodNotAllowed(): Response {
  return json({ error: { code: "method_not_allowed", message: "Méthode non autorisée" } }, 405);
}

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  return null;
}
