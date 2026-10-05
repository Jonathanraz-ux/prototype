# Module Session History —Historique de session

Écran d'historique de sessions conservé comme **module vendable** : il n'est
plus branché dans l'application (l'onglet Historique a été retiré au profit de
l'onglet Profil), mais le code est complet et ses helpers sont testés.

## Contenu

| Fichier | Rôle |
| --- | --- |
| `HistoryScreen.tsx` | l'écran : liste des sessions, filtres, rafraîchissement, états vides. **Ce n'est pas une route** — le dossier est hors de `src/app/`, donc Expo Router n'enregistre rien. |
| `historyPresentation.ts` | logique d'affichage pure : icônes et couleurs des motifs de coupure, libellés et couleurs de statut, filtres. |
| `index.ts` | point d'entrée public (`HistoryScreen`, `filterHistory`, …). |

## Dépendances à l'application hôte

Le module est fonctionnel mais **pas autonome** : il lit ses données chez
l'application qui l'accueille.

| Import | Rôle |
| --- | --- |
| `../../src/repositories/sessionRepository` | `fetchHistory()` — la lecture des sessions |
| `../../src/services/connectionMachine` | `REASON_LABELS` — libellés des motifs de coupure |
| `../../src/lib/formatDate` | dates relatives en français |
| `../ui-kit/format` | `formatDuration`, `formatBytes` |
| `../../src/components/GlassCard`, `AppHeader` | chrome d'écran |
| `../../src/lib/floatingNav` | hauteur à dégager pour la navigation flottante |
| `../../src/constants/theme`, `../../src/types` | couleurs et types |

Pour extraire le module vers un autre projet : copier le dossier, puis
remplacer ces imports (voir `marketplace/README.md`).

## Réactiver l'écran dans WiFi Zone

1. Copier `HistoryScreen.tsx` vers `src/app/(app)/(tabs)/history/index.tsx`
   et adapter les imports (ils gagnent un niveau : `../../../` au lieu de
   `../../src/`).
2. Déclarer la route dans `src/app/(app)/(tabs)/_layout.tsx` :

   ```tsx
   <Tabs.Screen name="history/index" options={{ title: "Historique" }} />
   ```

   L'onglet doit être rendu par `FloatingNav`
   (`src/components/FloatingNav.tsx`) : la barre d'onglets classique n'est
   plus affichée.
3. `fetchHistory()` fonctionne tel quel — aucune donnée n'a été supprimée.
