# MikroTik — Préparation du test (mercredi)

> ⚠ **Document de préparation, dépassé sur deux points.** Pour le jour J,
> préférer **[`MIKROTIK_MISE_EN_SERVICE.md`](MIKROTIK_MISE_EN_SERVICE.md)**,
> qui fait autorité (préflight, dépannage, retrait de file garanti).
> Les corrections appoortées ici sont listées en fin de document.

> **État** : le code est écrit et testé. L'intégration matérielle
> (routeur MikroTik physique) est **NON VALIDÉE** — le test physique
> est prévu mercredi. Tous les scénarios ont été validés via mock agent
> (MockRouter) sans équipement réel.

---

## 1. Architecture (récapitulatif)

```
┌─────────────────┐
│  App Bôjô       │  EXPO_PUBLIC_NETWORK_MODE=mikrotik
│  (téléphone)    │  ── request_wifi_session ──▶  Edge Function
└─────────────────┘                                    │
                                                       ▼
                                                  SQL: begin_network_session
                                                  enqueue_network_command(authorize)
                                                       │
                                                       ▼
┌──────────────────┐     ┌──────────────────────┐
│ Agent local      │ ◀── │ agent-command-fetch   │
│ (PC / Raspberry) │     │ (signature HMAC)      │
└──────────────────┘     └──────────────────────┘
      │
      ▼
 RouterOS API/REST
 ├── /ip/firewall/address-list → add "wz:<session_id_8chars>"
 └── /queue/simple → compteurs → agent-collect → apply_data_usage SQL
```

**Règles absolues :**
- L'app ne contient **JAMAIS** d'identifiant MikroTik.
- Tout passe par l'agent → Edge Functions signées HMAC.
- Le binding compte/appareil/session est vérifié via JWT + SQL (jamais IP/MAC déclarée seule).
- La session est active quand `router_session_reference` est renseigné sur la ligne `wifi_sessions`.

---

## 2. Configuration serveur (secrets Supabase)

### 2.1 Activer l'adaptateur MikroTik

```bash
supabase secrets set \
  NETWORK_ADAPTER_TYPE=mikrotik \
  MIKROTIK_HOST=<IP_LAN_DU_ROUTEUR> \
  NETWORK_HMAC_SECRET=<secret-minimum-32-caracteres> \
  WIFI_LIST_NAME=wz-active \
  MIKROTIK_REAL=1 \
  --project-ref hwwivzsdepzdgonfbkxq
```

> `MIKROTIK_HOST` : pour le test du premier jour, mettre l'IP LAN du routeur
> (ex. `192.168.88.254`). Si le routeur n'est pas encore là, la valeur est
> acceptée — le health passera NOT_CONFIGURED tant qu'aucun agent n'est en ligne.

> `NETWORK_HMAC_SECRET` : **jamais le même que le JWT management**. Générer :
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

#### 2.1.1 `MIKROTIK_REAL` / `MIKROTIK_MOCK` — l'étape la plus sensible

L'agent choisit son pilote avec l'argument CLI `--mock` (voir §3). La fonction
serveur **ne voit pas cet argument** : elle ne peut savoir seule si du matériel
existe. Le serveur est donc **fail closed** : sans confirmation explicite, il
signale `simulated: true` et l'UI affiche « routeur simulé » (les compteurs
sont masqués). Le libellé « Accès réseau réel (MikroTik) » n'apparaît que si
`MIKROTIK_REAL=1` est posé.

| Situation | Drapeau serveur | Effet |
| --- | --- | --- |
| Routeur branché (test J1) | `MIKROTIK_REAL=1` | « Accès réseau réel », compteurs visibles |
| Pas de routeur (recette simulée) | `MIKROTIK_MOCK=1` | « routeur simulé », compteurs masqués |
| Ni l'un ni l'autre | — | « routeur simulé » (prudent) |
| Les deux | `MIKROTIK_MOCK=1` gagne | « routeur simulé » |

Valeurs acceptées : `1`, `true`, `yes`, `on` (casse et espaces ignorés).

