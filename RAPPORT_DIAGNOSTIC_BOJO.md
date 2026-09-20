# RAPPORT DE DIAGNOSTIC — Bôjô / WiFi Zone (device LZ0A35TZDD1018669)

Date : 2026-09-20 (matinée). Écran : onglet « Naviguer » (WebView intégrée).
Objet : le symptôme « je tape *madagascar*, l'URL change dans la barre mais je ne vois pas de résultats sous la barre de recherche ».

---

## 1. Méthode (aucune modification d'APK, mesures sur l'appareil)

Toutes les observations ci-dessous proviennent de l'appareil (adb : logcat `VpnBlocker`/`TRACEJS`, `dumpsys connectivity/input_method/window`, `uiautomator dump`, `screencap`) et du serveur (tables `wifi_sessions` / `ad_views`). Aucun paramètre VPN/délai/rendu n'a été modifié pendant les mesures.

## 2. Observations mesurées

### 2.1. La chaîne d'accès fonctionne (serveur + vidéo + VPN)
- Saisie « madagascar » + validation : la barre d'adresse affiche bien l'URL de recherche correcte :
  `https://www.google.com/search?q=madagascar&ie=utf-8&oe=utf-8` (dump a11y).
- Exemple de cycle complet rejoué et validé :
  `start-ad-view → onLoad pos avancées (lecture réelle) → didJustFinish watched=5s → complete-ad-view`
  (log `10:56:36`, publicité `b5565945` complétée côté serveur à `07:56:32Z`).
- La publicité complétée crée bien la session : `wifi_sessions` montre `137447d1 … active` (depuis `07:56:38Z`).
- Session saine (tunnel fermé) : réseau par défaut = **Wi-Fi uniquement** (pas de VPN), ping `8.8.8.8` **0 % de perte**.

### 2.2. Le symptôme est reproductible et il est ÉVÉNEMENTIEL (j'ai vu la SERP s'afficher)
- **Fenêtre saine** : la SERP « madagascar » **s'affiche** (confirmé visuellement par l'utilisateur ET par le fait que la gate reste ouverte : transport Wi-Fi, heartbeat OK).
- **Fenêtre d'échec (reproduite à 10:57)** : après saisie + validation, l'URL change dans la barre, puis l'écran bascule sur la gate :

  | Élément | Valeur mesurée (dump a11y) |
  |---|---|
  | Barre d'adresse | `https://www.google.com/search?q=madagascar&ie=utf-8&oe=utf-8` |
  | Titre gate | « Aucune connexion » |
  | Message gate | « Vérifiez votre connexion Wi-Fi, puis revenez à l'Accueil. » |
  | Bouton | « Aller à l'Accueil » |

