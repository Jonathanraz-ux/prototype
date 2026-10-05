// ============================================================
// Répertoire central des fonctionnalités de la licence.
//
// Chaque fonctionnalité avancée est pilotée par la licence côté
// serveur (colonne features de la table licenses). L'application N'E
// décide pas seule : elle lit la liste des features autorisées
// renvoyée par la vérification de licence, puis utilise le composant
// FeatureGate pour afficher « Fonction disponible dans une version
// supérieure. »
// ============================================================

export type LicenseFeatures =
  | "advertiser_payments"
  | "automatic_billing"
  | "premium_subscription"
  | "advanced_multisite"
  | "programmatic_campaigns"
  | "advanced_exports"
  | "ad_marketplace";

export const FEATURE_CATALOG: Record<
  LicenseFeatures,
  { title: string; description: string }
> = {
  advertiser_payments: {
    title: "Paiement des annonceurs",
    description: "Gérez les paiements des annonceurs directement sur la plateforme.",
  },
  automatic_billing: {
    title: "Facturation automatique",
    description: "Facturation récurrente et automatique des campagnes.",
  },
  premium_subscription: {
    title: "Abonnement premium",
    description: "Offre premium sans publicité pour les utilisateurs finaux.",
  },
  advanced_multisite: {
    title: "Multisite avancé",
    description: "Gérez plusieurs sites et organisations depuis un seul espace.",
  },
  programmatic_campaigns: {
    title: "Campagnes programmatiques",
    description: "Diffusion automatisée de campagnes par enchères.",
  },
  advanced_exports: {
    title: "Exports avancés",
    description: "Rapports et exports détaillés de vos données.",
  },
  ad_marketplace: {
    title: "Place de marché publicitaire",
    description: "Accédez à une place de marché d'annonceurs et de campagnes.",
  },
};

export const LOCKED_FEATURE_MESSAGE = "Fonction disponible dans une version supérieure.";
