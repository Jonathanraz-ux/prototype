/**
 * Bôjô — Géométrie de la navigation flottante (Accueil / Naviguer).
 *
 * SOURCE DE VÉRITÉ unique : les deux boutons flottants sont des surfaces
 * compactes superposées en bas d'écran (au-dessus de la zone publicitaire
 * sur « Naviguer », au-dessus du contenu sur « Accueil »). Tout écran
 * défilant réserve exactement la hauteur réellement occupée par ces
 * boutons — plus aucune marge magique — afin qu'aucun contenu (ni le
 * bouton « Se déconnecter ») ne soit jamais masqué, quel que soit
 * l'appareil (encoche, barre de navigation système, clavier).
 */

/** Hauteur d'un bouton flottant (surface tactile compacte). */
export const FLOATING_NAV_BUTTON_HEIGHT = 42;
/** Largeur minimale d'un bouton : assez pour l'icône ET son libellé. */
export const FLOATING_NAV_BUTTON_MIN_WIDTH = 112;
/** Écart horizontal entre les deux boutons. */
export const FLOATING_NAV_GAP = 10;
/** Respiration entre les boutons et le bas de la surface de l'application. */
export const FLOATING_NAV_MARGIN = 10;
/** Hauteur du voile en dégradé posé sous les boutons (contraste garanti). */
export const FLOATING_NAV_SCRIM_TOP = 20;

/** Hauteur totale occultée en bas d'écran par les boutons flottants. */
export const FLOATING_NAV_CLEARANCE =
  FLOATING_NAV_BUTTON_HEIGHT + FLOATING_NAV_MARGIN * 2;

/**
 * Hauteur totale du conteneur flottant (voile + boutons + marge basse),
 * mesurée depuis le bas de la fenêtre.
 */
export function floatingNavWrapHeight(bottomInset: number): number {
  return FLOATING_NAV_SCRIM_TOP + FLOATING_NAV_BUTTON_HEIGHT + FLOATING_NAV_MARGIN + Math.max(0, bottomInset);
}

/**
 * Espace à réserver en bas d'un contenu DÉFILANT pour que les boutons
 * flottants ne recouvrent jamais le dernier élément (bouton de
 * déconnexion, liens, listes…).
 */
export function floatingNavClearance(bottomInset: number): number {
  return Math.max(0, bottomInset) + FLOATING_NAV_MARGIN + FLOATING_NAV_BUTTON_HEIGHT;
}
