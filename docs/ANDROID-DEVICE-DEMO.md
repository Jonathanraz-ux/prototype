# WiFi Zone — Démonstration Locale Android Autonome (VpnService)

Ce document décrit l'architecture, l'installation, le protocole de test physique et l'exploitation de l'APK autonome de démonstration permettant de suspendre réellement l'accès Internet des autres applications du téléphone via un `VpnService` local, sans routeur physique MikroTik ni agent local.

---

## 1. Architecture Retenue

### A. Flux Réseau & Isolation
```
[ Applications tierces (Chrome, YouTube, etc.) ]
                      │ (Tout le trafic capturé)
                      ▼
[ Tunnel TUN Local (VpnBlockerService) ]
        │
        ├── ÉTAT BLOCKED  ──► Paquets lus et jetés (Blackhole / Drain Loop) -> Internet coupé
        └── ÉTAT ALLOWED  ──► Tunnel TUN retiré -> Trafic Wi-Fi direct rétabli
```

```
[ Application WiFi Zone (Exclue via addDisallowedApplication) ]
                      │
                      ├── Appels Supabase (Auth, Sessions, Quotas, Heartbeat)
                      └── Chargement des Publicités Vidéo / Image
```

* **Exclusion ciblée** : `builder.addDisallowedApplication(packageName)` permet à WiFi Zone de contacter Supabase et charger les publicités même lorsque l'Internet des autres applications est suspendu.
* **Aucun proxy / Pas d'interception TLS** : Les paquets interceptés sont lus en boucle bloquante sur le descripteur TUN et abandonnés. Aucun contenu ni destination n'est conservé.
* **Routes par défaut** : Capture `0.0.0.0/0` (IPv4) et `::/0` (IPv6) pour interdire toute fuite réseau.

### B. États de la Machine VpnService
1. `DISABLED` : Démonstration désactivée, service arrêté.
2. `PERMISSION_REQUIRED` : Boîte de consentement système Android `VpnService.prepare()` en attente.
3. `BLOCKING` : Transition d'établissement du tunnel.
4. `BLOCKED` : Interface TUN active et boucle de vidage opérationnelle.
5. `ALLOWING` : Transition de retrait du tunnel après validation.
6. `ALLOWED` : Tunnel retiré, trafic Wi-Fi direct actif, service de surveillance au premier plan.
7. `ERROR` : Échec d'allocation de descripteur ou rupture inattendue.

### C. Watchdog Monotone & Anti-Fuite
* **Horloge monotone** : `SystemClock.elapsedRealtime()` calcule l'échéance d'autorisation native (plafonnée à 25–30 secondes).
* **Watchdog natif** : Un handler cadencé à 500 ms vérifie la validité de l'autorisation. Si l'échéance expire sans nouveau battement ou si l'application passe en arrière-plan, le service rétablit immédiatement `BLOCKED`.
* **Génération de session** : Un compteur monotone incrémenté à chaque pause, arrêt ou déconnexion rejette toute réponse serveur tardive (`stale_generation`).

---

## 2. Configuration & Modes Réseau

L'application distingue explicitement trois modes :
1. `android_vpn_demo` : Démonstration autonome locale via `VpnBlockerService`.
2. `mikrotik` : Mode de production/pilote avec file de commandes signées HMAC et agent local MikroTik.
3. `mock` : Mode développement hors ligne.

### Variable d'Environnement
Dans `.env` :
```ini
EXPO_PUBLIC_NETWORK_MODE=android_vpn_demo
```
*Le sélecteur visuel sur le Dashboard permet également de basculer dynamiquement entre les modes.*

---

## 3. Backend Supabase & Quota Persistant

### Migrations Appliquées
* `0009_test_network_allocations.sql` : Modèle de persistance des allocations 5 Go (binaire : `5 368 709 120 octets`), sessions et événements d'audit.
* `0010_android_vpn_demo.sql` : Fonctions atomiques dédiées au mode démo :
  * `public.request_demo_wifi_session` : Validation de session sans exigence d'agent/routeur physique (`router_session_reference = 'vpn-demo-local'`).
  * `public.demo_consume_quota` : Consommation simulée persistante, atomique, bornée au quota restant.
  * `public.demo_reset_quota` : Réinitialisation explicite du compte démo à 5 Go.

---

## 4. Livrable & Compilation

### Caractéristiques de l'APK
* **Chemin absolu** :
  `C:\Users\JONATHAN\PROTOTYPE\android\app\build\outputs\apk\release\app-release.apk`
* **Package Android** : `com.wifizone.app`
* **Version** : `1.0.0` (versionCode `1`)
* **Taille** : `76 540 286 octets` (~76.5 Mo)
* **Empreinte SHA-256** :
  `EA04E318FB4E6C484121620C15C307DF172AAC3B7761535F7E5BF8E9BF295886`

### Commande de Compilation Utilisée
```powershell
cd c:\Users\JONATHAN\PROTOTYPE\android
.\gradlew.bat :app:assembleRelease -x lint
```

---

## 5. Procédure d'Installation

### A. Via ADB (USB / Wi-Fi)
```powershell
adb install -r "C:\Users\JONATHAN\PROTOTYPE\android\app\build\outputs\apk\release\app-release.apk"
```
*Si une version signée avec un certificat différent est déjà présente, désinstallez-la au préalable après confirmation des données locales :*
```powershell
adb uninstall com.wifizone.app
adb install "C:\Users\JONATHAN\PROTOTYPE\android\app\build\outputs\apk\release\app-release.apk"
```