> ⚠️ **Poser `MIKROTIK_REAL=1` alors qu'aucun routeur n'est branché fait
> afficher un accès « réel » qui n'existe pas.** C'est précisément l'erreur
> que ce mode fail closed cherche à empêcher. Inversement, oubli de
> `MIKROTIK_REAL=1` avec un vrai routeur branché n'est pas grave : l'app
> affiche « simulé » et les tests passent au vert, ce qui force à vérifier.

> Passer d'un mode à l'autre = `supabase secrets set` puis redéploiement de
> `network-health`. Ne pas changer le drapeau en cours de test sans le dire.

### 2.2 Enrôler un agent de test

```bash
# 1. Générer un token
AGENT_TOKEN="bojo-agent-test-$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"
echo "AGENT_TOKEN = $AGENT_TOKEN"

# 2. Calculer le hash SHA-256 (agent register.mjs)
node agent/register.mjs "$AGENT_TOKEN"
# → affiche le sha256hex à insérer en base

# 3. Insérer dans Supabase (éditeur SQL ou SQL direct)
INSERT INTO public.local_agents (organization_id, site_id, name, token_hash)
VALUES (
  '<ORGANIZATION_ID>',   -- org de l'utilisateur démo
  '<SITE_ID>',           -- site de test
  'agent-test-mercredi',
  '<sha256hex>'
);
```

> **Organization / Site de test** :
> - org : `d0209598-37ac-4e13-a016-bb38a62c381d` (org démo)
> - site : `d9fe1d87-b4a8-4b92-8ebc-d213b2929e8d` (site démo)

### 2.3 Configuration agent (`.env`)

```bash
# agent/.env
AGENT_TOKEN=$AGENT_TOKEN                    # même valeur que l'INSERT ci-dessus
SUPABASE_URL=https://hwwivzsdepzdgonfbkxq.supabase.co
NETWORK_HMAC_SECRET=<même valeur que le serveur>
NETWORK_ADAPTER_TYPE=mikrotik
MIKROTIK_PROTOCOL=rest
MIKROTIK_HOST=<IP_LAN_DU_ROUTEUR>
MIKROTIK_USERNAME=admin
MIKROTIK_PASSWORD=<mot_de_passe_routeur>
WIFI_LIST_NAME=wz-active
AGENT_FETCH_INTERVAL_MS=5000
AGENT_PING_INTERVAL_MS=30000
AGENT_COLLECT_INTERVAL_MS=10000
AGENT_EXPIRE_INTERVAL_MS=30000
AGENT_MOCK_BYTES_PER_SEC=120000
```

> ⚠️ **Les deux côtés doivent être d'accord.** Le pilote de l'agent est choisi
> par l'argument CLI `--mock` au lancement (`node main.mjs --mock`, ou
> `.\agent\start.ps1 -Mock`) ; l'étiquette affichée par l'app, elle, vient du
> secret serveur (§2.1.1). Ce sont deux processus distincts : le serveur ne
> détecte pas `--mock`. Si l'agent tourne en simulation, le serveur doit donc
> porter `MIKROTIK_MOCK=1` — sinon l'app affiche « Accès réseau réel » pendant
> que le trafic est simulé, ce qu'aucun test automatisé ne peut détecter.
>
> Checklist de cohérence avant de lancer un test :
> - agent **avec** `--mock` ⇒ serveur `MIKROTIK_MOCK=1` (ou rien) ;
> - agent **sans** `--mock`, routeur joignable ⇒ serveur `MIKROTIK_REAL=1`.

---

## 3. Routeur MikroTik — Prérequis de test

### 3.1 SSID de test isolé

- Créer un SSID dédié (ex. `BojoTest`) sur le routeur.
- **Désactiver IPv6** sur ce SSID (écrans → interfaces → wireless → IPv6 → disabled) OU ajouter une règle firewall :
  ```
  /ip/firewall/filter/add chain=forward src-address=!<IP_AGENT> protocol=icmpv6 action=drop place-before=0
  ```
  IPv6 pourrait contourner la liste d'adresses `wz-active` qui ne gère que l'IPv4.

### 3.2 Liste d'adresses pour le contrôle

Utiliser le script `docs/routeros/bojo-setup.rsc`, qui pose la liste et les
règles firewall en une fois. L'entrée de réservation servant à faire
exister la liste est `192.0.2.1/32` (TEST-NET-1, RFC 5737 — jamais
attribuable à un client réel) :

