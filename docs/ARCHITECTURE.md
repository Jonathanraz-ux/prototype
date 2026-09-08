# Architecture — WiFi Zone

Ce document décrit l'architecture globale du prototype, l'orientation du trafic,
et le rôle exact de chaque brique. Il est la référence pour comprendre « qui
décide quoi ».

---

## 1. Vue d'ensemble

```
┌────────────────────┐        ┌─────────────────────────────┐
│ Application Expo   │        │ Supabase (hwwivzsdepzdgonfbkxq)
│ (client mobile)    │        │  - Database (Postgres + RLS)│
│ supabase-js        │        │  - Auth (comptes utilisateurs)
└─────────┬──────────┘        │  - Edge Functions (Deno)    │
          │ HTTPS / REST      └──────────────┬──────────────┘
          │                                  │
          │   Supabase Auth +                    │
          │   Edge Functions (via supabase-js)   │  HTTPS / REST
          ▼                                  ▼
┌──────────────────────────────┐   ┌──────────────────────┐
│ Agent local (Node.js)        │   │ MikroTik (RouterOS 7)│
│  - fetch des commandes       │──▶│  - address-lists      │
│  - exécution RouterOS        │   │  - compteurs de trafic│
│  - retour des résultats      │◀──│  - walled garden      │
│  - collect du trafic         │   └──────────────────────┘
└──────────────────────────────┘
```

Le **client mobile ne communique jamais directement avec le MikroTik**. Tout le
réseau passe par le serveur (Supabase) puis par l'agent local, qui est la seule
brique qui touche l'équipement réel.

---

## 2. Briques et responsabilités

### 2.1 Client mobile (Expo, dossier `src/`)

- **État de connexion** : `src/services/connectionMachine.ts` définit une machine
  à états explicite (idle → ad_loading → ad_active → authorizing_wifi →
  wifi_active → paused / disconnecting / quota_exhausted / error).
- **Orchestration** : `src/contexts/ConnectionContext.tsx` pilote la machine,
  les appels Supabase, les heartbeats et le rafraîchissement du quota.
- **Adapters réseau** : `src/network/` contient `MikrotikNetworkAdapter` /
  `DevelopmentNetworkAdapter`. Le mode (mock/mikrotik) est **décidé côté serveur**
  via `NETWORK_ADAPTER_TYPE` ; le client n'embarque **jamais** ce choix.
- **Types alignés** : `src/types/index.ts` reflète les mots-clés de la base
  (`session-machine.ts` côté serveur) pour garantir la cohérence des statuts.

### 2.2 Base de données (Supabase, dossier `supabase/migrations/`)

Migrations `0001` → `0008`. La `0008` pose le modèle de réseau :

- `allocations` : quota persistant de l'utilisateur (`total_bytes` = 5 Go,
  `consumed_bytes`, `remaining_bytes`).
- `wifi_sessions` : sessions avec `status` (`authorized`/`active`/`paused`/
  `disconnected`...) et `router_session_reference` (résultat RouterOS réel).
- `network_events` : journal des événements réseau.
- `local_agents` : registre des agents locaux (avec `token_hash` sha256).
- `network_commands` : file de commandes consommées par l'agent.
- Fonctions RPC : `ensure_test_allocation`, `get_quota_status`,
  `begin_network_session`, `ad_heartbeat_tick`, `apply_data_usage`,
  `end_network_session`, `expire_stale_network_sessions`,
  `enqueue_network_command`, `record_agent_heartbeat`, `register_local_agent`,
  `admin_reset_allocation`, `admin_overview_json`.

**Règle quota** : `consumed_bytes` est **monotone** et persistant (jamais remis
à zéro à la reconnexion). `remaining_bytes` n'est jamais négatif. Le calcul se
fait toujours côté serveur, jamais côté client.

### 2.3 Edge Functions (Deno, dossier `supabase/functions/`)

Logique métier exécutée côté serveur, derrière la RLS / service role :

