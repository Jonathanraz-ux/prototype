# Bôjô MVP — Rapport QA APK v6 (recette, on-device)

- **Objet** : validation de l'APK **recette v6** (`com.wifizone.app`, versionName `1.1.1`, versionCode 6, build EAS `d4b1cefd-9d76-43fe-afa1-269507f1e150`).
- **Contexte** : aucun nouvel APK n'a été créé pour ce rapport (consigne utilisateur). L'APK v6 (unique) produits par le build EAS du 17/09 17h18 UTC a été installée sur device en **upgrade** de la v5 (données conservées) puis **revalidée après `pm clear`** (état 100 % frais) afin de discriminer un état corrompu hérité de v5.
- **Device** : ZTE Blade A35 (Android 13, écran 720×1600, fuseau UTC+3). Méthode : `adb` + `uiautomator dump` + logcat (traces natives `VpnBlocker`).
- **Comptes** : `demo@wifizone.app` / `B0j0-demo-2026!` (démo), réseau simulé `android_vpn_demo`.
- **Rapport v5 de référence** : `docs/MVP_PROVISOIRE_RAPPORT_QA_FINAL.md` (correctifs §7 + bande pub §9, **non validables sur device à l'époque — c'est l'objet du présent rapport v6**).
- **Mise à jour du 18/09** : les correctifs de BUG v6-1 et BUG v6-2 ont été implémentés en source puis **revalidés sur device via un build local DEBUG** (Metro + expo-dev-client, voir §0). Ce §0 prévaut sur les verdicts ci-dessous.

---

## 0. Correctifs v6-1 / v6-2 — implémentation puis revalidation (build DEBUG local, 18/09)

### 0.1 Correctifs appliqués en source

| Bug | Correctif | Fichiers |
|-----|-----------|----------|
| **BUG v6-1** | L'échec de connexion ne passe plus par le spinner global du layout : `AuthContext` expose `isRestoring` (restauration de session uniquement) ; `(public)/_layout.tsx` et `(public)/index.tsx` montrent le chargement via `isRestoring` ; l'écran de login reste monté pendant la tentative → l'erreur inline peut s'afficher, champs conservés. | `src/contexts/AuthContext.tsx`, `src/app/(public)/_layout.tsx`, `src/app/(public)/index.tsx` |
| **BUG v6-2** | (a) `connect()` admet désormais `authorizing_wifi` et repart de zéro (epoch/flow reset + `blockNow` + `internetStatus:"cut"` + `setState("idle")`) ; (b) self-heal au montage des états en vol (`ad_loading`/`ad_active`/`authorizing_wifi` → `idle`) ; (c) `renderAction` expose un CTA **« Réessayer l'autorisation Wi-Fi »** sur `authorizing_wifi` (au lieu de `null` en v6) ; (d) `authorizing_wifi` retiré de la liste `null` du dashboard. | `src/contexts/ConnectionContext.tsx`, `src/app/(app)/(tabs)/dashboard/index.tsx` |

Validation statique : `tsc --noEmit` OK ; jest **199 tests / 28 suites PASS** (suites doubles via worktree `.kilo/worktrees/heady-color`).

### 0.2 Build local DEBUG (autorisation utilisateur du 18/09)

- `gradlew assembleDebug` (`-PreactNativeArchitectures=arm64-v8a`), 2 builds ~15 min ; cache Gradle chaud.
- `android/gradle.properties` : `expo.useLegacyPackaging=true` **local uniquement** (workaround `dlopen libexpo-av.so not found` du dev-client ; **EAS reste en `false`**) → ne pas committer.
- Install : debug `versionCode=3` vs release 6 → `uninstall` + `reinstall` ; Metro port 8081 (`adb reverse`) ; scheme `bojo` ; device ZTE Blade A35 (non-debuggable, absence de `run-as`).

### 0.3 Résultats device (logs `ETAT=` + logcat natif + uiautomator)

| Bug | Verdict | Preuve |
|-----|---------|--------|
| **BUG v6-1** | **PASS** | Mauvais mot de passe → erreur inline **« Email ou mot de passe incorrect. »** à l'écran, email + mot de passe intacts, **aucun retour à l'accueil** (rebond éliminé). Connexion correcte ensuite OK. |
| **BUG v6-2** | **PASS** | `authorizing_wifi` → CTA **« Réessayer l'autorisation Wi-Fi »** affiché et fonctionnel, tapé 2× avec parcours complet rejoué : `Reprise → idle → consentement → startBlocking → health READY → startAdView (52 s) → ad_active → finalise → wifi_active`. Autorisation native émise (`gen` 0→1), carte « Wi-Fi gratuit actif ». Cycle rejoué à l'identique. Plus aucun cul-de-sac. |
| Stabilité post-autorisation | **CORRIGÉ (nouveau point)** | Cause racine identifiée et corrigée : (1) `handlePlaybackStatusUpdate` bloquait (`blockNow`) la session `wifi_active` à la moindre micro-pause du lecteur en relecture (`isPlaying=false`) — après `finalizeAdView`, la bannière rejoue en boucle et chaque interruption tuait l'accès ; (2) `signalFromServer` ne tenait pas compte de l'échéance serveur (`heartbeat_expires_at` échu ⇒ toujours « active ») → le poll `reconcileFromQuota` ré-imposait `authorizing_wifi` depuis une session obsolète, et pouvait intercepter un flux en vol (`ad_loading`/`ad_active`). Correctifs : le blocage « pause-en-session » n'intervient plus que si `viewingRef` est non nul (vue en cours non finalisée) ; `signalFromServer` accepte `enforceExpiry` (démo) et renvoie `closed/HB_TIMEOUT` si la grâce serveur est échue ; `reconcileFromQuota` n'intercède plus les états en vol. **Validé sur device** : `wifi_active` tenu **> 2 min** en continu (avant : flip `wifi_active ↔ authorizing_wifi` en ~11 s), natif sans `BLOCKED`, écran « Wi-Fi gratuit actif ». Tests ajoutés (`sessionControl` : 3 cas échéance) → 202 tests / 28 suites PASS.

### 0.4 Diagnostics et nettoyage

- Logs temporaires de QA (trace `ETAT=`, `connect::etape …`) ajoutés pour ce build device puis **retirés**. Le log `Reprise depuis authorizing_wifi : réinitialisation de l'état` est conservé (trace du correctif).
- État final : source = fixes v6-1 / v6-2 / oscillation ; **typecheck OK + 202 tests / 28 suites PASS**.
- Prêt pour un **build final propre** (§8).

---

## 1. Verdict d'ensemble

> **REFUSÉ (non présentable).** Deux régressions bloquantes sur device :
>
> - **BUG v6-2 (bloquant)** — le parcours de valorisation **« pub → accès internet » (B4→B6) est cassé** : après une connexion réussie, la publicité démo démarre bien (52 s → 0 s) mais **la récompense n'est jamais octroyée** : la machine reste figée à « Autorisation en cours » (état **`authorizing_wifi`**, confirmé), le tunnel `VpnBlocker` reste `state=BLOCKED gen=0`, aucun CTA ni tap ne relance le flux (cul-de-sac permanent, `connect()` refuse de repartir depuis cet état). V5 atteignait `wifi_active` ~70 s après le départ de la pub ; **v6 n'y arrive jamais**, reproduit sur installation fraîche (données purgées). Audit complet en §4 (chaîne de preuves + cause racine).
> - **BUG v6-1 (bloquant UX)** — après une tentative de connexion avec mot de passe erroné, **l'utilisateur est renvoyé à l'écran d'accueil sans aucune erreur traduite** : le message attendu (« Email ou mot de passe incorrect. ») n'est jamais affiché, l'écran de connexion disparaît au profit de l'écran d'accueil (le refus back-end est bien réel : `Invalid login credentials`). C'est une régression de l'écran de connexion introduite entre v5 et v6.
>
> Sont en revanche **confirmés sur device** : correctif **BUG 2** (§7.3) applicatif (plus aucun mot de passe démo embarqué), refus des mauvais identifiants côté sécurité (R7 partiel), connexion avec le bon mot de passe (dashboard OK), déconnexion (R8), persistance de session (E13/E14 partiel) et blocage de navigation (C7/C9 partiel). En l'état, **aucune démonstration client ni test A→L de la bande publicitaire n'est possible** (le flux est bloqué avant `wifi_active`).

---

## 2. Histoire du build testé

| Étape | Constat |
|-------|---------|
| Build EAS `recette` `17/09 17h18 UTC` | Terminé. Lien APK direct (artefact `.apk`, 79 971 055 o). |
| Installation v5 → v6 (`adb install -r`) | OK, signature compatible, données conservées. `versionCode=6`, `versionName=1.1.1`, `targetSdk=34`. |
| Correctifs embarqués | Vérifié par mtimes sources < heure de début du build (19:19:37 heure device) : `_layout.tsx`, `ConnectionContext.tsx`, `auth.ts`, `login/index.tsx`, `app.config.ts` (versionCode 6). **La v6 contient bien §7 et §9.** |
| Validation état frais (`pm clear`) | Pour discriminer un état corrompu hérité de v5 → le blocage pub→accès se reproduit à l'identique (voir BUG v6-2). Le blocage n'est **pas** un artéfact de données v5. |

---

## 3. Résultats par bloc

| Bloc | Verdict | Preuve |
|------|---------|--------|
| Corrections §7.3 (BUG 2 — mot de passe démo) | **PASS** | Écran de connexion : aide démo « demo@wifizone.app — **mot de passe communiqué séparément** » ; le bouton ne remplit **que** l'email. Aucun `Password123` visible, aucun mot de passe embarqué. |
| R7 — Refus mauvais mot de passe (sécurité) | **PASS (côté sécurité) / FAIL (UX)** | Logcat : `[auth] Échec connexion`, `Invalid login credentials` (Supabase). **Aucune session factice créée** (correction A1 §7.4 effective). MAIS l'utilisateur est renvoyé à l'accueil sans erreur traduite → **BUG v6-1**. |
| Login correct (demo) | **PASS** | `demo@wifizone.app` + `B0j0-demo-2026!` → dashboard « Bonjour Demo » en < 1 s. |
| B4 — Déclenchement pub + canal VPN | **PASS (départ) / FAIL (fin)** | Après connexion, la pub « [DÉMO] Publicité de test WiFi Zone » démarre (52 s restantes, « Lecture en cours — Appuyez pour mettre en pause ») ; le tunnel `VpnBlocker` est lancé (`tunnelUp=true`). |
| B5 — Récompense et accès réseau | **FAIL** | La pub se termine (0 s restantes, « En pause — Appuyez pour reprendre la lecture ») puis **rien** : jamais `wifi_active`, pas de « Accès autorisé », pas de bouton « Se déconnecter ». Traces natives `<VpnBlocker: TRACE state=BLOCKED gen=0 ttlLeftMs=0 tunnelUp=true` en continu (jamais d'autorisation). Reproduit à l'identique après `pm clear`. → **BUG v6-2**. |
| B6 — Continuité pub pendant navigation | **BLOCKÉ** | Non atteignable (jamais `wifi_active`). |
| C7/C9 — Navigation en suspension | **PASS partiel** | Onglet Naviguer : overlay de suspension « La navigation reprend dès que la publicité et la session sont actives » / « Le serveur confirme votre session… » affiché. À confirmer visuellement : la page démo `https://www.google.com` semble se charger **derrière** l'overlay. |
| E13/E14 — Kill/relance persistance | **PASS partiel** | `force-stop` + relance → l'utilisateur reste connecté (session conservée), plus de welcome. **Mais** l'état machine figé se restaure tel quel (le blocage persiste après relance). |
| R8 — Déconnexion | **PASS** | Profil → (scroll) → « Se déconnecter » → écran d'accueil « Commencer / Créer un compte gratuitement ». |
| Bande publicitaire navigateur §9 (A→L) | **NON TESTABLE** | Jamais atteint `wifi_active` → aucun écran de navigation active. |
| R1-R6 (pause/reprise, double appui, panne transitoire…) | **NON TESTABLE** | L'état `paused` n'a jamais pu être atteint (le flux bloque en amont, à `ad_loading`/`authorizing_wifi`). |
| Stabilité / crash | **PASS** | Aucun crash, aucun `FATAL` ; PID constant ; `uiautomator` indisponible pendant le rendu vidéo (normal). |

---

## 4. Anomalies

### BUG v6-1 — Échec de connexion : renvoi à l'accueil sans message (bloquant, régression UI)

- **Constat** : email + mauvais mot de passe → le refus back-end est réel (logcat `Invalid login credentials`) et **aucune session n'est créée** (A1 corrigé : OK), mais au lieu d'afficher l'erreur traduite inline « Email ou mot de passe incorrect. », l'app **quitte l'écran de connexion et revient à l'écran d'accueil** (observé plusieurs fois, y compris sur installation fraîche ; parfois sans même qu'une tentative réseau ne parte dans le buffer logcat, avec rebond < 1 s).
- **Mécanisme probable** : `AuthContext.login()` passe par `setIsLoading(true)` → `(public)/_layout.tsx` remplace le Stack par un écran de chargement (spinner), ce qui **démonte l'écran de connexion** ; à l'échec, `isLoading=false`, le Stack se remonte sur la route initiale (`/` → `Redirect` vers splash → accueil), et l'écran de connexion avec CHAMP et ERREUR est perdu. Les champs vides ne passent pas par `isLoading` → l'erreur locale « Veuillez remplir tous les champs » s'affiche correctement (constaté : PAS de rebond dans ce cas). Seul le cas « appels réseau » rebondit.
- **Impact** : impossible de voir un motif d'échec ; lister/débugger un mauvais mot de passe devient impossible sans quitter l'app.
- **Correctif à prévoir (prochain build autorisé)** : ne pas passer par le `isLoading` global du layout pour l'état local de soumission du login (état `loading` local du formulaire), ou conserver l'adresse de la route de connexion lors du démontage/re-montage du Stack.

### BUG v6-2 — Parcours « pub → accès » cassé : la récompense n'est jamais octroyée (bloquant, régression B4→B6)

- **Constat (installation fraîche, `pm clear`)** : connexion correcte → l'état machine **vérifié `authorizing_wifi`** (libellé d'état « Autorisation Wi-Fi » sur le device), statut « Autorisation en cours », badge « Agent non configuré », pub démo joue (52 s → 0 s), puis machine figée : « 0 s restantes », « En pause — Appuyez pour reprendre la lecture », **aucun CTA** (« Regarder la pub et se connecter » absent car `renderAction` renvoie `null` en `ad_loading`/`ad_active`/`authorizing_wifi` avec `currentAd` présent), tap sur la carte = inert (aucun changement, aucun log). Vérifié jusqu'à > 100 s : pas de transition `wifi_active`. Traces natives : `VpnBlocker state=BLOCKED gen=0 ttlLeftMs=0` en boucle — **l'autorisation native n'a jamais été émise** (voir analyse complète ci-dessous).
- **État précis (confirmé device)** : `uiautomator` atteste `stateLabel = « Autorisation Wi-Fi »` → la machine est **verrouillée sur `authorizing_wifi`** (pas `ad_loading`, dont le libellé serait « Recherche de publicité »). `connecting` reste donc vrai → « Autorisation en cours » côté carte.
- **Chaîne de preuves (audit traces + code)** :
  1. `TRACEJS onLoad view=- … pos=52209 playing=false` à la fin de lecture : `viewingRef.current` est **vide** (`view=-`), i.e. `finalizeAdView` a déjà soldé la vue (L1009) **sans aboutir**.
  2. `didJustFinish` n'est traité que si `s === "ad_active"` (L698-708). Une fois `authorizing_wifi`, la garde ne se réarme **jamais** : l'état ne repasse pas par `ad_active`.
  3. La transition `authorizing_wifi → wifi_active` n'existe que via `SESSION_AUTHORIZED` (L44) ou `HB_OK` heartbeat serveur (L54). Or `SESSION_AUTHORIZED` (L1073) n'est atteinte qu'après `requestDemoWifiSession` **ok** + `serverTtlDecision` **« authorize »** + `setAuthorized` **natif ok**. Le natif reste `gen=0` ⇒ **cet enchaînement n'a jamais abouti** (le serveur n'est pas arrivé à une échéance exploitable, ou l'appel a échoué côté serveur/démo).
  4. **Impassabilité côté client** (le verrou mort) : `connect()` refuse de repartir depuis `authorizing_wifi` (garde L912 : seuls `idle`/`quota_exhausted`/`error`/`paused` sont admis) ; `renderAction` renvoie `null` (L66-75) → aucun bouton ; `HeroAdCard` → `togglePlayback` appelle `connect()` no-op ; la pub PREVIEW continue en boucle avec `view=-` (aucun flux de récompense lié). L'état est **persisté** → le relance reproduit le blocage.
  5. `blocage natif intrusif impossible à lever de l'extérieur` : le service n'est pas exporté (`startservice` externe → « Requires permission not exported »), donc aucun contournement manuel ; seul un vrai nouveau build peut débloquer.