```
/ip firewall address-list/add list=wz-active address=192.0.2.1/32 \
    comment="placeholder WiFi Zone (jamais un client reel)" disabled=yes
```

> ⚠ Ne **pas** utiliser `address=0.0.0.0` comme placeholder : c'est
> l'adresse « unspecified », inerte mais susceptible de perturber les
> règles de filtrage.
>
> L'agent créera ensuite automatiquement des entrées `wz:<session_id_8chars>`
> pour chaque session autorisée.

### 3.3 Options de sécurité (si requises)

| Fonctionnalité | Commande RouterOS | Remarque |
|---|---|---|
| Restreindre DNS walled garden | `/ip/dns/static` + masque | À configurer si besoin |
| Limite de débit globale | `/queue/simple` | L'agent gère la création automatique par session |
| Journaux | `/log print` | Utile pour le debug premier jour |

### 3.4 Walled Garden (optionnel, pré-autorisation)

Avant qu'une session ne soit autorisée, seuls les sites essentiels sont accessibles :
- Supabase (`hwwivzsdepzdgonfbkxq.supabase.co`)
- Publicités (campagnes Google AdMob / serveur pub)
- DNS public (1.1.1.1 / 8.8.8.8)

> ⚠ **La commande `walled_garden` n'est PAS implantée dans l'agent.**
> Elle répond aujourd'hui `ok: true` avec `result.implemented: false` :
> l'agent n'écrit aucune règle, car le filtrage dépend entièrement du
> routeur (DNS statique, règles firewall par IP). Ce résultat explicite
> existe pour que ni le serveur ni l'interface ne puissent laisser croire
> qu'un walled garden est actif.
>
> La mise en œuvre se fait sur le routeur (`/ip/dns/static`,
> `/ip/firewall/address-list` en liste blanche), pas via l'agent.

---

## 4. Script E2E (valider la chaîne sans routeur)

`scripts/e2e-mikrotik-chain.mjs` valide contre le vrai serveur :
1. Enregistre un agent mock (MockRouter) avec HMAC.
2. Simule `begin_network_session` via le vrai `request-wifi-session`.
3. Vérifie que `quota-status` passe à `active` avec `router_session_reference`.
4. Vérifie l'incrémentation des compteurs.
5. Teste la déconnexion propre (`end-wifi-session`).

**Prérequis** : secrets serveur configurés (§2.1), agent enregistré (§2.2), accès internet depuis la machine où tourne le script.

```bash
# Lancer le script (depuis la racine du projet)
NETWORK_HMAC_SECRET=<secret> AGENT_TOKEN=<token> \
  node scripts/e2e-mikrotik-chain.mjs
```

Le script affiche OK/FAIL pour chaque étape. En mode **simulé** (`MIKROTIK_MOCK=1` côté serveur), il fonctionne même si le routeur n'est pas encore présent.

> Rappel : le script exerce la chaîne avec un `MockRouter` local, donc il
> valide la **logique** de bout en bout, pas le matériel. Le passage en
> `MIKROTIK_REAL=1` (cf. §2.1.1) ne change rien à ce résultat : seul un vrai
> routeur atteint par l'agent peut valider les compteurs.

---

## 5. Lancement de l'app

```bash
# 1. Changer le mode réseau dans .env
# .env :
EXPO_PUBLIC_NETWORK_MODE=mikrotik

# 2. Redémarrer Metro (pas de rebuild natif)
npx expo start --dev-client

# 3. Sur le téléphone : forcer le rechargement JS (shake → reload, ou Ctrl+M → reload)
```

