/**
 * Bôjô — Géométrie de la bande publicitaire persistante du navigateur.
 *
 * La bande (BrowseAdBanner variant "strip") réserve une hauteur RÉELLE dans
 * la mise en page de l'écran de navigation, au-dessus des onglets. Aucune
 * position absolue, aucune injection. La hauteur est adaptée au format de la
 * campagne et à l'espace disponible — pas une hauteur unique pour tous les
 * formats :
 *  - image : proportions intrinsèques mesurées (imageRatio = h/w) ;
 *  - vidéo : ratio paysage 16:9 par défaut (aucune déformation) ;
 *  - bornes : toujours lisible (min), jamais écrasante pour la navigation
 *    (max), et plafonnée à une fraction de la hauteur d'écran.
 */
export const BROWSE_STRIP_MIN_HEIGHT = 80;
export const BROWSE_STRIP_MAX_HEIGHT = 128;
export const BROWSE_STRIP_SCREEN_FRACTION = 0.16;
export const BROWSE_STRIP_DEFAULT_RATIO = 9 / 16;

export interface BrowseStripHeightOptions {
  usableWidth: number;
  screenHeight: number;
  format: "image" | "video";
  imageRatio: number | null;
}

export function browseStripHeight(opts: BrowseStripHeightOptions): number {
  const { usableWidth, screenHeight, format, imageRatio } = opts;

  const cap = Math.max(
    BROWSE_STRIP_MIN_HEIGHT,
    Math.round(screenHeight * BROWSE_STRIP_SCREEN_FRACTION)
  );
  const maxAllowed = Math.min(BROWSE_STRIP_MAX_HEIGHT, cap);

  let ideal = 0;
  if (format === "image" && imageRatio && imageRatio > 0) {
    ideal = Math.round(usableWidth * imageRatio);
  } else if (format === "video") {
    ideal = Math.round(usableWidth * BROWSE_STRIP_DEFAULT_RATIO);
  }

  return Math.max(
    BROWSE_STRIP_MIN_HEIGHT,
    Math.min(Math.max(ideal, 0) || BROWSE_STRIP_MIN_HEIGHT, maxAllowed)
  );
}