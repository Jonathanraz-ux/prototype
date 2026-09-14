export type BrowserTarget =
  | { kind: "home" }
  | { kind: "url"; url: string; normalized: boolean }
  | { kind: "search"; query: string }
  | { kind: "invalid"; reason: string };

export const GOOGLE_HOME_URL = "https://www.google.com";

const EXPLICIT_HTTP_RE = /^https?:\/\//i;
// Schémas avec autorité (ftp://, intent://, geo://…) : non pris en charge.
const AUTHORITY_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i;
// Schémas sans "//" courants (mailto:, tel:, sms:…) : jamais ouverts dans la WebView.
const KNOWN_SCHEMES = new Set([
  "mailto",
  "tel",
  "sms",
  "whatsapp",
  "intent",
  "geo",
  "market",
  "file",
  "ftp",
  "data",
  "javascript",
  "vbscript",
  "skype",
  "telegram",
  "viber",
  "facetime",
  "youtube",
  "twitter",
  "fb",
]);
const COLON_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/;

// Nom de domaine de type "example.com", "sub.example.co.uk", avec port et
// chemin optionnels. Laisse le TLD inclure tout caractère à l'exception des
// espaces pour rester tolérant (gTLD/régional).
const DOMAIN_RE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/;

const IPV4_RE = /^(\d{1,3})(?:\.\d{1,3}){3}(?::\d+)?(?:\/[^\s]*)?$/;
const LOCAL_RE = /^localhost(?::\d+)?(?:\/[^\s]*)?$/i;

function looksLikeIpv4(v: string): boolean {
  return IPV4_RE.test(v) && v.split(".").slice(0, 4).every((part) => Number(part) <= 255);
}

export function normalizeBrowserInput(raw: string): BrowserTarget {
  const v = raw.trim();

  if (!v) return { kind: "home" };

  if (EXPLICIT_HTTP_RE.test(v)) {
    return { kind: "url", url: v, normalized: false };
  }

  // Protocole "commun" explicite sans "//" (mailto:, tel:, …) → invalide.
  const colon = COLON_RE.exec(v);
  if (colon) {
    const scheme = colon[1];
    const rest = colon[2];
    const schemeName = v.slice(0, v.indexOf(":")).toLowerCase();
    const restIsPort = /^\d+(\/[^\s]*)?$/.test(rest || "");
    const startsWithAuthority = /^\/\//.test(rest || "");

    if (startsWithAuthority || KNOWN_SCHEMES.has(schemeName) || (!restIsPort && !scheme.includes("."))) {
      return { kind: "invalid", reason: "Protocole non pris en charge par le navigateur" };
    }
  }

  if (DOMAIN_RE.test(v)) {
    return { kind: "url", url: `https://${v}`, normalized: true };
  }

  if (LOCAL_RE.test(v) || (IPV4_RE.test(v) && looksLikeIpv4(v))) {
    return { kind: "url", url: `http://${v}`, normalized: true };
  }

  return { kind: "search", query: v };
}

export function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}&ie=utf-8&oe=utf-8`;
}