> En mode `mikrotik`, l'app n'affiche **pas** le bouton VPN démo.
> La santé réseau affichée sur le dashboard reflète :
> - `READY` : agent en ligne + routeur connu
> - `UNREACHABLE` : agent en ligne mais routeur injoignable
> - `NOT_CONFIGURED` : aucun agent enregistré (attendre que l'agent démarre)

---

## 6. Scénarios de test (jour du test)

| # | Scénario | Ce qu'on vérifie | Résultat attendu |
|---|---|---|---|
| 1 | Taper "Se connecter" → voir pub → attendre autorisation | Chaîne complète serveur→agent→routeur | "Connecté", quota 5 Go, compteurs routeur incrémentés |
| 2 | Attendre 60s pendant "Connecté" | Heartbeat maintient la session serveur | Reste "Connecté" |
| 3 | Basculer arrière-plan puis revenir | Reprise de session | Reste "Connecté" |
| 4 | Appuyer sur "Déconnexion" | Commande disconnect envoyée à l'agent | Routeur retire l'IP de `wz-active` |
| 5 | Épuiser le quota (admin_overview → admin_reset_allocation avec quota=1Mo, attendre) | Limite de quota | "Quota épuisé" |
| 6 | Redémarrer le routeur puis re-taper "Se connecter" | Routeur reboot = perte adresse-list | Nouvelle session crée nouvelle entrée `wz-…` |
| 7 | Vérifier l'IP/MAC observée en DB (`wifi_sessions.device_observed_ip/mac`) | Binding vérifiable | Valeur présente, correspond à l'appareil réel |

---

## 7. Rollback (revenir au mode démo)

```bash
# 1. Remettre .env
EXPO_PUBLIC_NETWORK_MODE=android_vpn_demo

# 2. Redémarrer Metro

# 3. Supprimer l'agent de test (optionnel)
DELETE FROM local_agents WHERE name = 'agent-test-mercredi';

# 4. Finir toute session active
SELECT end_network_session(s.id, 'TEST_CLEANUP')
FROM wifi_sessions s
WHERE s.status IN ('authorized','active','paused')
  AND s.site_id = 'd9fe1d87-b4a8-4b92-8ebc-d213b2929e8d';
```

Le mode VPN démo fonctionne **indépendamment** de MikroTik — les deux sont isolés par `NetworkProviderKind` (live vs simulated). Aucun code natif n'est modifié.

---

## 8. Limites connues du premier jour

- **Enregistrement `register-device` 500** : **corrigé** par la migration
  `0016_devices_rls_upsert_safe.sql` (policy `devices_self_update` sans
  sous-requête récursive + déclencheur de garde sur `devices.status`). Non
  appliquée à la base de prod : à pousser avant le test.
- **IPv6** : le routeur doit être configuré pour désactiver IPv6 sur le SSID de test ; sinon le contrôle d'accès peut être contourné.
- **Agent mock** : les compteurs sont simulés (MockRouter). Les vrais compteurs routeur ne seront validés que le jour du test avec le routeur physique.
- **Drapeau d'honnêteté désynchronisé** : `--mock` (agent) et
  `MIKROTIK_REAL`/`MIKROTIK_MOCK` (serveur) sont deux canaux distincts, rien
  ne les rapproche automatiquement. Une divergence affiche un état faux. Cf.
  §2.1.1 et la checklist §2.3. Le correctif de fond (mode remonté dans le
  heartbeat de l'agent) n'est pas fait.
- **Walled Garden** : pas encore déclenché automatiquement — à configurer manuellement sur le routeur avant le test si besoin.

---

## 9. Fichiers concernés (code)

- `src/network/MikrotikNetworkAdapter.ts` — adaptateur RÉEL (live), chaîne complète
- `src/network/NetworkAccessAdapter.ts` — interface `providerKind` (live/simulated)
- `src/network/AndroidVpnDemoAdapter.ts` — simulation VPN local
- `src/lib/mikrotikAuth.ts` — helper pur d'attente de confirmation serveur
- `src/contexts/ConnectionContext.tsx` — orchestrateur, état machine, utilise le helper
- `src/components/ConnectionStatusCard.tsx` — affiche badge "RÉEL" vs "Simulation"
- `agent/engine.mjs` — cœur agent : commandes signées → RouterOS
- `supabase/functions/request-wifi-session/` — début de session + enfilement commande
- `supabase/functions/network-health/` — état chaîne serveur + agent
- `supabase/functions/_shared/network-config.ts` — sémantique fail closed
  `MIKROTIK_REAL` / `MIKROTIK_MOCK` (§2.1.1)
- `supabase/functions/agent-command-fetch/` — signature HMAC + remise commande
- `supabase/functions/agent-collect/` — delta compteurs → SQL
- `scripts/e2e-mikrotik-chain.mjs` — test bout-en-bout sans routeur
