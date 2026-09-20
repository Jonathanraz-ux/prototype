import { Platform } from "react-native";

/**
 * Géométrie de la barre d'onglets personnalisée (src/app/(app)/(tabs)/_layout.tsx).
 * SOURCE DE VÉRITÉ unique pour que les écrans d'onglets réservent exactement
 * l'espace réellement occupé par la barre (plus aucune marge magique) :
 * un élément interactif placé en bas de contenu reste TOUJOURS au-dessus
 * de la barre, quel que soit l'appareil (encoches, barres de navigation,
 * échelle de texte, clavier).
 */
export const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 76 : 70;
export const TAB_BAR_BOTTOM_OFFSET = Platform.OS === "ios" ? 22 : 16;
/** Hauteur totale occultée en bas d'écran par la barre d'onglets. */
export const TAB_BAR_CLEARANCE = TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_OFFSET;
/** Respiration supplémentaire entre le dernier élément et la barre. */
export const TAB_BAR_MARGIN = 24;