# Marketplace — modules WiFi Zone séparables

Ce dossier regroupe du code **construit, testé et fonctionnel** qui n'est
pas utilisé par l'application WiFi Zone en production, mais qui constitue
un actif commercialisable tel quel.

Rien ici n'est un plan : chaque module tourne, a des tests qui passent, et
n'est pas appelé par l'application (vérifié import par import).

## Modules

| Module | Contenu | Pourquoi c'est vendable |
| --- | --- | --- |
| `ui-kit/` | `QuickAction`, `QuotaBar`, `WLogo`, `ProgressCircle`, `StatusCard`, formatters réseau, `useDebounce`, `useIsSmallScreen` | briques d'interface réutilisables dans n'importe quel projet Expo/React Native |
| `license-gating/` | `FeatureGate`, catalogue de fonctionnalités, message de verrouillage | système de verrouillage par licence serveur, sans booléen codé en dur dans les écrans |
| `session-history/` | écran d'historique de sessions + filtres + libellés de motifs de déconnexion | module « historique de session » prêt à brancher sur n'importe quelle API |

Chaque module expose un `index.ts` (point d'entrée public) et ses tests
sont conservés : `ui-kit/__tests__/`.

## Pourquoi ces fichiers ne sont pas dans `src/`

- `ui-kit/` : l'application utilise déjà ses propres composants
  (`AccountSection`, `ConnectionStatusCard`, `BrowseAdBanner`…). Ces
  variantes-là sont restées orphelines après la refonte de l'interface.
- `license-gating/` : l'application lit la licence pour l'affichage de la
  page Licence, mais plus aucun écran n'utilise `FeatureGate`.
  Le module reste utile pour tout produit à paliers.
- `session-history/` : la route `/history` a été retirée au profit de
  l'onglet Profil ; l'écran est conservé ici pour être revendu ou ressorti.

## Règle de compilation

`marketplace/` reste couvert par `tsconfig.json` et `jest.config.js` :
un module vendu mais non testé ne vaut rien. Le code n'est donc jamais
« copié dans un coin » puis oublié.

Pour extraire un module de ce dépôt vers un autre projet :

1. copier le dossier du module ;
2. remplacer les imports `../../src/...` par les équivalents du projet cible ;
3. adapter les couleurs (`src/constants/theme`) et le contrat de licence.

## Licence

Ces modules appartiennent à WiFi Zone. Toute revente suppose un contrat
distinct de la licence de l'application.
