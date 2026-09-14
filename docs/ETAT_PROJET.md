# Bôjô — État du projet (14 sept. 2026)

> Document d'état de référence à jour au **14/09/2026**.
> À relire avant toute reprise (adaptation MikroTik, prochaine étape).

---

## 1. Objectif de cette itération

Réparer le flux **pub → session → connexion** sur l'appareil Android de test
(`LZ0A35TZDD1018669`, `com.wifizone.app`) **sans recompilation native** :
corrections JS uniquement, livrées via Metro (dev client).

Le transport Supabase a été réécrit en **fetch direct** (Edge Functions + REST)
parce que `supabase-js` ne fournissait par défaut ni le JWT `Authorization` ni
l'`apikey` nécessaires → la passerelle répondait `unauthorized`.
De plus, la disparition d'une `edge_call` commitée en 08.5* a cassé
`functions.database` de `supabase-js` (`supabase.functions.invoke` échouait).

---

## 2. Changements effectués

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
  n'a aucune lenteur. Conséquence : après **3 échecs consécutifs**,
  `noteControlFailure` ≥ `CONTROL_FAILURE_THRESHOLD` (3) coupe la session en
  **`NETWORK_LOST`** → « Liaison réseau perdue » (le bug originel, donc :
  fiabilisé mais pas éliminé).
- Régression possible du pooling HTTP/OkHttp (`suppression de connexion`) ou
  aléas de la passerelle sur ce seul endpoint.
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
- Résolution du `quota-status` intermittent appareil (cf. §4.2).
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
raccordé à Metro suffit pour cette itération.

---

## 8. Prochainnes étapes (à valider avec l'utilisateur)

1. **Adaptation MikroTik** : remplacer/superposer le VPN/TUN démo par le
   portail captif MikroTik (ou décider du maintien du tunnel). La couche
   `vpnBlocker` est le seul point à brancher (interface `setAuthorized`/`gen`/
   `ttl` + exclusions). Les états démo `ALLOWED`/`BLOCKED` seront à rejouer.
2. **Consolidation pendant les tests réseau** : régler la politique de
   `quota-status` pour ne pas couper une session saine sur des timeouts de
   gestion (ex. retry court avec nouvelle connexion, ou compteur limité aux
   réponses réellement invalides, hors timeout).
3. Terminer la recette de scénarios (§5) sur le socle actuel avant MikroTik.
4. Déployer le fix RLS `devices_self_update` (aligner la policy production
   sur la migration 0003).