### B. Installation Manuelle
1. Transférer le fichier `app-release.apk` sur le téléphone (via câble USB, WhatsApp, Drive ou serveur local).
2. Ouvrir le fichier depuis le gestionnaire de fichiers Android.
3. Autoriser l'installation d'applications de sources inconnues si demandé.
4. Lancer l'application **WiFi Zone**.

---

## 6. Démonstration Client en Écran Partagé (Split-Screen)

### Pourquoi l'écran partagé ?
Ouvrir une autre application (comme Chrome) en plein écran place WiFi Zone en arrière-plan (`AppState != 'active'`), ce qui déclenche immédiatement le blocage par mesure de sécurité anti-contournement. Le mode **écran partagé** permet de maintenir la visibilité de la publicité tout en naviguant dans Chrome.

### Protocole Pas-à-Pas
1. **Préparation** :
   * Désactiver les données mobiles (4G/5G).
   * Se connecter au Wi-Fi.
   * Désactiver tout autre VPN tiers.
2. **Consentement** :
   * Lancer **WiFi Zone**.
   * Dans l'encart « Démo VPN », appuyer sur **Activer le contrôle VPN local**.
   * Accepter la boîte de dialogue officielle Android (icône de clé).
3. **Mise en écran partagé** :
   * Ouvrir les applications récentes Android.
   * Sélectionner l'icône de WiFi Zone -> **Écran partagé**.
   * Ouvrir **Google Chrome** dans l'autre moitié de l'écran.
4. **Vérification du Blocage Initial (BLOCKED)** :
   * Dans Chrome, tenter d'ouvrir une nouvelle page HTTPS (ex: `https://example.com` ou `https://wikipedia.org`).
   * **Constat** : Le chargement tourne dans le vide et échoue (Internet coupé).
   * Dans WiFi Zone, la publicité reste accessible et charge normalement.
5. **Vérification de l'Autorisation (ALLOWED)** :
   * Dans WiFi Zone, appuyer sur **Regarder la pub et se connecter**.
   * Laisser la vidéo se terminer (ou attendre la validation).
   * Une fois le statut **Wi-Fi actif** affiché (encart vert `Internet autres apps : AUTORISÉ`), charger une nouvelle page dans Chrome.
   * **Constat** : La page se charge instantanément.
6. **Vérification de la Pause** :
   * Dans WiFi Zone, appuyer sur **Se déconnecter** ou mettre la session en pause.
   * Tenter immédiatement une nouvelle requête dans Chrome.
   * **Constat** : Coupure instantanée du trafic de Chrome.
7. **Simulation de Consommation & Épuisement** :
   * Dans l'encart démo, appuyer sur **+500 Mo** : le quota restant diminue immédiatement sur le Dashboard et dans Supabase.
   * Appuyer sur **Épuiser** : le quota passe à 0 Mo, le tunnel se verrouille immédiatement (`BLOCKED`), toute tentative de reconnexion est refusée avec le motif *Quota épuisé*.
   * Appuyer sur **Reset 5G** pour restaurer les 5 Go persistants.

---

## 7. Récupération & Retour au Mode MikroTik

### Rétablissement d'Urgence d'Internet sur le Téléphone
* Dans l'application : Appuyer sur **Quitter démo et rétablir Internet**.
* Depuis les paramètres Android : **Paramètres > Réseau et Internet > VPN > WiFi Zone > Déconnecter / Oublier le VPN**.
* Forcer l'arrêt de l'application WiFi Zone supprime également le tunnel TUN.

### Rebasculer vers le Mode MikroTik
Dans l'application, sélectionner la pilule **MikroTik** sur le Dashboard, ou définir dans `.env` :
```ini
EXPO_PUBLIC_NETWORK_MODE=mikrotik
```
Le fonctionnement classique via Edge Functions, file de commandes signées et agent physique reprend sans modification de code.

---

## 8. Résultats des Tests & Preuves

| Composant | Statut | Preuve / Commande |
| :--- | :--- | :--- |
| **Compilation APK Release** | **SUCCÈS (Code 0)** | `.\gradlew.bat :app:assembleRelease -x lint` (76.5 Mo généré) |
| **Compilation Kotlin VpnBlocker** | **SUCCÈS (Code 0)** | `.\gradlew.bat compileDebugKotlin` |
| **Tests Jest (Mobile)** | **10/10 PASS (50 tests)** | `npm test` |
| **TypeScript Typecheck** | **0 ERREUR** | `npm run typecheck` (`tsc --noEmit`) |
| **Tests Deno (Edge Functions)** | **17/17 PASS** | `npm run test:functions` |
| **Tests Node.js (Agent)** | **17/17 PASS** | `node --test agent/test/*.test.mjs` |
| **Tests physiques sur smartphone** | **NON TESTÉ** | Aucun appareil ADB connecté (`adb devices` vide) |

---

## 9. Limites Connues
* **Écran éteint / Verrouillage** : Android coupe l'activité au premier plan ; le watchdog natif rebloque le trafic par sécurité.
* **Force-Stop Android** : Si l'utilisateur force l'arrêt de WiFi Zone depuis les paramètres système, Android détruit le `VpnService` et libère le routage réseau direct.
* **Contournement par Données Mobiles** : Il est recommandé de couper les données mobiles pendant la démonstration pour forcer l'intégralité du trafic sur l'interface Wi-Fi/VPN.
