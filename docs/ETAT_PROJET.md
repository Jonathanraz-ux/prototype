# Bôjô — État du projet (14 sept. 2026)

> Document d'état de référence à jour au **14/09/2026** (après séance
> madame, commit `f0f1087`).

---

## 1. Objectif de cette itération (14/09 — cycle « MikroTik »)

Préparer, **sans le téléphone ni le routeur**, l'intégration MikroTik de l'app :
fournisseur réseau réel séparé de la simulation (l'app ne contient **jamais**
d'identifiant routeur), chaîne Edge Functions → agent local → RouterOS, en
gardant toutes les autres fonctionnalités (navigateur intégré, pubs, quota)
intactes pour le test du lendemain. Isoler et tester chaque élément (unitaires
jest + scripts simulés). **L'intégration matérielle RouterOS reste marquée
NON VALIDÉE** tant qu'un routeur physique n'est pas en main.

Rappel de l'objectif de l'itération précédente (transport raw fetch), voir §2.

---

## 2. Changements effectués (transport raw fetch — itération précédente)

Rappel : le transport Supabase a été réécrit en **fetch direct**
(Edge Functions + REST) parce que `supabase-js` ne fournissait par défaut ni le
JWT `Authorization` ni l'`apikey` nécessaires → la passerelle répondait
`unauthorized`. De plus, la disparition d'une `edge_call` commitée en 08.5*
a cassé `functions.database` de `supabase-js`
(`supabase.functions.invoke` échouait).

### 2.1 Transport backend (cœur du fix)

- `src/lib/functions.ts`
  - `callFunction<T>()` : `fetch` direct vers `${url}/functions/v1/${name}`
    avec headers `Content-Type`, `apikey`, `Authorization: Bearer <jwt>` ;
    timeout 15 s ; gestion des erreurs (`!res.ok`, corps `{error}`).
  - `callRpc<T>()` : même approche vers `/rest/v1/rpc/<name>`.
  - `getApiToken()` : jeton JWT (cache → sinon relecture de session),
    exposé pour l'appel REST direct (`fetchProfileOrg`).
- `src/services/auth.ts`
  - Cache module `_cachedAccessToken` + `getAccessToken()` avec décodage JWT :
    le cache est invalidé si le TTL restant est ≤ 300 s.
  - Le cache est rempli dans le succès de la connexion **démo**
    (`getSession` → env `EXPO_PUBLIC_DEMO_PASSWORD`) et du
    `signInWithPassword` réel.
- `src/repositories/sessionRepository.ts`
  - `requestDemoWifiSession` : `getApiToken()` → `decodeSub()` →
    `fetchProfileOrg()` (REST `select` sur `profiles`) → RPC raw
    `request_demo_wifi_session`.
  - `simulateDemoConsumption` et `resetDemoQuota` : `callRpc`.
  - Nettoyage : import `getConfig` ajouté, `FUNCTION_BASE` fictif retiré,
    destructuring d'union corrigée via `res.ok`/`res.data`,
    logs `DBG` temporaires supprimés, `logger.warn` remis à 3 arguments.

### 2.2 Divers

- `src/app/_layout.tsx` (+ layouts onglets) : ajustements `LogBox.ignoreLogs`
  (non committés, issus des sessions précédentes).
- Aucun changement natif, aucune recompilation.

---

## 3. Fichiers concernés

- `src/lib/functions.ts` — transport raw fetch (`callFunction`, `callRpc`, `getApiToken`)
- `src/services/auth.ts` — cache de jeton + `getAccessToken()`
- `src/repositories/sessionRepository.ts` — RPCs démo en raw fetch
- (issus de sessions antérieures, non committés le 14/09) :
  `src/app/(app)/(tabs)/_layout.tsx`, `src/app/(app)/_layout.tsx`,
  `src/app/(public)/_layout.tsx`, `src/app/_layout.tsx`,
  `src/repositories/adRepository.ts`

---

## 4. Vérifications réellement exécutées

- **Typecheck** : `npx tsc --noEmit` → OK (à chaque point de contrôle).
- **Tests unitaires** : `npx jest` sur `src/lib/__tests__/` (sessionControl,
  serverAuth) → verts (cf. sessions précédentes).
- **Chaîne serveur** (via `Invoke-RestMethod` PC) : `token?grant_type=password`
  (publishable `sb_publishable_…`), `quota-status`, `ad-heartbeat`,
  `end-wifi-session`, `request_demo_wifi_session` répondent en **< 1 s**
  (5–10 appels chacun, 500–900 ms).

### 4.1 Parcours complet appareil (valide plusieurs fois)

1. Boot frais du dev client (recette : force-stop puis
   `am start -a android.intent.action.VIEW -d "exp+wifi-zone://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"`).
2. Tap « Regarder la pub et se connecter » → **pub 52 s** →
   `request_demo_wifi_session` → serveur `granted` → UI **« Connecté »**,
   « Wi-Fi gratuit actif », « Se déconnecter », quota 5,00 Go, « Lecture active ».
3. Session serveur **active**, heartbeats reçus
   (ex. session `08af806f-…`, `last_heartbeat` 10:19:43 UTC, exp +25 s).
4. Constat paradoxal : le **natif reste `BLOCKED gen=1 ttlLeftMs=0`**
   (logcat `VpnBlocker`) même « Connecté » ; l'UI et les heartbeats
   fonctionnent indépendamment. (`setAuthorized` ne paraît pas franchir la
   couche native, ou est révoqué au premier TTL — **non bloquant pour le flux**,
   à rejouer lors de l'adaptation réseau.)

### 4.2 Limitation encore présente

- **`quota-status` parfois en timeout sur l'appareil** (retour des
  `WARN [sessions] quota-status échoué / Délai dépassé` par intermittence,
  p. ex. 10:21 le 14/09), alors que les autres fonctions passent et que le PC
  n'a aucune lenteur. **Correctif appliqué au commit `f0f1087`** : un fetch
  échoué (`{}`) ne compte plus vers le seuil `NETWORK_LOST` (3) ; seule une
  réponse serveur explicite sans session/allocation compte. Conséquence :
  la session n'est plus coupée en `NETWORK_LOST` sur de simples timeouts de
  pool HTTP — l'aléa reste présent, mais il n'est plus coupant.
- Régression possible du pooling HTTP/OkHttp (`suppression de connexion`) ou
  aléas de la passerelle sur ce seul endpoint (cause racine non élucidée).
- **`register-device` 500 `device_failed`** : bug RLS déployé — la policy
  `devices_self_update` en production ne correspond pas à la migration
  `0003_rls_and_security.sql` (UPSERT → 21000). **Cosmétique** (fire-and-forget),
  visible comme toast LogBox au démarrage.

---

## 5. Éléments non vérifiés (reste à faire)

- Scénarios non rejoués dans la version corrigée (liste des scénarios
  d'origine de la recette) :
  1. double appui rapide sur « Regarder la pub » → une seule session ;
  2. heartbeat maintenu sur > 60 s (« Connecté » durable) — partiel :
     vu « Connecté » à ~10:20, mais coupure d'essai interrompue ;
  3. bascule arrière-plan / retour → reprise de session ;
  4. force-stop + relance pendant session active → revalidation ;
  5. perte réseau ~30 s → `NETWORK_LOST`, puis récupération ;
  6. quota épuisé via `demo_reset_quota` + `demo_consume_quota`.
- Résolution du `quota-status` intermittent appareil (cf. §4.2) — politique
  corrigée (commit `f0f1087`), cause racine pooling encore à confirmer.
- Fix serveur de la policy RLS `devices_self_update`.
- Masquage du toast LogBox `register-device` 500 au démarrage.

---

## 6. Blocages

- **Aucun blocage fonctionnel** sur le parcours principal pub→connexion.
- Le timeout `quota-status` appareil est le dernier aléa « réseau » connu
  (il peut couper une session en `NETWORK_LOST` après 3 échecs).

### Disposition de test à connaître avant toute reprise

- **Ne pas éditer le code pendant un run live** : un Fast Refresh re-monte
  `ConnectionContext` et rappelle `vpnBlocker.blockNow()` au montage
  (ligne 431), ce qui tue la session native (gen=1) et laisse l'UI figée en
  `authorizing_wifi`.
- Voir `docs/CONSIGNES_PROJET.md` pour recette de lancement, comptes démo,
  jetons et règles de travail.

---

## 7. Recompilation native nécessaire ?

**Non.** Aucun changement natif n'a été requis ; le dev client (APK existant)
raccordé à Metro suffit pour cette itération. L'adaptation MikroTik se fait en
JS pur : l'app n'écrit **aucun** identifiant routeur (tout passe par l'agent).

---

## 8. MikroTik — travaux effectués (14/09)

### 8.1 Abstraction fournisseur réseau (réel vs simulation)

- `src/network/NetworkAccessAdapter.ts` : `NetworkProviderKind = "live" |
  "simulated" | "unconfigured"` + `providerKind` sur l'interface.
- `MikrotikNetworkAdapter` / `RadiusNetworkAdapter` → `"live"` ;
  `AndroidVpnDemoAdapter` / `DevelopmentNetworkAdapter` → `"simulated"` ;
  `UnconfiguredAdapter` → `"unconfigured"`. Export `MikrotikHealthDetail` +
  `NetworkProviderKind` dans `src/network/index.ts`.

### 8.2 Adaptateur MikroTik RÉEL (plus de stubs legacy)

`MikrotikNetworkAdapter` réécrit sur la vraie chaîne serveur :
- `authorizeSession` = `requestWifiSession` → `waitForMikrotikAuthorization`
  (helper pur, timeout 15 s) → référence = `session_id` serveur ;
- `getSessionUsage` = `fetchQuotaStatus` (compteurs serveur, jamais local) ;
- `disconnectSession` = `endWifiSession(ref, "USER_PAUSED_AD")` ;
- `healthCheckDetail()` expose `agentsOnline / routers / routerOnline /
  simulated`.
- Les stubs `network-mikrotik-authorize` / `network-mikrotik-disconnect`
  (UNREACHABLE) ne sont plus appelés (découplés).

### 8.3 Helper pur + wiring UI

- `src/lib/mikrotikAuth.ts` : `waitForMikrotikAuthorization`
  (fetchStatus/delay/isCancelled/getSignal/onPoll injectables ; verdicts
  `active` / `quota_exhausted` / `closed` / timeout / interruption).
- `src/contexts/ConnectionContext.tsx` : le `waitForAuthorization` privé est
  devenu un wrapper du helper (comportement équivalent) ; `networkProviderKind`
  exposé dans le contexte ; `delay()` inutile supprimée.
  Rappel : la politique `NETWORK_LOST` corrigée au commit `f0f1087` reste.
- `src/components/ConnectionStatusCard.tsx` + `dashboard/index.tsx` : badge
  « Accès réseau réel (MikroTik) » vs « Simulation locale (mode démo) » ; le
  hack `networkHealth="READY"` en mode démo retiré.

### 8.4 Outillage pour le test du lendemain (sans routeur)

- `docs/MIKROTIK_MISE_EN_TEST.md` : prérequis RouterOS (SSID isolé, IPv6 coupé
  sur le SSID de test, liste `wz-active`), secrets serveur
  (`NETWORK_ADAPTER_TYPE`, `MIKROTIK_HOST`, `NETWORK_HMAC_SECRET`,
  `MIKROTIK_MOCK`), enrôlement agent (`agent/register.mjs` + INSERT
  `local_agents` avec sha256), procédure de test, rollback, limites.
- `scripts/e2e-mikrotik-chain.mjs` : E2E contre le vrai serveur avec
  `AgentEngine` + `MockRouter` (JWT démo → `request-wifi-session` → commande
  signée → agent → `active` → compteurs → `end-wifi-session`). Syntaxe
  `node --check` OK.
- `.env.example` : `EXPO_PUBLIC_NETWORK_MODE` documenté
  (`android_vpn_demo` | `mikrotik`), avec rappel « aucun identifiant routeur
  stocké dans l'app ».

### 8.5 Tests (verts à la clôture de cette séance)

- `src/network/__tests__/MikrotikNetworkAdapter.test.ts` : **11/11**.
- `src/lib/__tests__/mikrotikAuth.test.ts` : **6/6**.
- Suite complète `npx jest` : **148/148**, 19 suites.
- Agent (`node --test agent/test/*.mjs`) : **17 pass / 0 fail**.
- `npx tsc --noEmit` : **OK**.

---

## 9. MikroTik — reste à faire / à rejouer

**Côté code (à faire, sans équipement) :**

1. **`agent-reconcile`** : restaurer les sessions actives après reboot routeur
   (re-enqueue signé `authorize` si heartbeat frais ; coupe `NETWORK_LOST`
   seulement si heartbeat périmé). Non commencé.
2. **`network-health`** : vérifier la shape `agents/routers/routerOnline/
   simulated` (fallbacks déjà en place dans `healthCheckDetail`, à confirmer
   contre le vrai endpoint) et exposer `simulated` via `MIKROTIK_MOCK`.

**Côté exploitation (demain, J1 — nécessite l'utilisateur / le routeur) :**

3. **Secrets serveur** (`supabase secrets set`, CLI `2.115.0`) :
   `NETWORK_ADAPTER_TYPE=mikrotik`, `MIKROTIK_HOST`, `NETWORK_HMAC_SECRET`,
   `WIFI_LIST_NAME=wz-active`, `MIKROTIK_MOCK=1`.
4. **Enrôlement agent** : `node agent/register.mjs "<token>"` → INSERT
   `local_agents` (org/site démo) + `agent/.env`
   (`AGENT_TOKEN`, `SUPABASE_URL`, `NETWORK_HMAC_SECRET`, creds RouterOS).
5. **Routeur** : SSID de test isolé, IPv6 désactivé sur ce SSID, placeholder
   `address-list wz-active`.
6. **E2E simulé puis réel** : `scripts/e2e-mikrotik-chain.mjs` (`EXEC_AGENT=1`)
   après pose des secrets ; puis flux réel sur le téléphone avec
   `EXPO_PUBLIC_NETWORK_MODE=mikrotik` (redémarrage Metro, pas de rebuild).

**Baseline à préserver : tous les scénarios de la recette (pubs, quota,
déconnexion) passaient (§4.1) — à rejouer sur le socle après ces changements.

---

## 10. Prochaines étapes (à valider avec l'utilisateur)

1. **J1 test MikroTik** : configurer le routeur (SSID isolé, IPv6 coupé),
   poser les secrets serveur, enrôler l'agent, lancer `e2e-mikrotik-chain.mjs`
   en simulé puis le flux réel sur le téléphone.
2. **`agent-reconcile`** : restauration des sessions actives après reboot
   routeur (cf. §9).
3. Ajuster `network-health` (shape `simulated` via `MIKROTIK_MOCK`).
4. Rejouer la recette complète pubs/quota/déconnexion sur le socle MikroTik
   et vérifier l'état natif `setAuthorized`/`gen` (artefact `BLOCKED
   gen=1 ttlLeftMs=0` de §4.1).
5. Déployer le fix RLS `devices_self_update` (aligner la policy production
   sur la migration 0003).