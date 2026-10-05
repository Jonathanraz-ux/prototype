import { describe, it, expect } from "@jest/globals";
import {
  browseAdZoneHeight,
  browseWebZoneHeight,
  BROWSE_AD_SCREEN_FRACTION,
  BROWSE_AD_MIN_HEIGHT,
  BROWSE_AD_MAX_HEIGHT,
  BROWSE_WEB_MIN_HEIGHT,
  BROWSE_AD_COMPACT_HEIGHT
} from "../browseLayout";

// Écrans réels (hauteur totale) et barres système Android usuelles :
// barre de statut en haut, barre de navigation (gestes ou 3 boutons) en bas.
const SCREENS = [
  { name: "petit Android 320x480", window: 480, top: 24, bottom: 0, usable: 456 },
  { name: "Android compact 360x640", window: 640, top: 24, bottom: 48, usable: 568 },
  { name: "Android courant 360x800", window: 800, top: 24, bottom: 48, usable: 728 },
  { name: "Android grand 412x915", window: 915, top: 24, bottom: 24, usable: 867 },
  { name: "tablette 800x1280", window: 1280, top: 24, bottom: 0, usable: 1256 }
];

describe("browseLayout — répartition 2/3 navigateur, 1/3 publicité", () => {
  it("la publicité occupe environ le tiers inférieur sur plusieurs tailles d'écran", () => {
    for (const screen of SCREENS) {
      const ad = browseAdZoneHeight({ usableHeight: screen.usable });
      const web = browseWebZoneHeight({ usableHeight: screen.usable });
      const ratio = ad / screen.usable;
      // ±5 points de marge autour du tiers (bornes de lisibilité sur petit
      // écran, plafond sur grand écran).
      expect(ratio).toBeGreaterThanOrEqual(0.3);
      expect(ratio).toBeLessThanOrEqual(0.36);
      expect(web / screen.usable).toBeGreaterThan(0.6);
    }
  });

  it("les deux zones remplissent exactement la hauteur utile (ni trou ni chevauchement)", () => {
    for (const screen of SCREENS) {
      const ad = browseAdZoneHeight({ usableHeight: screen.usable });
      const web = browseWebZoneHeight({ usableHeight: screen.usable });
      expect(ad + web).toBe(screen.usable);
    }
  });

  it("la part navigateur reste toujours double de la part publicité (ordre 2:1 respecté)", () => {
    for (const screen of SCREENS) {
      const ad = browseAdZoneHeight({ usableHeight: screen.usable });
      const web = browseWebZoneHeight({ usableHeight: screen.usable });
      expect(web).toBeGreaterThan(ad);
    }
  });

  it("la zone publicitaire reste bornée (lisible, jamais écrasante)", () => {
    for (const screen of SCREENS) {
      const ad = browseAdZoneHeight({ usableHeight: screen.usable });
      expect(ad).toBeLessThanOrEqual(BROWSE_AD_MAX_HEIGHT);
      expect(ad).toBeLessThanOrEqual(screen.usable - BROWSE_WEB_MIN_HEIGHT);
    }
    // Écran démesuré : le plafond protège le navigateur (et le geste de
    // fermeture de la pub reste atteignable).
    const huge = browseAdZoneHeight({ usableHeight: 2400 });
    expect(huge).toBe(BROWSE_AD_MAX_HEIGHT);
    // Très petit écran : le plancher de lisibilité peut gagner, mais le
    // navigateur garde toujours une surface exploitable.
    const tiny = browseAdZoneHeight({ usableHeight: 200 });
    expect(tiny).toBe(200 - BROWSE_WEB_MIN_HEIGHT);
  });

  it("fraction explicite : un tiers, jamais une valeur codée en dur", () => {
    expect(BROWSE_AD_SCREEN_FRACTION).toBeCloseTo(1 / 3, 6);
    // Hauteur non multiple de 3 : l'arrondi reste au plus proche.
    expect(browseAdZoneHeight({ usableHeight: 727 })).toBe(242);
  });

  it("hauteur utile nulle ou invalide : aucune zone, pas de Division par zéro", () => {
    expect(browseAdZoneHeight({ usableHeight: 0 })).toBe(0);
    expect(browseWebZoneHeight({ usableHeight: 0 })).toBe(0);
    expect(browseAdZoneHeight({ usableHeight: -50 })).toBe(0);
    expect(browseAdZoneHeight({ usableHeight: NaN })).toBe(0);
  });

  it("clavier ouvert : la publicité se réduit en bande compacte, le navigateur garde la main", () => {
    for (const screen of SCREENS) {
      const ad = browseAdZoneHeight({ usableHeight: screen.usable, keyboardVisible: true });
      const web = browseWebZoneHeight({ usableHeight: screen.usable, keyboardVisible: true });
      expect(ad).toBeLessThan(browseAdZoneHeight({ usableHeight: screen.usable }));
      expect(ad).toBeLessThanOrEqual(BROWSE_AD_COMPACT_HEIGHT);
      expect(web).toBeGreaterThanOrEqual(BROWSE_WEB_MIN_HEIGHT);
      expect(ad + web).toBe(screen.usable);
    }
  });

  it("plancher de lisibilité : la pub ne descend jamais sous la hauteur minimale", () => {
    // 1/3 de 400 = 133 → le plancher (150) gagne, et le navigateur garde 250.
    expect(browseAdZoneHeight({ usableHeight: 400 })).toBe(BROWSE_AD_MIN_HEIGHT);
    expect(browseWebZoneHeight({ usableHeight: 400 })).toBe(250);
  });
});