- Séquence réseau au moment de l'échec (horodatage) :
  - 10:56:48 — dernier `heartbeat ok ttlMs=25000` (validité serveur jusqu'à **10:57:13**) ;
  - ~10:57:1x — chargement de la SERP en cours ;
  - **10:57:39** — le tunnel VPN `tun0` (« WiFi Zone Démo », réseau 119) est **recréé comme réseau par défaut** (route `0.0.0.0/0 → tun0`) ;
  - 10:58:00 — natif `TRACE state=BLOCKED gen=2 ttlLeftMs=0 tunnelUp=true`.

  ⇒ L'autorisation native (max 25–30 s) a **expiré pendant le chargement** → le *kill-switch* ré-engage le tunnel → l'écran bascule.

## 3. Cause démontrée (chaîne complète)

`transport` du module `useNetworkTransport` (poll 5 s) provient de `expo-network.getNetworkStateAsync()`. Quand le réseau par défaut devient **notre propre tunnel VPN `tun0`**, ce module ne rapporte plus de transport Wi-Fi → **`transport === "none"`** → `browseGateDecision()` retourne `{ allowed:false, reason:"offline" }` (cf. `src/lib/browsePolicy.ts:103` et `:177`) → `BrowseSuspensionScreen` « Aucune connexion » → **WebView démontée** pendant la navigation.

En clair :
1. `submit("madagascar")` met à jour la barre d'adresse (URL correcte) ;
2. pendant le chargement, un heartbeat de renouvellement retarde/se bloque (jank JS : re-render de la WebView + boucle vidéo ~300 ms + clavier ADJUST_RESIZE) ;
3. auth native expirée → tunnel re-engagé (comportement *prévu* du *kill-switch*) ;
4. mais la décision du navigateur interprète ensuite « notre VPN est le réseau par défaut » comme « plus aucun réseau » ⇒ **faux-négatif « offline »** ;
5. la WebView est **démontée** ⇒ aucun résultat sous la barre (l'URL, elle, reste affichée).

Le « je vois parfois la recherche » est donc normal : cela correspond aux fenêtres où le tunnel reste fermé pendant tout le chargement.

## 4. Bugs secondaires découverts pendant les mesures (non mis en cause dans le symptôme, mais aggravants)

- **Lecteur publicitaire recyclé, jamais relancé** : `HeroAdCard`/`BrowseAdBanner` utilisent `key={currentAd.id}` et `src/lib/browser`… `currentAd.id` est la **campagne** (`demo-campaign-video`, constante) : dans un même processus, après une lecture terminée (pos=5055), le `Video` expo-av est réutilisé à l'état « fini » et **ne rejoue jamais** ⇒ pas de `didJustFinish` ⇒ le visionnage reste bloqué côté serveur. Mesuré : `ad_views` `0bb70f0e`, `a3e7fdce`, `26461e91` sont restées **0 s « abandoned »**.
- **Auto-onboard bloqué en « authorizing_wifi »** : au démarrage, l'auto-déclenchement laisse l'app dans un état « Autorisation en cours » qui n'aboutit jamais (le « cul-de-sac » déjà commenté dans `ConnectionContext.tsx` l.961-973) ; `connect()` sait le réinitialiser, mais l'utilisateur reste coincé tant qu'il n'appuie pas.

## 5. Barre d'adresse (coordonnées) — note pour les tests à distance
La barre d'adresse réelle est à **y ≈ 287–343** dans l'écran « Naviguer » (et NON y≈120, qui est la zone des notifications système sur cette ZTE — les premiers tests y ont été pollués par l'ombrage de notifications).

## 6. Correctifs minimaux proposés (par priorité, à valider)

Le protocole interdit de modifier VPN + délais + rendu en même temps, et interdit d'« étendre » l'autorisation pour masquer. Les correctifs ci-dessous sont ciblés :

1. **Ne jamais déduire « offline » de notre propre VPN (cause directe du bug).**
   Dans `browseGateDecision` (ou son appelant), ne pas traiter `transport === "none"` comme une perte de connexion quand l'app a volontairement ré-engagé son tunnel VPN : distinguer « aucune interface », « rien que notre VPN Bôjô » (porteur du contrôle) de « vrai offline ». Le transport doit être lu **par rapport à la politique** : pendant `wifi_active` avec heartbeat OK, le passage du tunnel en réseau par défaut est **un événement de contrôle, pas une panne réseau** — la gate ne doit pas se fermer sur ce seul motif.
   *Effet attendu (avant/après) :* SERP visible en continu tant que la session est valide, y compris pendant que le tunnel se réengage ponctuellement.

2. **Continuité du renouvellement pendant la navigation.**
   Au déclenchement d'une navigation (`submit`/`navigate`, `handleLoadStart`), forcer un `beat()` immédiat + court retry avant le seuil natif, afin de ne jamais ouvrir de fenêtre d'expiration à cheval sur un chargement. (Il ne s'agit pas d'étendre la TTL garantie serveur — `ttlMs` reste issu des dates serveur ; on réduit seulement la latence de renouvellement.)
   *Effet attendu :* suppression de la fenêtre 10:57:13-39 qui tue les chargements.

3. **Relancer le média à chaque visionnage (`key` par `viewId`/nonce, pas par campagne).**
   Dans `HeroAdCard`/`BrowseAdBanner`/`AdMedia` : passer la clé du lecteur à une valeur qui change à chaque lancement de publicité (ex. `sessionNonce`/`viewId`), au lieu de `currentAd.id`. La vidéo repart de zéro à chaque visionnage → `didJustFinish` re-fiable → moins d'« abandoned » côté serveur.

4. **Auto-onboard : ne pas démarrer une lecture sans interaction** (ou le garder mais le faire aboutir via la remise à zéro existante), pour ne pas retomber dans le cul-de-sac « Autorisation en cours » (cf. §4).

## 7. Avant / Après

| Critère | Avant | Après (correctif 1+2, puis 3) |
|---|---|---|
| SERP « madagascar » sous la barre | Intermittente (perdue quand auth expire + tunnel = défaut) | Visible pendant toute la session valide |
| Gate « Aucune connexion » | Déclenchée à tort sur notre propre VPN | Ne se ferme plus sur ce seul motif |
| Visionnages publicitaires | `0 s abandoned` quand lecteur recyclé | Repartent de zéro à chaque fois |
| Renouvellement pendant navigation | Fenêtre d'expiration à cheval sur les chargements | Renouvellement anticipé immédiat |

## 8. Procédure de vérification (rejouable sur le device)

1. `am force-stop` puis relancer l'app (frais → lecteur neuf) ; attendre l'état `idle`.
2. Appuyer sur « Regarder la pub et se connecter » ⇒ attendre `didJustFinish watched=5s` puis `heartbeat ok ttlMs=25000`.
3. Aller dans « Naviguer » ; barre d'adresse **y≈315** ; saisir `madagascar` ; valider.
4. Contrôles : (a) barre = URL SERP ; (b) `dumpsys connectivity | Active default network` → **Wi-Fi uniquement** tant que le tunnel est fermé ; (c) la SERP s'affiche tant que `heartbeat ok` se renouvelle toutes les ~10 s ; (d) si le tunnel revient (`tun0` par défaut) en cours de chargement → aujourd'hui gate « Aucune connexion », après correctif → chargement maintenu.
5. Attendus post-correctif : aucun basculement gate sur la seule présence de notre VPN ; URL affichée = URL réellement chargée.

## 9. Limites & build de diagnostic (si nécessaire)
L'APK actuel (release) ne trace **pas** les événements WebView (`onLoad`, `onError`, `onRenderProcessGone`, `onHttpError`), ni le code exact d'erreur reçu par la WebView au moment du basculement. Les mesures actuelles suffisent pour la cause principale (gate offline + expiration d'autorisation). Si vous souhaitez **prouver sans ambiguïté** le chemin de réseau des requêtes WebView (processus hôte vs renderer), une seule APK de diagnostic avec logs d'événements WebView + horodatage est nécessaire — je préciserai exactement ce qui y serait ajouté avant de la préparer.

## 10. Fichiers en cause
- `src/services/networkTransport.ts` (expo-network → transport)
- `src/lib/browsePolicy.ts` (`browseGateDecision` : motif `offline`)
- `src/components/BrowseSuspensionScreen.tsx` (rendu « Aucune connexion »)
- `src/contexts/ConnectionContext.tsx` (heartbeat l.560-614, autorisation native l.576-583, connect l.943+, cul-de-sac l.961-973)
- `src/app/(app)/(tabs)/browse/index.tsx` (submit/navigate l.153-183, gate l.124-151, handleWebError l.202-209)
- `src/components/AdMedia.tsx` / `HeroAdCard.tsx` / `BrowseAdBanner.tsx` (`key={currentAd.id}`)
- Plugins VPN : `plugins/vpn-blocker/VpnBlockerService.kt`, `VpnBlockerModule.kt` (max auth 30 s, watchdog 500 ms)