- **Cause racine (à confirmer au prochain build instrumenté)** : la boucle de valorisation démo termine la pub (`ad_active`→`authorizing_wifi`) mais la finalisation serveur→native ne produit jamais le verdict « authorize » exigé en v6 (enchaînement `request-demo-wifi-session` → `heartbeatExpiresAt` → `serverTtlDecision`), et l'état d'attente est un **cul-de-sac sans CTA ni re-déclenchement**. Le correctif v5 « BUG 1 » (L756-763, forceClose sur stale flow) ne couvre que l'état `paused` — pas `authorizing_wifi`.
- **Correctifs à prévoir (prochain build autorisé)** : (1) tout verdict serveur non-`authorize` de `finalizeAdView`/demo doit transiter vers `idle`/`error` avec message (jamais rester en `authorizing_wifi`) ; (2) autoriser `connect()` depuis `authorizing_wifi` (ou un état `error` dédié) et exposer un CTA « Réessayer » dans `renderAction` ; (3) reloger les logs JS en logcat (console relayée) pour rendre ce diagnostic non aveugle en release.
- **Impact** : plus aucun accès payé-par-la-pub sur ce build ⇒ **bloquant pour toute démonstration**.

### Observations mineures

- « Agent non configuré » affiché dès que le tunnel n'est pas actif (déjà signalé v5).
- « Se déconnecter » sous le pli de l'écran Profil (déjà signalé v5).
- La page démo (Google) semble chargée derrière l'overlay de suspension de l'onglet Naviguer — à confirmer par une capture visuelle humaine.
- `uiautomator dump` renvoie « could not get idle state » pendant le rendu vidéo → les dumps intermédiaires de lecture sont indisponibles (méthode déjà connue v5).

