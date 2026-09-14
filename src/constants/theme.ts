// =============================================
// Bôjô — Design System centralisé
// Fond principal violet (#5912ED) cohérent avec
// le logo. Couleurs unies, sans grain ni texture.
// Rouge / orange / vert réservés aux états.
// =============================================

export const BRAND = {
  violet: "#5912ED",
  violetDark: "#4A0EC8",
  violetDeeper: "#3E0CA8",
  violetLight: "#7D45F6",
  violetSoft: "#9F7BFF",
  violetSoftest: "#C9B4FF",
};

export const COLORS = {
  // Fond principal violet
  background: BRAND.violet,
  backgroundDark: BRAND.violetDark,

  // Cartes : nuances de violet clairement distinctes du fond
  card: BRAND.violetLight,
  cardAlt: "#6F2DF3",
  cardHover: "#8A58F7",

  // Identité / accents
  primary: BRAND.violet,
  primaryLight: BRAND.violetLight,
  primaryDark: BRAND.violetDark,
  accent: BRAND.violetSoftest,
  accentSoft: BRAND.violetSoftest,

  // États (réservés aux contextes appropriés)
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",

  // Textes (contraste assuré sur fond violet)
  textPrimary: "#FFFFFF",
  textSecondary: "rgba(255, 255, 255, 0.78)",
  textMuted: "rgba(255, 255, 255, 0.5)",

  // Contours & séparateurs
  border: "rgba(255, 255, 255, 0.12)",
  borderLight: "rgba(255, 255, 255, 0.28)",
  divider: "rgba(255, 255, 255, 0.12)",

  // Surfaces translucides (pills, champs, overlays)
  surface: "rgba(255, 255, 255, 0.10)",
  surfaceStrong: "rgba(255, 255, 255, 0.16)",

  overlay: "rgba(0, 0, 0, 0.55)",

  // Boutons principaux : blancs, texte violet
  actionBg: "#FFFFFF",
  actionFg: BRAND.violet,
  actionFgMuted: BRAND.violetLight,

  white: "#FFFFFF",
  black: "#000000",
};

export const GRADIENTS = {
  primary: ["#5912ED", "#7D45F6"],
  accent: ["#5912ED", "#9F7BFF"],
  success: ["#16A34A", "#22C55E"],
  darkCard: ["#4A0EC8", "#3E0CA8"],
  darkElevated: ["#5C1CE0", "#4A0EC8"],
  warm: ["#F59E0B", "#EF4444"],
  cool: ["#5912ED", "#7D45F6"],
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const SHADOWS = {
  sm: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 3, elevation: 2 },
  md: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 5 },
  lg: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 },
  glow: { shadowColor: "#5912ED", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10 },
  card: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 24, elevation: 12 },
};

export const SIZES = {
  iconSm: 16,
  iconMd: 24,
  iconLg: 32,
  iconXl: 48,
  logo: 80,
  avatar: 64,
  avatarSm: 40,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  screen: 24,
};

export const FONTS = {
  bold: "Inter-Bold",
  regular: "Inter-Regular",
};

// Échelle typographique de référence
export const TYPO = {
  display: { fontSize: 27, lineHeight: 34, fontFamily: FONTS.bold },
  title: { fontSize: 22, lineHeight: 28, fontFamily: FONTS.bold },
  heading: { fontSize: 18, lineHeight: 24, fontFamily: FONTS.bold },
  bodyLg: { fontSize: 16, lineHeight: 24, fontFamily: FONTS.regular },
  body: { fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: FONTS.regular },
  label: { fontSize: 11, lineHeight: 14, fontFamily: FONTS.bold, letterSpacing: 0.4, textTransform: "uppercase" as const },
};

export const BREAKPOINTS = {
  sm: 375,
  md: 414,
  lg: 768,
  xl: 1024,
};

export const ANIMATION_DURATION = {
  fast: 150,
  normal: 300,
  slow: 500,
  extraSlow: 800,
};