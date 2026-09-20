# MVP provisoire — Tableau fonctionnalité / portée / preuve / limite

Mise à jour : adaptation MVP en attendant l'arrivée du routeur MikroTik.
Chaque fonctionnalité est décrite avec la **portée réelle du contrôle exercé**,
la **preuve** disponible et la **limite** connue. Aucune promesse de contrôle
global du Wi-Fi ou du routeur n'est faite.

| # | Fonctionnalité | Portée réelle | Preuve | Limite |
|---|----------------|---------------|--------|--------|
| 1 | **Session financée par la publicité** (regarder → session accordée) | Compte Bôjô + serveur (source de vérité) | `sessionControl.test.ts`, `serverAuth.test.ts`, `backend-validate.cjs` (chaîne réelle sur le projet hébergé) | En provisionnel, la « recompense » est du temps, pas un comptage de données réelles |
| 2 | **Régie publicitaire** (campagne → vue → récompense, heartbeat) | Serveur uniquement (Edge Functions + RPC) | Tests Edge Functions + `backend-validate.cjs` | Le contenu vidéo dépend de la connectivité du client |
| 3 | **Contrôle de la navigation Bôjô (in-app)** — WebView gatée session + pub + Wi-Fi | UNIQUEMENT la WebView intégrée de Bôjô | `browsePolicy.test.ts` (12 tests) + code `browse/index.tsx` | Ne contrôle pas les autres applications ni le routeur |
| 4 | **Suspension réelle de la navigation** (démontage WebView, arrêt médias/chargements) | WebView Bôjô | Code + tests unitaires de décision | NON TESTÉ sur matériel (build APK requis) |
| 5 | **Détection Wi-Fi vs données mobiles** (pause en cellulaire) | Interface réseau active du téléphone | `networkTransport.ts` (expo-network `~5.3.0`) | NON TESTÉ device ; ne lie pas les sockets ; un SSID n'est jamais une identité sûre |
| 6 | **Quota de 5 Go affiché au client** | Compteurs désormais honnêtes : masqués tant que le comptage ne vient pas du routeur | Code `ConnectionStatusCard.tsx` / `profile` (`meterTrusted`) | Aucun comptage réel par le téléphone en provisionnel ; mesure = routeur (phase MikroTik) |
| 7 | **Blocage VPN/TUN local** | Autres applications du téléphone (Bôjô est exclue du tunnel) | `vpnBlocker.test.ts`, `vpnBlocker.guard.test.ts` | N'influence ni la WebView Bôjô ni le Wi-Fi global — simulation en mode démo |
| 8 | **Bout de session restant côté natif (TTL)** | Module VPN (timebase `elapsedRealtime`) | Fix `ttlLeftMs` (Kotlin → JS) | NON TESTÉ sur matériel ; à vérifier au build |
| 9 | **Compte démo unique & cohérent** | Supabase Auth + données serveur | Refonte `setup-demo-account.mjs` (API Admin, mdp `.env`) | NON EXÉCUTÉ : nécessite la clé service_role pour rejouer |
| 10 | **Pas de secret en dur dans les scripts** | Dépôt | Grep « sb_publishable / pooler / B0j0-demo » : aucune occurrence (hors commentaires d'exemple) | — |
| 11 | **Build APK autonome** | Programme EAS cloud | Profil `recette` (apk) dans `eas.json` | NON RÉALISÉ : à lancer au jalon |

## Convention « provisoire / définitive »

- **Provisoire** : contrôle de navigation in-app, pub persistante, quota affiché sans compteur, VPN local en complément.
- **Définitive (MikroTik)** : compteurs routeur (mesure réelle), adaptateur MikroTik, contrôle réseau effectif au niveau du point d'accès — sans réécrire l'application (voir `MVP_PROVISOIRE_APPORTS_MIKROTIK.md`).

## Notes transverses

- L'identité d'un réseau repose sur l'interface réseau (Wi-Fi/cellulaire), jamais sur un SSID.
- `providerKind` distingue `live` (mesure routeur réelle) de `simulated`/`unconfigured` ; seul `live` débloque les métriques de quota à l'écran client.
- Thème conservé : violet `#5912ED`, textes blancs, raccourci Google, signature « Internet Bôjô pour tous ».