- `request-wifi-session` : point d'entrée de connexion payante (publicité).
- `quota-status` : état du quota et de la session en cours.
- `ad-heartbeat` : battement de cœur tant que la publicité est active.
- `end-wifi-session` : déconnexion explicite (raisons : `USER_PAUSED_AD`,
  `APP_BACKGROUND`, `USER_LOGOUT`, etc.).
- `agent-command-fetch` / `agent-command-result` : file de commandes consommée
  par l'agent (autorisation, déconnexion).
- `agent-collect` : l'agent remonte les compteurs RouterOS → `apply_data_usage`.
- `agent-ping` / `agent-expire` / `agent-reconcile` : supervision des agents et
  expiration des sessions.
- `network-health` : état de l'agent / adapter (READY / UNREACHABLE / ...).
- `admin-overview` / `admin-reset-allocation` : supervision et remise à zéro
  administrative.
- Extensions réseau `network-*` (`network-mikrotik-*`, `network-radius-*`) :
  implémentations réseau **à implémenter demain** — elles servent de contrat
  d'interface ; le routage réel passe par l'agent local.

Le dossier `_shared/` contient les modules réutilisés et testés :
`session-machine.ts`, `quota.ts`, `network-commands.ts`, `agents.ts`,
`supabase.ts`, `http.ts`.

### 2.4 Agent local (Node.js, dossier `agent/`)

Seule brique qui touche l'équipement réel :

- `main.mjs` : point d'entrée ; démarre les boucles.
- `config.mjs` : lecture de `agent/.env`.
- `register.mjs` : enregistre l'agent auprès de Supabase (token → `token_hash`).
- `engine.mjs` : boucle principale (fetch des commandes, exécution, collect).
- `http.mjs` : clients HTTP (Supabase + RouterOS API).
- `lib/routeros-rest.mjs` / `lib/mock-router.mjs` : adaptateurs d'équipement.
- `lib/signatures.mjs` : signature HMAC des commandes.
- `start.ps1` : lanceur Windows.

**Mode** : `NETWORK_ADAPTER_TYPE` (mock / mikrotik) — lu uniquement dans
`agent/.env`, jamais embarqué dans l'APK.

---

## 3. Flux du scénario payant publicitaire

1. L'utilisateur **coupe** son accès (déconnecté, `idle`).
2. Il lance la connexion → l'app charge une publicité (`ad_loading`).
3. La publicité est visionnée (`ad_active`).
4. `AD_WATCHED` → `authorizing_wifi` ; l'app appelle `request-wifi-session`.
5. Le serveur crée/relance la session (statut `authorized`) et met une commande
   `WIFI_AUTHORIZE` dans `network_commands`.
6. **L'agent**, qui consulte `agent-command-fetch`, exécute l'autorisation sur le
   MikroTik (ajout à `wz-active`) et renvoie `router_session_reference` via
   `agent-command-result`.
7. Le client, qui interroge `quota-status`, voit `router_session_reference`
   présent → passe à **`wifi_active`** (la coupe est levée).
8. L'agent `agent-collect` lit les compteurs → `apply_data_usage` décrémente le
   quota (serveur).
9. Le client continue ses heartbeats pendant que la publicité reste active.
10. Quota épuisé ou déconnexion → le serveur enqueue une commande
    `WIFI_DISCONNECT`, l'agent retire l'adresse de `wz-active` → coupure réelle.

---

## 4. Règles non négociables

- Le mode réseau (mock/mikrotik) est déterminé **uniquement** côté
  serveur/agent (`NETWORK_ADAPTER_TYPE`) ; jamais dans l'APK.
- `wifi_active` n'apparaît **qu'après** confirmation réelle de l'agent et du
  routeur (`router_session_reference` présent).
- Le trafic mesuré provient **des compteurs RouterOS** relevés par l'agent ;
  l'app ne déclare jamais sa propre consommation.
- `consumed_bytes` est persistant et monotone ; `remaining_bytes` jamais négatif.
- Aucun secret réel dans Git, le frontend ou l'APK. Aucun fallback silencieux
  vers le mode mock en production.