---

## 5. Méthode et limites

- Lecture d'état via `uiautomator dump` ; traces natives `VpnBlocker` via logcat ; pas d'analyse visuelle des captures (modèle sans vision).
- Release build → aucune trace `ReactNativeJS` en logcat (console JS non relayée) → impossible de confirmer les étapes précises de la machine (traces `TRACEJS`, `resume-from-paused`, `server-check` promises par §7 non observables ici).
- **`run-as` indisponible** (APK non debuggable) → pas d'inspection du stockage (AsyncStorage) pour prouver l'absence de fichier de session.
- Le service `VpnBlockerService` n'est pas exporté : une tentative d'injection de la commande native `VPN_UPDATE_AUTH` (autorisation artificielle de test) depuis `adb` est refusée (« Requires permission not exported ») → l'autorisation native ne peut pas être validée indépendamment de la JS sans modifier l'APK.
- Saisie `adb input text` : caractères `!`/`-` acceptés (mot de passe), `@` non testé (remplissage email via l'aide démo).
- Deux environnements testés : upgrade v5→v6 (données conservées) **et** installation fraîche (`pm clear`) → les deux aboutissent aux mêmes anomalies : ni un artéfact de données v5, ni l'état « en pause » hérité n'expliquent v6-1/v6-2.

---

## 6. Critères de sortie MVP provisoire — statut

1. ✔ Build `recette` réussi + APK v6 installable en upgrade.
2. ✘ Session « pub → navigation autorisée » : **cassée** (BUG v6-2) ; reprise après pause et bande §9 conditionnées à ce parcours.
3. ✔ Compteurs quota uniquement en mode `live` (affichage honnête « compteurs non actifs en mode provisoire » conservé).
4. ⚠ Compte démo : rejouable en manuel ; mécanique Admin non rejouée sur ce device (hors scope).

---

## 7. Ce qui restera à rejouer après correctif

| ID | Vérification (issue du rapport v5 §8 / §9.5) | Statut sur v6 |
|----|---------------------------------------------|---------------|
| R1-R6 | Pause/reprise, double appui, panne transitoire, déconnexion pendant reprise | Non atteignable (blocage en amont) |
| R7 | Mauvais mot de passe refusé + **erreur traduite affichée** | Refus OK, message → **corrigé (§0, PASS device)** |
| R8 | Aucun identifiant/mot de passe embarqué | PASS, vérifié à l'écran |
| A-L | Bande publicitaire persistante navigateur | Atteignable (§0 : `wifi_active` atteint) — bande navigateur à rejouer |
| B4-B6 | Déclenchement pub → récompense → navigation | **corrigé (§0, `wifi_active` atteint ×2)** ; stabilité post-auth = suivi §0.3 |

---

## Verdict final

> **Les correctifs déclarés « prêts » au rapport v5 (non testés faute de device) ne tiennent pas sur l'appareil.** La v6 corrige bien le mot de passe démo (BUG 2), le refus des mauvais identifiants et la session factice (A1), mais **casse le parcours publicitaire (B4→B6)** et **dégrade l'écran de connexion** (rebond sans message). Aucun nouvel APK n'a été produit (consigne). La prochaine itération devra corriger BUG v6-1 et BUG v6-2 en source, puis rejouer R1-R8 + B4-B6 + A→L sur un nouveau build `recette`.

> **Mise à jour (18/09)** : les correctifs du §0 (v6-1 : login sans rebond + erreur inline ; v6-2 : reprise depuis `authorizing_wifi` + CTA « Réessayer » + self-heal) ont été **validés sur device** via build local DEBUG : mauvais mot de passe → erreur inline stable ; CTA « Réessayer l'autorisation Wi-Fi » → parcours complet jusqu'à `wifi_active` ×2. **BUG v6-1 et BUG v6-2 clos.** Suivi à mettre au cahier des charges : oscillation `wifi_active ↔ authorizing_wifi` post-autorisation (§0.3). **Étape suivante : build final (§8).**

---

## 8. Build final — statut

- **Source prête** : v6-1, v6-2 et oscillation (§0.3) corrigés ; `tsc --noEmit` OK ; **202 tests / 28 suites PASS**.
- **Restrictions build local** : `android/gradle.properties` `expo.useLegacyPackaging=true` est un workaround dev-client **local uniquement** → hors commit ; EAS reste `false`.
- **Build EAS réalisé (18/09)** : profil `recette` → APK **Bôjô 1.2.0 (versionCode 7)**, runtimeVersion 1.2.0, canal `recette`, distribution `internal`, signature EAS (clé release). Build id `01ec6729-61bb-4069-90d6-e5c7ad1c2331` — FINISHED en ~10 min. Livrable : `build/BOJO-1.2.0-recette.apk` (≈76 Mo) → transfert Xender / installation manuelle.

### 8.1 Revalidation sur device (ZTE Blade A35, build release 1.2.0)

| # | Vérification | Résultat |
|---|---|---|
| R1 | Installation fraîche (désinst. debug VC3 → install VC7) | PASS — versionCode 7/versionName 1.2.0 |
| R2 | Welcome → « Commencer » → login | PASS — écran login atteint |
| R3 | Login compte démo | PASS — « Bonjour Démo » → dashboard |
| R4 | Consentement VPN (1er lancement, dialog système) | PASS — accord utilisateur, flux poursuivi |
| R5 | CTA « Regarder la pub et se connecter » → pub → accès | PASS — pub 52,2 s jouée, `setAuthorized gen=1`, écran accès autorisé |
| R6 | Stabilité `wifi_active` (build release) | PASS — heartbeat `ok` + `setAuthorized gen=1` toutes les **10 s** (12:34:34 → 12:35:24+), aucune régression/oscillation |
| R6bis | Persistance après `force-stop` + relance | PASS — aucun crash, session démo conservée (« Bonjour Démo »), retour `idle` propre (session serveur expirée pendant l'arrêt → blocage attendu) |

- Note : les dumps `uiautomator` sont **périmés tant qu'une vidéo joue** (erreur « could not get idle state ») ; l'état réel est attesté par la cadence heartbeat native (source fiable).
- **À rejouer sur le poste client éventuellement** : A→L (bande publicitaire navigateur), quota strict. Non bloquant pour la démo cliente.