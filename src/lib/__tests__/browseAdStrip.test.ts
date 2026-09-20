import {
  browseStripHeight,
  BROWSE_STRIP_MAX_HEIGHT,
  BROWSE_STRIP_MIN_HEIGHT,
} from "../browseAdStrip";

describe("browseStripHeight — bande publicitaire persistante du navigateur", () => {
  it("clappe à la hauteur minimale quand l'idéal est nul ou minuscule", () => {
    const h = browseStripHeight({
      usableWidth: 320,
      screenHeight: 800,
      format: "image",
      imageRatio: null,
    });
    expect(h).toBe(BROWSE_STRIP_MIN_HEIGHT);
  });

  it("respecte les proportions intrinsèques d'une image", () => {
    const h = browseStripHeight({
      usableWidth: 320,
      screenHeight: 800,
      format: "image",
      imageRatio: 0.25,
    });
    expect(h).toBe(80);
  });

  it("utilise le ratio 16:9 par défaut pour une vidéo, borné par le maximum", () => {
    const h = browseStripHeight({
      usableWidth: 320,
      screenHeight: 800,
      format: "video",
      imageRatio: null,
    });
    expect(h).toBe(BROWSE_STRIP_MAX_HEIGHT);
  });

  it("ne dépasse jamais la hauteur maximale", () => {
    const h = browseStripHeight({
      usableWidth: 320,
      screenHeight: 800,
      format: "image",
      imageRatio: 1,
    });
    expect(h).toBeLessThanOrEqual(BROWSE_STRIP_MAX_HEIGHT);
    expect(h).toBeGreaterThanOrEqual(BROWSE_STRIP_MIN_HEIGHT);
  });

  it("plafonne à la fraction d'écran sur petit écran", () => {
    const h = browseStripHeight({
      usableWidth: 320,
      screenHeight: 500,
      format: "image",
      imageRatio: 1,
    });
    expect(h).toBe(Math.max(BROWSE_STRIP_MIN_HEIGHT, Math.round(500 * 0.16)));
  });

  it("ne descend jamais sous le minimum quand la fraction d'écran passe en dessous (clavier / très petit écran)", () => {
    // 16 % de 360 = 57,6 → la borne haute serait < 80 : le minimum lisible gagne.
    const h = browseStripHeight({
      usableWidth: 320,
      screenHeight: 360,
      format: "video",
      imageRatio: null,
    });
    expect(h).toBe(BROWSE_STRIP_MIN_HEIGHT);

    const hImage = browseStripHeight({
      usableWidth: 320,
      screenHeight: 300,
      format: "image",
      imageRatio: 1,
    });
    expect(hImage).toBe(BROWSE_STRIP_MIN_HEIGHT);
  });
});