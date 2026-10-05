/**
 * License gating — point d'entrée public du module.
 *
 * Le catalogue FEATURE_CATALOG décrit les fonctions commercialisables ;
 * l'application ne code jamais un booléen « cette feature est gratuite »
 * en dur : tout passe par la licence renvoyée par le serveur.
 */
export { default as FeatureGate } from "./FeatureGate";
export { FEATURE_CATALOG, LOCKED_FEATURE_MESSAGE } from "./licenseFeatures";
export type { LicenseFeatures } from "./licenseFeatures";
