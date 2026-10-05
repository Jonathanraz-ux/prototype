# PROMPT — Suite des travaux MikroTik (Bôjô / WiFi Zone)

> Copier-coller ce prompt dans une nouvelle session pour reprendre
> exactement où nous en étions le 14/09/2026.
> Lire d'abord `docs/ETAT_PROJET.md` et `docs/MIKROTIK_MISE_EN_TEST.md`.

---

## Contexte (à reprendre)

Nous travaillons sur **Bôjô (WiFi Zone)**, app Expo/React Native (dev client)
+ Supabase (TypeScript, Edge Functions Deno) + agent local Node (RouterOS ou
MockRouter). Toute la préparation de l'intégration MikroTik a été faite LE 14/09
et tout est vert (jest 148/148, agent 17/17, tsc OK) :

- Fournisseur réseau séparé réel/simulation via `NetworkProviderKind`
  (`live` / `simulated` / `unconfigured`) ;
- `MikrotikNetworkAdapter` branché sur la vraie chaîne serveur
  (`request-wifi-session` → commande signée HMAC → agent → `active` → compteurs) ;
- helper pur `src/lib/mikrotikAuth.ts` (`waitForMikrotikAuthorization`) ;
- badge UI « Accès réseau réel (MikroTik) » vs « Simulation locale », avec une
  sémantique **fail closed** : `simulated: true` par défaut, `false` seulement
  sur `MIKROTIK_REAL=1` posé explicitement par l'opérateur (voir §2 item 2) ;
- `docs/MIKROTIK_MISE_EN_TEST.md` + `scripts/e2e-mikrotik-chain.mjs` (sans routeur).

Le téléphone Android (`LZ0A35TZDD1018669`) et le routeur MikroTik sont
disponibles pour la suite. L'intégration matérielle RouterOS est **NON
VALIDÉE** : tout ce qui se fait sans routeur doit être simulé (MockRouter) et
l'état marqué comme non validé.

**Règles de travail** :
- Ne jamais éditer le code pendant un run live sur le téléphone (un Fast
  Refresh re-monte `ConnectionContext` et rappelle `vpnBlocker.blockNow()`
  → session native tuée).
- Committer uniquement sur demande explicite de l'utilisateur.
- Ne pas toucher au réseau principal du client (SSID de test isolé uniquement).
- Aucun identifiant routeur dans l'app (tout passe par l'agent local).

---

## Périmètre

### A. Code (sans équipement)

