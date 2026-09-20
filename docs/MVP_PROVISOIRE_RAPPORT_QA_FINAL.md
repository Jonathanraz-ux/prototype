# Bôjô MVP — Rapport QA final (session device + sessions IA)

- **Objet** : validation de l'APK **recette v5** (`com.wifizone.app`, versionName `1.1.1`, versionCode 5, build EAS `a2f0d955-9585-4aa7-b7b1-22e587adaad3`).
- **Contexte** : aucun nouvel APK n'a été créé pour ce rapport (consigne utilisateur). Tests effectués sur l'APK v5 installée sur device.
- **Device** : ZTE Blade A35 (Android 13, écran 720×1600). Méthode : `adb` + `uiautomator`, traces natives `VpnBlocker` (logcat), captures d'écran comparatives, probing back-end Node/Supabase.
- **Comptes** : `demo@wifizone.app` / `B0j0-demo-2026!` (démo), session MikroTik simulée (`android_vpn_demo`).

---

## 1. Verdict d'ensemble

> **APTE AVEC RÉSERVES.** Le parcours de valorisation « pub → accès internet » fonctionne de bout en bout (B4→B6), le blocage de navigation est conforme à la machine à états (C7/C9), la persistance d'état est correcte (E13/E14), et le build v5 est stable (pas de crash JS). **Deux anomalies bloquantes côté UX/robustesse** doivent être corrigées avant toute présentation client : **BUG 1** (reprise de session après pause inopérante) et **BUG 2** (mot de passe démo erroné affiché par l'aide de connexion). L'anomalie **A1** (contournement d'authentification pour les emails `demo@`/`test@`) est un comportement par conception en mode démo, à désactiver en build de production.

---

## 2. Historique des builds testés

