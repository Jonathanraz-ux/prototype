/**
 * Bôjô — Répartition de la surface de l'écran « Naviguer ».
 *
 * SOURCE DE VÉRITÉ unique de la géométrie de l'écran :
 *   - deux tiers supérieurs : navigateur intégré (en-tête, barre d'adresse,
 *     commandes, WebView) ;
 *   - tiers inférieur : zone publicitaire, occupant TOUTE la largeur et
 *     descendant jusqu'au bas de la surface de l'application, sur laquelle
 *     les boutons de navigation flottants sont superposés.
 *
 * La répartition est calculée à partir de la hauteur RÉELLEMENT disponible
 * (hauteur de la fenêtre moins les barres système), jamais d'une valeur
 * codée en dur : la zone publicitaire est donc toujours proche du tiers
 * inférieur, sur petit comme sur grand écran.
 *
 * Invariants :
 *   - la somme des deux zones vaut exactement la hauteur utile (aucun pixel
 *     perdu, aucun chevauchement) ;
 *   - la publicité ne recouvre JAMAIS la WebView (c'est une zone réservée
 *     dans le flux, pas un overlay) et n'est jamais écrasée ;
 *   - la navigation reserve toujours une surface minimale exploitable.
 */

/** Fraction de la surface utile réservée à la publicité (1/3). */
export const BROWSE_AD_SCREEN_FRACTION = 1 / 3;
/** Hauteur plancher de la zone publicitaire (lisibilité de la création). */
export const BROWSE_AD_MIN_HEIGHT = 150;
/** Hauteur plafond : au-delà, la création surdimensionnée écraserait le navigateur. */
export const BROWSE_AD_MAX_HEIGHT = 420;
/** Surface minimale laissée au navigateur. */
export const BROWSE_WEB_MIN_HEIGHT = 180;
/** Zone publicitaire ramenée à une bande compacte quand le clavier est ouvert. */
export const BROWSE_AD_COMPACT_HEIGHT = 96;

export interface BrowseZoneOptions {
  /** Hauteur RÉELLEMENT disponible (fenêtre moins barres système). */
  usableHeight: number;
  /** Clavier logiciel ouvert : la pub se réduit, la navigation flottante se retire. */
  keyboardVisible?: boolean;
}

/**
 * Hauteur de la zone publicitaire (tiers inférieur), calculée sur la
 * hauteur réellement disponible et toujours bornée pour rester lisible
 * sans affamer le navigateur.
 */
export function browseAdZoneHeight(opts: BrowseZoneOptions): number {
  const usable = Math.floor(Number.isFinite(opts.usableHeight) ? opts.usableHeight : 0);
  if (usable <= 0) return 0;

  if (opts.keyboardVisible) {
    // Le clavier occupe le bas de l'écran : on garde une bande publicitaire
    // lisible, pas davantage — la saisie et la page restent prioritaires.
    return Math.max(0, Math.min(BROWSE_AD_COMPACT_HEIGHT, usable - BROWSE_WEB_MIN_HEIGHT));
  }

  const target = Math.round(usable * BROWSE_AD_SCREEN_FRACTION);
  const bounded = Math.min(Math.max(target, BROWSE_AD_MIN_HEIGHT), BROWSE_AD_MAX_HEIGHT);
  // Le navigateur garde TOUJOURS une surface exploitable.
  return Math.max(0, Math.min(bounded, usable - BROWSE_WEB_MIN_HEIGHT));
}

/** Hauteur de la zone navigateur (deux tiers supérieurs). */
export function browseWebZoneHeight(opts: BrowseZoneOptions): number {
  const usable = Math.floor(Number.isFinite(opts.usableHeight) ? opts.usableHeight : 0);
  if (usable <= 0) return 0;
  return Math.max(0, usable - browseAdZoneHeight(opts));
}
