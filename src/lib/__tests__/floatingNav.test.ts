import { describe, it, expect } from "@jest/globals";
import {
  FLOATING_NAV_BUTTON_HEIGHT,
  FLOATING_NAV_BUTTON_MIN_WIDTH,
  FLOATING_NAV_CLEARANCE,
  FLOATING_NAV_MARGIN,
  floatingNavClearance,
  floatingNavWrapHeight
} from "../floatingNav";

describe("floatingNav — géométrie de la navigation flottante", () => {
  it("les boutons sont compacts et libellés (surface tactile confortable)", () => {
    expect(FLOATING_NAV_BUTTON_HEIGHT).toBeGreaterThanOrEqual(40);
    expect(FLOATING_NAV_BUTTON_HEIGHT).toBeLessThanOrEqual(48);
    // Assez large pour « Accueil » et « Naviguer » sur une seule ligne.
    expect(FLOATING_NAV_BUTTON_MIN_WIDTH).toBeGreaterThanOrEqual(96);
  });

  it("la zone occultée correspond exactement aux boutons + marge basse", () => {
    expect(FLOATING_NAV_CLEARANCE).toBe(FLOATING_NAV_BUTTON_HEIGHT + FLOATING_NAV_MARGIN * 2);
  });

  it("un contenu défilant réserve l'inset système bas + les boutons", () => {
    expect(floatingNavClearance(0)).toBe(FLOATING_NAV_MARGIN + FLOATING_NAV_BUTTON_HEIGHT);
    expect(floatingNavClearance(48)).toBe(48 + FLOATING_NAV_MARGIN + FLOATING_NAV_BUTTON_HEIGHT);
    // Un inset négatif (valeur absente) ne rétrécit jamais la marge.
    expect(floatingNavClearance(-10)).toBe(floatingNavClearance(0));
  });

  it("le conteneur flottant englobe le voile de contraste au-dessus des boutons", () => {
    const withoutScrim = FLOATING_NAV_BUTTON_HEIGHT + FLOATING_NAV_MARGIN;
    expect(floatingNavWrapHeight(0)).toBeGreaterThan(withoutScrim);
    expect(floatingNavWrapHeight(48)).toBe(floatingNavWrapHeight(0) + 48);
  });
});
