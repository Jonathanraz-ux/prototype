# MikroTik — Préparation du test (mercredi)

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
  --project-ref hwwivzsdepzdgonfbkxq
```

> `MIKROTIK_HOST` : pour le test du premier jour, mettre l'IP LAN du routeur
> (ex. `192.168.88.254`). Si le routeur n'est pas encore là, la valeur est
> acceptée — le health passera NOT_CONFIGURED tant qu'aucun agent n'est en ligne.

> `NETWORK_HMAC_SECRET` : **jamais le même que le JWT management**. Générer :
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

> **Simulé** (pour test sans routeur) : ajouter `MIKROTIK_MOCK=1` pour que le
> health endpoint signale `simulated: true` (l'UI affichera un badge).
> Le `MIKROTIK_HOST` reste requis pour que `configured=true`.

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

```
/ip/firewall/address-list/add list=wz-active address=0.0.0.0 comment="placeholder"
```

> L'agent créera automatiquement des entrées `wz:<session_id_8chars>` pour
> chaque session autorisée.

### 3.3 Options de sécurité (si requises)

| Fonctionnalité | Commande RouterOS | Remarque |
|---|---|---|
| Restreindre DNS walled garden | `/ip/dns/static` + masque | À configurer si besoin |
| Limite de débit globale | `/queue/simple` | L'agent gère la création automatique par session |
| Journaux | `/log print` | Utile pour le debug premier jour |

### 3.4 Walled Garden (optionnel, pré-Autorisation)

Avant qu'une session ne soit autorisée, seuls les sites essentiels sont accessibles :
- Supabase (`hwwivzsdepzdgonfbkxq.supabase.co`)
- Publicités (campagnes Google AdMob / serveur pub)
- DNS public (1.1.1.1 / 8.8.8.8)

> La commande `walled_garden` est implémentée dans l'agent mais n'est pas encore
> déclenchée automatiquement. Elle peut être envoyée manuellement via l'Edge Function
> `enqueue_network_command` avec `type: "walled_garden"`.

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

Le script affiche OK/FAIL pour chaque étape. En mode **simulé** (`MIKROTIK_MOCK=1`), il fonctionne même si le routeur n'est pas encore présent.

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

- **Enregistrement `register-device` 500** : bug RLS server-side (cosmétique, n'empêche pas le fonctionnement).
- **IPv6** : le routeur doit être configuré pour désactiver IPv6 sur le SSID de test ; sinon le contrôle d'accès peut être contourné.
- **Agent mock** : les compteurs sont simulés (MockRouter). Les vrais compteurs routeur ne seront validés que le jour du test avec le routeur physique.
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
- `supabase/functions/agent-command-fetch/` — signature HMAC + remise commande
- `supabase/functions/agent-collect/` — delta compteurs → SQL
- `scripts/e2e-mikrotik-chain.mjs` — test bout-en-bout sans routeur
