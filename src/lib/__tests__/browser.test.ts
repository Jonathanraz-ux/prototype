import { normalizeBrowserInput, googleSearchUrl, GOOGLE_HOME_URL } from "../browser";

describe("normalizeBrowserInput", () => {
  it("renvoie home pour une entrée vide", () => {
    expect(normalizeBrowserInput("")).toEqual({ kind: "home" });
    expect(normalizeBrowserInput("   ")).toEqual({ kind: "home" });
  });

  it("conserve une URL http(s) explicite", () => {
    expect(normalizeBrowserInput("https://example.com/page")).toEqual({
      kind: "url",
      url: "https://example.com/page",
      normalized: false
    });
    expect(normalizeBrowserInput("http://exemple.fr")).toEqual({
      kind: "url",
      url: "http://exemple.fr",
      normalized: false
    });
  });

  it("ajoute https:// à un nom de domaine nu", () => {
    expect(normalizeBrowserInput("example.com")).toEqual({
      kind: "url",
      url: "https://example.com",
      normalized: true
    });
    expect(normalizeBrowserInput("sub.example.co.uk")).toEqual({
      kind: "url",
      url: "https://sub.example.co.uk",
      normalized: true
    });
    expect(normalizeBrowserInput("example.com/path?q=1")).toEqual({
      kind: "url",
      url: "https://example.com/path?q=1",
      normalized: true
    });
    expect(normalizeBrowserInput("example.com:8080")).toEqual({
      kind: "url",
      url: "https://example.com:8080",
      normalized: true
    });
  });

  it("utilise http:// pour localhost et IPv4 locales", () => {
    expect(normalizeBrowserInput("localhost:3000")).toEqual({
      kind: "url",
      url: "http://localhost:3000",
      normalized: true
    });
    expect(normalizeBrowserInput("192.168.1.10")).toEqual({
      kind: "url",
      url: "http://192.168.1.10",
      normalized: true
    });
  });

  it("déclare invalide un protocole non pris en charge", () => {
    const res = normalizeBrowserInput("mailto:test@example.com");
    expect(res.kind).toBe("invalid");
    expect(res.kind === "invalid" ? res.reason : "").toContain("non pris en charge");
    expect(normalizeBrowserInput("intent://x").kind).toBe("invalid");
  });

  it("traite un texte libre comme une recherche Google", () => {
    expect(normalizeBrowserInput("bonjour bôjô")).toEqual({
      kind: "search",
      query: "bonjour bôjô"
    });
    expect(normalizeBrowserInput("rubis sur rails")).toEqual({
      kind: "search",
      query: "rubis sur rails"
    });
  });

  it("encode correctement la recherche Google", () => {
    expect(googleSearchUrl("bonjour bôjô")).toBe(
      "https://www.google.com/search?q=bonjour%20b%C3%B4j%C3%B4&ie=utf-8&oe=utf-8"
    );
    expect(googleSearchUrl("rugby+2026")).toContain("rugby%2B2026");
  });

  it("exporte la page d'accueil Google", () => {
    expect(GOOGLE_HOME_URL).toBe("https://www.google.com");
  });
});