| APK | Déclencheur | Erreur constatée | Traitement | Résultat |
|-----|-------------|------------------|------------|----------|
| v4 (`f9400c53…`) | 1er EAS recette | **Crash Splash** : les variables `EXPO_PUBLIC_*` sont absentes du build cloud (EAS n'embarque pas le `.env` local) → `getConfig()` (validation Zod) lève une erreur fatale au lancement. | Variables réinjectées dans `eas.json` (profils `preview`/`recette`) + `versionCode` 4→5. | Build et ext compatibles → v5 |
| **v5** (`a2f0d955-9585-4aa7-b7b1-22e587adaad3`) | Correctif env | Aucun | — | **PASS** : Splash OK, dashboard OK, logcat sans erreur JS, `MainActivity` active. |

> **À retenir (phase MikroTik)** : toute variable `EXPO_PUBLIC_*` devra être déclarée dans `eas.json` (`env`) ou `eas env:create`, jamais via un `.env` local seul.

---

## 3. Résultats par bloc

| Bloc | Verdict | Preuve |
|------|---------|--------|
| A1 — Connexion démo | **PASS (UI)** / **ANOMALIE** | La connexion « clic de remplissage + validation » aboutit au dashboard, **mais** : (a) l'aide affiche `Password123!` alors que le vrai mot de passe est `B0j0-demo-2026!` (**BUG 2**) ; (b) le flux autorise tout mot de passe pour un email `demo@`/`test@` via un repli local (aucune vérification Supabase) → session **factice** (pas de JWT) → l'étape pub échoue ensuite (**A1-anomalie**, cf. §4). Avec le vrai mot de passe tapé manuellement : login réel, dashboard correct. |
| A2/A3 — Session/restriction après connexion, à l'ouverture | **PASS** | Dashboard « Agent & routeur opérationnels », bloc Présentation conforme (mode provisoire : compteurs masqués). |
| B4 — Déclenchement pub + canal VPN | **PASS** | « Regarder la pub et se connecter » → boîte système Android « Demande de connexion… » (VPNDialogs) acceptée → `VpnBlocker` démarre → état `ad_active` → lecture publicité « [DÉMO] Publicité de test WiFi Zone » (durée 52,2 s, traces `TRACEJS onLoad/buffering`). |
| B5 — Récompense et accès réseau | **PASS** | Après ~70 s : état **`wifi_active`**, UI « Accès autorisé » + « Lecture en cours — … 51 s restantes », pub en boucle, navigation active. |
| B6 — Continuité pub pendant navigation | **PASS** | Onglet Naviguer : page rendue + bannière pub persistante (`BrowseAdBanner`), rendu vivant (captures consécutives non identiques, `uiautomator` jamais idle pendant le rendu vidéo). |
| C7 — Pause depuis le tableau de bord | **PASS** | Tap sur la création pub → `VpnBlocker: blockNow` + `state=BLOCKED` ; dashboard « **En pause** / Reprendre la session » ; onglet Naviguer : **« Session en pause — Reprenez la session depuis l'Accueil pour continuer à naviguer »** + « Aller à l'Accueil ». WebView démontée. |
| C8/C9 — Arrêt WebView, URL inutilisable en suspension | **PASS** | En suspension l'URL (`https://www.google.com/`) est un affichage statique du header (aucun champ éditable, aucun chargement possible) ; même comportement hors session (vérif Gemini). |
| C7bis — Reprise après pause | **FAIL** | Cf. **BUG 1** ci-dessous. |
| D10-D12 — Perte/récupération Wi-Fi | **PASS** (sessions IA + device partiel) | Message de suspension « Aucune connexion » conforme, récupération après retour du Wi-Fi (sessions Gemini). |
| E13 — Retour / persistance | **PASS** | L'état `paused` est **conservé** à travers `force-stop` + relance (trace `state=BLOCKED gen=0` après redémarrage) → persistance correcte. |
| E14 — Kill/relance | **PASS** | Relance propre, aucune erreur JS, écran conforme à l'état persisté. |
| Déconnexion | **PASS** | Profil → « Se déconnecter » → écran d'accueil « Commencer / Créer un compte gratuitement », machine réinitialisée (idle). |
| Build/installation | **PASS** | v5 installée en upgrade sans conflit de signature, lancement sans erreur. |
| Back-end | **PASS** | `get-available-campaign` (200, campagne `db4eaf5d-…`), `start-ad-view` (200, `viewId`), RPC `request_demo_wifi_session` (200, `outcome=created`, `authorization_state=granted`, `heartbeat_expires_at` fourni). |

---

## 4. Anomalies / observations

### BUG 1 — Reprise de session après pause inopérante (bloquant)

- **Constat** : après `pauseSession()` (état `paused`), aucune voie ne restaure `wifi_active` :
  - bouton « Reprendre la session » : son cadre (`[40,1433][680,1477]`) **chevauche la barre d'onglets** (Z au-dessus) → le tap atteint l'onglet, pas le bouton (anomalie layout à corriger : bouton sous le voile d'onglets) ;
  - tap sur la création pub (équivalent `connect()` sur état `paused` → `resumeFromPaused()`) : l'app passe en « **Autorisation en cours** » avec statut « **Agent non configuré** », aucune redemande de consentement VPN, **aucune trace** `resume-from-paused server-check` → le flux d'établissement « part » mais n'aboutit pas ;
  - retour avant-plan : le déclencheur `AppState → resumeFromPaused` ne produit** aucune trace non plus.
- **Écart serveur écarté** : probe direct de la RPC `request_demo_wifi_session` (mêmes identifiants/mêmes paramètres) → **réussite** (`outcome=created`, autorisation `granted`, échéance serveur fournie). Le problème est **côté client v5** (ex. `flowGate` retenu / consentement VPN non re-signalé après `suspendInto` + redémarrage, ou l'état « en cours » qui ne se conclut pas).
- **Contournement constaté** : se déconnecter puis se reconnecter avec le vrai mot de passe → `wifi_active` rétabli.
- **Correctif à prévoir (prochain build autorisé)** : déboguer le chemin `pause → resume` (libération d'un éventuel `flowGate` retenu, restauration du consentement VPN, position du bouton « Reprendre la session » au-dessus de la barre d'onglets) + test on-device de l'aller-retour pause/reprise.

### BUG 2 — Mot de passe démo erroné affiché par l'aide de connexion (bloquant pour le hands-on)

- **Constat** : `src/app/(public)/login/index.tsx` (bouton « Remplir avec le compte… ») affiche/renseigne `Password123!`, alors que le compte réel est `B0j0-demo-2026!` (vérifié par `signInWithPassword`). Tout testeur suivant l'aide échoue (et bascule dans le repli factice, cf. A1).
- **Correctif** : lire `EXPO_PUBLIC_DEMO_PASSWORD` (déjà défini dans `.env`/`eas.json`) au lieu de la constante codée en dur.

### A1 (par conception, à ré-instrumenter) — Repli démo sans authentification serveur

- `src/services/auth.ts` : pour un email `demo@…`/`test@…`, **toute erreur de connexion** produit une session locale factice (pas de JWT Supabase). Conséquence : (1) un faux mot de passe « se connecte » ; (2) la session factice ne peut pas consommer la pub (échec `start-ad-view`, message « Impossible d'initialiser la session de visionnage publicitaire ») — seule la vraie connexion débloque B4→B6.
- **Correctif** : gater ce repli par `__DEV__` / `EXPO_PUBLIC_APP_ENV !== 'production'`, ou le supprimer en prod.

### Observations mineures

- Statut « **Agent non configuré** » affiché sur le dashboard dès que le tunnel n'est pas actif ; lisibilité à améliorer (wording).
- « Se déconnecter » est sous le pli de l'écran Profil (nécessite un scroll) — UX mineure.
- La vidéo pub est soumise à la politique Android d'auto-play bloqué : la lecture ne démarre pas seule (un appui requis). Comportement système attendu, à documenter au client.
- « En pause — Appuyez pour reprendre la lecture » (lecteur vidéo) se confond avec l'état machine « En pause » (session) : sémantique à distinguer dans l'UI.

---

## 5. Méthode et limites

- Lecture d'état via `uiautomator dump` (indisponible pendant le rendu vidéo → remplacé par captures consécutives + traces natives `VpnBlocker.TRACEJS/state=…`).
- Saisie `adb input text` corrompue sur les emails (caractère `@`) → remplissage via le bouton d'aide + remplacement du mot de passe uniquement.
- Les captures d'écran ne sont pas analysées visuellement par l'automatisation (modèle sans vision) : les inférences reposent sur dumps, traces et diff de captures.
- Back-end validé par probing `node` (client Supabase) exécuté hors APK.

---

## 6. Critères de sortie MVP provisoire — statut

1. ✔ Build `recette` réussi + APK installable (v5).
2. ✔ Session pub → navigation autorisée ; pause/arrêt → WebView suspendue. **En attente du correctif BUG 1** pour le sens « reprise ».
3. ✔ Compteurs quota uniquement en mode `live`.
4. ⚠ Compte démo reproductible : la mécanique Admin/`setup-demo-account.mjs` n'est pas rejouée sur ce device (hors scope du présent rapport).

---

## 7. Correctifs appliqués au code source (post-v5, AUCUN nouvel APK)

> ⚠ **Portée** : les correctifs ci-dessous sont appliqués au **code source** et validés par **typecheck + tests unitaires non-compilants**. Aucun build natif n'a été produit (consigne utilisateur) et **aucune validation on-device n'a pu être refaite** (device déconnecté d'adb en fin de session ; de plus, l'APK v5 installé embarque l'ancien code et ne peut pas charger ces modifications sans dev-client). Le passage sur l'appareil reste donc **à rejouer après un prochain build EAS `recette` (§8)**. Les résultats v5 des §1-6 restent **historiques** (on ne leur attribue pas l'effet de ces correctifs).

### 7.1 BUG 1 — Bouton « Reprendre la session » masqué par la barre d'onglets (layout)

- **Cause racine** : la barre d'onglets est **personnalisée** (`_layout.tsx`) en `position:absolute` (`bottom: 16/22`, `height: 70/76`) → bord haut ≈ **y=1428** sur l'écran 720×1600 testé. Le faux padding bas `insets.bottom + 110` servait de « compensation magique » (110 = hauteur barre + offset + marge arbitraire) **non indexée sur la géométrie réelle** : sur le device, le bouton « Reprendre la session » était rendu à `[40,1433][680,1477]`, **sous** la barre → le tap atteignait l'onglet.
- **Correction** : nouvelle source unique `src/lib/tabBarMetrics.ts` (`TAB_BAR_HEIGHT`, `TAB_BAR_BOTTOM_OFFSET`, `TAB_BAR_CLEARANCE = hauteur + offset`, `TAB_BAR_MARGIN`) consommée **à la fois** par `_layout.tsx` (géométrie réelle de la barre) et par les écrans d'onglets `dashboard` / `history` / `profile` (`paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + TAB_BAR_MARGIN`, valeur ≥ l'ancien 110). Boutons d'action du dashboard en `minHeight:56` + `paddingVertical` (robustes à l'échelle de texte / clavier).
- **Preuve** : `tsc --noEmit` sans erreur ; test unitaire de cohérence de géométrie ajouté (`TAB_BAR_CLEARANCE = TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_OFFSET`).

### 7.2 BUG 1 — Reprise de session après pause inopérante (flux)

- **Causes racines identifiées** (écart serveur écarté par probe §1) :
  1. `resumeFromPaused` faisait un `return` **silencieux** si `flowGate.begin()` renvoyait `null` (un flux zombie retenu → « Autorisation en cours » sans fin) et n'émettait **aucune trace d'entrée** → état bloqué indiagnosticable ;
  2. `fetchProfileOrg` (appelé par `requestDemoWifiSession` avant la RPC) était un `fetch` **sans timeout** → une requête suspendue gelait indéfiniment la reprise (cause n°1 probable de l'absence de trace `server-check` sur device) ;
  3. le jeton de session n'existait qu'en mémoire (`sessionTokenRef`) → après redémarrage, un **nouveau jeton** = partition/recréation involontaire de session serveur ;
  4. la reprise **contournait la machine à états** (pas de `transition(ACTIONS.RESUME)`) et n'était **pas observable** (double appui muet, aucun indicateur) ;
  5. aucune garde « **publicité visible avant réactivation** ».
- **Correction** (`src/contexts/ConnectionContext.tsx`, `src/repositories/sessionRepository.ts`, `src/lib/sessionControl.ts`) :
  - trace d'entrée `resume-from-paused enter` ; verrou synchrone `resumingRef` + état `isResuming` exposé au contexte → **spinner** sur « Reprendre la session », double appui ignoré ;
  - récupération de **flux zombie** : si `begin()` est null alors que l'état est `paused`, `forceClose()` + relance propre ;
  - **timeout 15 s** sur `fetchProfileOrg` ; `requestDemoWifiSession` propage désormais le **motif précis** (`timeout` / `network_error` / code PostgREST) au lieu de `session_failed` générique ;
  - **décision pure `resumeFailureAction`** (testée) : panne transitoire → **état « pause » conservé + erreur lisible + réessai** ; quota → état dédié ; fin de session confirmée → `idle` (ré-autorisation) ; `catch` global → jamais d'échec muet ;
  - **transition machine** `ACTIONS.RESUME` (paused→wifi_active) au lieu de `setState` brut ;
  - **garde publicité** : avant toute autorisation native, la campagne doit être présente (rechargée si nécessaire), sinon la session **reste en pause** ;
  - **jeton persisté par utilisateur** (AsyncStorage, key `@wifizone/session_token/<userId>`), restauré au redémarrage, effacé à la **déconnexion** et à la **sortie du mode démo** → reprise après kill sans création involontaire de session.
- **Preuve** : `tsc --noEmit` sans erreur ; 4 tests unitaires ajoutés (`resumeFailureAction` : quota → `quota_exhausted` ; timeout/network/session_failed/undefined → `stay_paused` ; no_organization/PGRST → `to_idle` ; motifs extensibles). **Non vérifié on-device** : les preuves natives (`resume-from-paused enter`, `server-check`, passage `wifi_active` + autorisation native) restent à rejouer (§8).

### 7.3 BUG 2 — Mot de passe démo erroné dans l'aide de connexion

- **Cause** : `Password123!` codé en dur dans `src/app/(public)/login/index.tsx` (réel : communiqué séparément).
- **Correction** : le bouton « Remplir avec le compte de test démo » remplit **uniquement** l'email `demo@wifizone.app` (libellé : « mot de passe communiqué séparément ») ; **aucun mot de passe n'est affiché ni embarqué** dans ce composant ; bouton masqué si `isProduction()` (aucun identifiant démo dans une livraison publique).

### 7.4 A1 — Suppression du contournement d'authentification (session factice)

- **Cause** : `src/services/auth.ts` — pour un email `demo@`/`test@`, **toute erreur de connexion** aboutissait à une session locale **factice** (sans JWT) stockée dans `@wifizone/demo_user_session` ; `getCurrentUser` relisait cette session stockée ; un `signUp` silencieux provisionnait un compte démo à **n'importe quel mot de passe**.
- **Correction** : suppression **complète** de ces replis (fallback fake, `signUp` démo automatique, lecture du storage legacy — seul le `removeItem` de nettoyage subsiste). `signIn` passe désormais **exclusivement** par `signInWithPassword` (Supabase) : un **mauvais mot de passe est refusé** avec une erreur traduite. `getSession` conserve l'auto-connexion **réelle** du compte démo (mode réseau `android_vpn_demo` uniquement, JWT via `EXPO_PUBLIC_DEMO_PASSWORD`) — c'est une authentification back-end, **pas** une session factice.
- **Preuve** : `grep` sur `src/` → plus aucun `DEMO_TEST_USER`, ni écriture/lecture de session démo, ni `Password123` ; `tsc` + 193 tests PASS.

### 7.5 Nouveaux tests de régression (ajoutés, réutilisant la suite existante)

- `src/lib/__tests__/sessionControl.test.ts` : `resumeFailureAction` (4 cas) + cohérence géométrie barre onglets.
- `src/lib/__tests__/browseAdStrip.test.ts` : hauteur de la bande publicitaire persistante (5 cas, §9).
- **Résultat** : **198 tests / 28 suites PASS** (188 initiaux + 5 correctifs §7 + 5 bande §9), `tsc --noEmit` sans erreur.

### 7.6 Aucun changement natif

- Aucune modification de `plugins/vpn-blocker`, `VpnBlockerService.kt`, `build.gradle`, ni aucun overlay natif/OS : ces correctifs sont **exclusivement JS/TS** → un simple build EAS « recette » suffit pour le prochain APK (pas de nouvelle compilation native spécifique).

---

## 8. Vérifications cibles à rejouer sur le prochain APK (non-faites, device indisponible)

| ID | Vérification | État attendu du correctif |
|----|--------------|---------------------------|
| R1 | Pause (`pauseSession`/arrêt webview) puis « Reprendre la session » | Bouton visible **au-dessus** de la barre ; trace `resume-from-paused enter` → `server-check` → `setAuthorized` → `wifi_active` + navigation active |
| R2 | Reprise en panne transitoire (mode avion) | État **« En pause » conservé** + message d'erreur lisible ; réessai après retour du réseau |
| R3 | Double appui sur « Reprendre » | Un seul flux (`resumingRef`/`flowGate`) ; aucun état bloqué |
| R4 | Déconnexion pendant une reprise en cours | `epochGuard` invalide la réponse tardive ; jamais de réactivation |
| R5 | Pause → kill/relance → reprise | Jeton persisté : **même session** serveur (aucune recréation involontaire) ; quota inchangé |
| R6 | Publicité pendant la pause puis reprise | Publicité **visible avant/après** réactivation ; pas de réautorisation sans campagne |
| R7 | Connexion avec mauvais mot de passe (email démo ou autre) | **Refusée** (erreur traduite) ; aucune session factice, aucun stockage créé |
| R8 | Vérification statique | Aucun mot de passe ni identifiant démo embarqué dans l'APK public (`APP_ENV=production`) |

---

## 9. Mission « Publicité persistante dans le navigateur Bôjô » (source, AUCUN nouvel APK)

> ⚠ **Même portée que §7** : modification **JS/TS uniquement**, validée par `tsc --noEmit` + tests unitaires. **Les contrôles on-device A→L ci-dessous sont NON TESTÉS** (device toujours indisponible). Une lecture du code n'est **pas** une validation visuelle.

### 9.1 Fichiers modifiés / ajoutés

| Fichier | Nature |
|---------|--------|
| `src/app/(app)/(tabs)/browse/index.tsx` | WebView flexible + bande persistante en base, padding bas indexé sur la barre d'onglets |
| `src/components/BrowseAdBanner.tsx` | Variante `variant="strip"` : hauteur adaptée au format, média `contain`, zone réservée, garde focus |
| `src/components/AdMedia.tsx` | Prop `mediaResizeMode` (`"cover"` par défaut → comportements existants inchangés ; `"contain"` pour la bande) |
| `src/components/HeroAdCard.tsx` | Garde focus (un seul lecteur actif) |
| `src/hooks/useIsFocusedScreen.ts` | **NOUVEAU** — focus d'écran via `useFocusEffect` (expo-router) |
| `src/lib/browseAdStrip.ts` | **NOUVEAU** — hauteur pure de la bande (format + espace disponible) |
| `src/lib/__tests__/browseAdStrip.test.ts` | **NOUVEAU** — 5 tests |

### 9.2 Disposition retenue (Flexbox, **aucune position absolue**)

- **Conteneur principal** `styles.screen` : `flex: 1`.
- Ordre vertical : en-tête → barre d'adresse → commandes → **WebView flexible** (`webArea: flex 1, flexShrink 1`) → **bande publicitaire persistante** (`adStripWrap: flexShrink 0`) → espace réservé bas.
- **Espace réservé en bas** : `paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + TAB_BAR_MARGIN` (même source de vérité `tabBarMetrics` que §7.1) → la bande est **au-dessus de la barre d'onglets flottante et des barres système**, jamais recouverte.
- La bande est un **frère de la WebView**, hors du contenu web et de tout défilement : elle ne recouvre jamais les liens/boutons de la page.
- `adStripWrap` est **non compressible** (`flexShrink: 0`) : en cas de manque de place (clavier, petit écran) c'est la **WebView** qui se réduit, pas la publicité.
- **Hauteur adaptée au format** (pas de hauteur unique) : `browseStripHeight` = `clamp(usableWidth × ratio, 80, min(128, 16 % de la hauteur d'écran))` ; `ratio` = proportions **intrinsèques mesurées** pour une image (`Image.getSize`, h/w), **16:9** par défaut pour une vidéo.
- Média en `contain` dans la bande → **proportions respectées, aucun recadrage/déformation**. Repli visuel (`LinearGradient`) conservé derrière.

### 9.3 Réutilisation publicitaire

- **Même composant** (`BrowseAdBanner`) et **même source de campagne** (`ConnectionContext.currentAd` via `get-available-campaign`) — aucun second moteur.
- Même lecteur `AdMedia` (une seule instance par écran), mêmes gestionnaires centraux (`handlePlaybackStatusUpdate` / `handleAdMediaError`) ; **aucune RPC, VPN ou comptage modifié**.
- Conditions d'accès **inchangées** : `browseGateDecision` (session + publicité + transport) reste seule à autoriser ; la présence de la bande ne suffit pas.
- **Un seul lecteur actif** : garde focus (`useIsFocusedScreen`) — les onglets restant montés, l'onglet masqué met sa vidéo en pause et cesse d'émettre ses événements (pas de double vidéo/audio, pas de double progression). Le média reste `isMuted`.
- **Pas de remontage WebView** sur événement publicitaire : la bande est sœur de la WebView ; `resumeNonce` ne change qu'aux transitions de suspension. Changement d'URL / défilement / actualisation **ne réinitialise ni la pub ni le quota** (aucune clé de remontage indexée sur la navigation).

### 9.4 Clavier, arrière-plan, plein écran, orientation

- **Clavier** : configuration native existante (`softwareKeyboardLayoutMode` non défini → défaut Android `adjustResize`), **aucun `KeyboardAvoidingView` ajouté** → un seul mécanisme d'évitement, pas de double décalage. La WebView se réduit, la bande reste visible au-dessus du clavier.
- **Vidéo plein écran / fenêtres secondaires / sorties app** : protections déjà en place `allowsFullscreenVideo={false}`, `setSupportMultipleWindows={false}`, `NEW_WINDOW_HANDLER_JS` (target `_blank`/`window.open` réécrits dans la même WebView) et `onShouldStartLoadWithRequest` (http/https seuls, rien pendant suspension). Aucune modification nécessaire.
- **Orientation** : politique existante (`portrait`) conservée.
- **Arrière-plan** : ne fait l'objet d'**aucune promesse** — le retour au premier plan relève du parcours de **suspension/reprise existant** (§7.2). La bande n'est pas affirmée visible en arrière-plan.

### 9.5 Vérifications ciblées (Android)

> **NON TESTÉES** — aucune capture possible (device indisponible). À rejouer au prochain APK `recette`.

| ID | Vérification | État attendu |
|----|--------------|--------------|
| A | Publicité → accès → Google | Bande visible en bas, WebView navigue |
| B | Recherche → résultat → autre site | Bande immobile, page change |
| C | Défilement long | Bande fixe hors du défilement web |
| D | Retour / avance / actualisation | Pas de reset pub/quota, pas de remontage intempestif |
| E | Clavier (barre d'adresse + formulaire web) | Bande visible au-dessus du clavier, WebView réduite, pas de double décalage |
| F | Publicité vidéo / image | Vraie création affichée, proportions respectées (`contain`) |
| G | Changement de campagne | Pas de rechargement intempestif de la page |
| H | Pause → reprise | « Reprendre » accessible (§7.1), pub prête et visible après reprise |
| I | Arrière-plan → retour | Parcours de suspension existant ; aucune promesse de visibilité en arrière-plan |
| J | Publicité indisponible | Suspension centrale (jamais d'état « actif » forcé) |
| K | Déconnexion | Aucune navigation protégée encore active |
| L | Petit écran / texte agrandi | Bande ≥ 80 lisible ; WebView se réduit |

Contrôles complémentaires : absence de double audio (média muté, un seul lecteur actif), absence de double comptage (RPC centrales inchangées), quota non réinitialisé, non-chevauchement avec les onglets (padding indexé `tabBarMetrics`), parcours validés §1-6 préservés.

### 9.6 Limites restantes / signalements

- **Création non conçue pour un bandeau** (image carrée/portrait) : affichée en **`contain`** → bandes latérales, jamais coupée ni déformée. Recommandation : **fournir un asset paysage ~16:9** (≥ 640×360) pour un rendu plein bandeau. **Signalé, non corrigé au prix d'une déformation.**
- **Vidéo** : ratio 16:9 supposé par défaut (expo-av n'expose pas les dimensions intrinsèques de façon fiable) ; si une campagne vidéo a un ratio réel différent, elle sera lettrée (contenue), jamais coupée.
- **Très petits écrans** : la bande reste lisible (≥ 80) et la WebView se réduit ; si la surface de navigation devenait inutilisable, le parcours de **suspension/réponse existant** reste la voie (pas de pub rapetissée à l'illisible).

### 9.7 Changement natif

- **Aucun.** Pas d'overlay Android, pas de permission d'affichage par-dessus les apps, pas d'injection JavaScript publicitaire dans les sites, pas de nouvelle dépendance. Corrections **exclusivement JS/TS** → un simple build EAS `recette` suffit.

---

## Verdict du code corrigé (source, non-compilé)

> **CORRECTIFS PRÊTS POUR APK DE RECETTE.** Sont appliqués au code source : BUG 1 layout, BUG 1 reprise, BUG 2, A1 (§7) **et** la publicité persistante du navigateur (§9), avec `tsc --noEmit` propre et **198 tests unitaires PASS**. Aucun changement natif, aucun mot de passe en dur, aucune session factice restante, aucune validation on-device revendiquée. La **revalidation sur device (§8 + §9.5) reste conditionnée à la production d'un nouvel APK `recette`** (consigne : aucun APK créé ici).