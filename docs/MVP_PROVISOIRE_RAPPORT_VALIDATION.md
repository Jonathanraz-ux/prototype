# MVP provisoire — Rapport de validation PASS / FAIL / NON TESTÉ / SIMULÉ

À date : code adapté, typecheck OK (`tsc --noEmit`), **188 tests PASS**.
Aucun build Android n'a encore été produit : tout ce qui nécessite un
exécutable natif est marqué **NON TESTÉ**.

| Bloc | Verdict | Preuve / détail |
|------|---------|-----------------|
| Machine à états session (idle → ad_active → wifi_active, pause, quota, erreur) | **PASS** | `connectionMachine.test.ts` (24 tests), `connectionMachine.multiwindow.test.ts` |
| Sessions côté serveur (server = source de vérité, epochGuard/flowGate, heartbeats) | **PASS** | `sessionControl.test.ts`, `serverAuth.test.ts`, `serverAuth.quotaPersist.test.ts` (8) |
| Régie publicitaire (campagne, vue, récompense, heartbeat) | **PASS** (logique) | `mikrotikAuth.test.ts` + `backend-validate.cjs` | 
| Décision de navigation Bôjô (gate session/pub/Wi-Fi) | **PASS** | `browsePolicy.test.ts` (12) |
| Suspension réelle de la WebView (démontage, arrêt médias) | **NON TESTÉ** | Logique en place, nécessite APK pour vérifier sur device |
| Détection Wi-Fi vs cellulaire (expo-network) | **NON TESTÉ** | Module natif à valider sur device au premier build |
| Compteurs quota masqués en provisoire (`meterTrusted=false`) | **PASS** (logique) / **NON TESTÉ** (visuel) | `ConnectionStatusCard` + `profile` ; rendu à vérifier sur device |
| Timebase VPN natif (TTL) | **FAIL → corrigé** | Bug `authExpiresAt (elapsedRealtime) − Date.now()` naufrageait le TTL ; correction `ttlLeftMs` ; validation device à venir |
| VPN/TUN local (blocage autres apps) | **SIMULÉ** | `android_vpn_demo` (providerKind `simulated`) ; `vpnBlocker.test.ts`, `vpnBlocker.guard.test.ts`, `AndroidVpnDemoAdapter.*` PASS |
| Compte démo (mdp cohérent `.env`, confirmation email) | **NON EXÉCUTÉ** | Refonte écrite (API Admin, mdp depuis `.env`) ; à rejouer avec clé service_role + `.env` |
| Chaîne MikroTik mockée (agent → MockRouter) | **SIMULÉ / PASS** | `e2e-mikrotik-chain.mjs` (à rejouer), agent `MockRouter` |
| Absence de secrets en dur dans `scripts/` | **PASS** | Dépôt purgé (anon/publishable, pooler URL, mdp démo) |
| Typecheck TypeScript (`strict`) | **PASS** | `tsc --noEmit` sans erreur |
| Tests unitaires globaux | **PASS** | 198 tests / 28 suites (dont 5 de régression correctifs §7 et 5 de la bande publicitaire §9 du [Rapport QA final](MVP_PROVISOIRE_RAPPORT_QA_FINAL.md)) |
| Build APK recette (EAS cloud) | **PASS** + incident Device | Build `a2f0d955-9585-4aa7-b7b1-22e587adaad3` — APK `com.wifizone.app` **v5** (1.1.1). **Incident corrigé** : v4 installée crashait au démarrage (variables `EXPO_PUBLIC_*` absentes du build cloud → `getConfig()` lève une erreur fatale Splash). Fix : variables déclarées dans `eas.json` (profils `preview`/`recette`) + versionCode 4→5. v5 installée + lancée sans erreur JS (logcat propre, `MainActivity` active). **Verdict device : [Rapport QA final](MVP_PROVISOIRE_RAPPORT_QA_FINAL.md)** — parcours pub→accès PASS ; 2 anomalies bloquantes à corriger avant livraison (reprise de session après pause, mdp démo affiché). |

## Critères de sortie du MVP provisoire (avant livraison client)

1. ~~Build `recette` EAS réussi + APK installable~~ → **FAIT** (APK v5 généré, distribué en `internal`/canal `recette`). **Correctifs source appliqués sans nouvel APK** → prochain build à produire pour revalidation device (cf. §7-8 du rapport QA final).
2. Sur device : session pub → navigation autorisée ; pause/arrêt → WebView suspendue ;
   donnees mobiles → message de suspension. (à confirmer au hands-on)
3. Compteurs quota affichés uniquement en mode `live`.
4. Compte démo reproductible via `setup-demo-account.mjs` (service_role).

> **Addendum post-v5 (correctifs sans APK)** : les anomalies bloquantes du rapport QA final (BUG 1 layout + reprise, BUG 2 mdp démo, A1 session factice) **et** la **publicité persistante du navigateur** (bande réservée en bas, au-dessus des onglets, WebView flexible) ont été corrigées **au niveau source** — aucune modification native, `tsc --noEmit` propre, 198 tests PASS. Détails, causes racines et vérifications à rejouer (« NON TESTÉES » device indisponible) : §7-9 du [Rapport QA final](MVP_PROVISOIRE_RAPPORT_QA_FINAL.md).

> **Note build (à retenir pour la phase MikroTik)** : EAS Build n'embarque pas le `.env` local — toutes les variables `EXPO_PUBLIC_*` **doivent** être réinjectées dans `eas.json` (clé `env` par profil) ou créées dans l'environnement EAS (`eas env:create`), sinon l'APK compile avec des chaînes vides et `config.ts` provoque un crash au lancement.

## Éléments volontairement REPORTÉS (phase MikroTik)

- Comptage réel de la données (compteurs routeur → `allocations.consumed_bytes`).
- Remplacement du mode démo VPN par l'adaptateur MikroTik réel.
- Affichage des métriques de quota (rétabli par `meterTrusted=true` via `providerKind=live`).
- Éventuel mode RADIUS.