import type { LicenseFeatures } from "./licenseFeatures";

export interface FeatureConfig {
  /** Identifiant stable de la fonctionnalité (référencé dans les features de la licence). */
  key: LicenseFeatures;

  /** Version de licence minimale requise (ex: "enterprise"). */
  minPlan?: string;

  /** Message utilisateur affiché quand la fonction est verrouillée. */
  title: string;
  description: string;
}