1. **`agent-reconcile` (edge function)** — restauration après reboot routeur :
   - Lire `supabase/functions/agent-reconcile/index.ts` et la migration qui
     gère `network_commands` (unique pending par session/type).
   - Comportement à implémenter : une session serveur `active`/`authorized`
     dont la ligne `router_session_reference` existe mais dont l'entrée du
     routeur a disparu (reboot → `address-list` vidée) doit être :
     - **restaurée** (re-enqueue d'une commande `authorize` signée HMAC) si le
       heartbeat est frais (`heartbeat_expires_at > now()`),
     - **coupée** (`end_network_session(... 'NETWORK_LOST')`) seulement si le
       heartbeat est périmé.
   - Ne pas créer de doublons de commandes pending ; garder la cohérence avec
     `agent-command-fetch` (retour d'un seul `authorize` par session).
   - Tester via un run local / MockRouter (pas de routeur).

2. **`network-health` (edge function)** — shape de réponse :
   - Vérifier que la réponse contient `configured`, `adapterType`, `health`,
     `agentOnline`, `routerOnline`, `agents`, `routers`, `simulated`.
   - `simulated` suit une sémantique **fail closed**, et NON la simple
     présence de `MIKROTIK_MOCK` : le serveur ne voit pas l'argument `--mock`
     de l'agent, donc `simulated` ne vaut `false` que si l'opérateur a posé
     `MIKROTIK_REAL=1` (matériel confirmé). Voir `_shared/network-config.ts`
     et §2.1.1 de `docs/MIKROTIK_MISE_EN_TEST.md`.
   - Côté client, un champ `simulated` **absent** est traité comme non
     confirmé (`agentSimulated: true`) — ne pas revenir à un défaut « réel ».
   - Vérifier le contrat avec `healthCheckDetail()` de
     `src/network/MikrotikNetworkAdapter.ts` (fallbacks déjà en place).

3. **Rangs de striction** : relire la politique `NETWORK_LOST` dans
   `src/contexts/ConnectionContext.tsx` (commit `f0f1087`) et confirmer qu'un
   fetch échoué (`{}`) ne coupe jamais une session saine ; ajouter un test
   dédié si absent.

### B. Exploitation (jour de test)

4. **Secrets serveur** (CLI Supabase 2.115.0, projet
   `hwwivzsdepzdgonfbkxq`) :
   ```
   supabase secrets set \
     NETWORK_ADAPTER_TYPE=mikrotik \
     MIKROTIK_HOST=<IP_LAN_ROUTEUR> \
     NETWORK_HMAC_SECRET=<secret-minimum-32-caracteres> \
     WIFI_LIST_NAME=wz-active \
     MIKROTIK_REAL=1 \
     --project-ref hwwivzsdepzdgonfbkxq
   ```
   Générer le HMAC via
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   NE JAMAIS committer ni afficher ce secret.

   > `MIKROTIK_REAL=1` correspond au **test avec le routeur branché**. Pour une
   > recette sans matériel, mettre `MIKROTIK_MOCK=1` à la place. Ne jamais poser
   > `MIKROTIK_REAL=1` sans routeur : l'app afficherait alors un accès « réel »
   > inexistant. Omitting le drapeau n'est pas dangereux (l'app affiche
   > « simulé »), ce qui est la propriété recherchée. Voir §2.1.1 de
   > `docs/MIKROTIK_MISE_EN_TEST.md`.

5. **Enrôlement agent** :
   - `node agent/register.mjs "<AGENT_TOKEN>"` → affiche le sha256hex ;
   - INSERT dans `public.local_agents` (org démo
     `d0209598-37ac-4e13-a016-bb38a62c381d`, site démo
     `d9fe1d87-b4a8-4b92-8ebc-d213b2929e8d`) ;
   - écrire `agent/.env` (voir §2.3 de `docs/MIKROTIK_MISE_EN_TEST.md`).

6. **Routeur** : SSID de test isolé (ex. `BojoTest`), IPv6 désactivé sur ce
   SSID, placeholder `address-list wz-active`.

7. **E2E** : `NETWORK_HMAC_SECRET=<...> AGENT_TOKEN=<...> EXEC_AGENT=1 node
   scripts/e2e-mikrotik-chain.mjs` → toutes les étapes ✅ (sinon corriger les
   sinon corriger les edge functions / secrets avant de toucher quoi que ce soit).

8. **App** : dans `.env` → `EXPO_PUBLIC_NETWORK_MODE=mikrotik` ; redémarrer
   Metro (pas de rebuild natif) ; recharger le JS sur le téléphone ; valider
   la santé réseau affichée (READY quand agent en ligne + routeur connu).

### C. Recette complète à rejouer (téléphone)

9. Flux pub → session → « Connecté » (quota 5 Go, compteurs serveur).
10. Heartbeat > 60 s (session reste active).
11. Bascule arrière-plan / retour → reprise.
12. Déconnexion → commande `disconnect` posée par l'agent, `wz-active` nettoyée.
13. Quota épuisé (`demo_reset_quota` + `demo_consume_quota`) → « Quota épuisé ».
14. Reboot du routeur pendant une session active → restauration par
    `agent-reconcile` (ou constat documenté si non implémenté).
15. Vérifier `wifi_sessions.device_observed_ip/mac` (binding) et l'état natif
    `VpnBlocker` (`setAuthorized`/`gen`/`ttl`).

### D. Déminage

16. ~~Fix serveur de la policy RLS `devices_self_update`~~ **FAIT** : la
    migration `0016_devices_rls_upsert_safe.sql` remplace la policy récursive
    par une version sans sous-requête + déclencheur de garde `status`, et
    `register-device` écrit via `service_role`. **NON APPLIQUÉE** à la base :
    à pousser avant le test téléphone.
17. **Drapeau d'honnêteté désynchronisé** (`--mock` agent vs
    `MIKROTIK_REAL` serveur) : le mode fail closed évite d'affirmer un routeur
    inexistant, mais ne prouve rien. Correctif de fond = faire remonter le mode
    dans le heartbeat (`local_agents` + `record_agent_heartbeat`), migration
    0017. Non fait.
18. Diagnostiquer le timeout intermittent appareil `quota-status`
    (cause racine pool HTTP/OkHttp, cf. `docs/ETAT_PROJET.md` §4.2).

---

## Livrables attendus

- `ETAT_PROJET.md` mis à jour (ce qui a été fait + ce qui reste) à chaque fin
  de séance ;
- chaque changement accompagné des tests + typecheck (`npx jest`,
  `node --test agent/test/*.mjs`, `npx tsc --noEmit`) ;
- tout comportement non validé par du matériel réel est explicitement marqué
  « NON VALIDÉ » ;
- commit uniquement sur demande.