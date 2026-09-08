# Test physique MikroTik — Mercredi

Plan de test de bout en bout sur un MikroTik physique (hAP ac²) avec l'agent
local « WiFi Zone ». Objectif : valider le scénario payant publicitaire complet
(coupe → autorisation → consommation → quota → coupure) sur matériel réel, sans
jamais générer d'APK.

> Ce document est un **plan de manipulation** : chaque étape suppose un
> pré-requis d'environnement déjà en place (Supabase projet `hwwivzsdepzdgonfbkxq`,
> Edge Functions déployées, agent configuré, application lancée en dev via
> `npx expo start`).

> **État réel au 2026-09-08** : le backend distant est préparé et les corrections
> (contexte auth des Edge Functions, gateway JWT des fonctions agent, casts enum,
> expiration heartbeat) sont appliquées **à la base distante ET dans les fichiers
> de migration sources**. Le MikroTik physique et l'agent réel **ne sont pas
> connectés** à ce jour : l'agent (`offline`) et le routeur (`offline`) sont donc
> au repos. Rien n'a été poussé vers Git et aucun APK n'a été généré.

> **Rotation des secrets de l'agent (2026-09-08)** : `AGENT_TOKEN` et
> `NETWORK_HMAC_SECRET` ont été **régénérés** (32 octets aléatoires chacun) suite à
> l'exposition du précédent. Les valeurs sont uniquement dans `agent/.env` (ignoré
> de Git), dans la base (hash SHA-256 du token) et dans les secrets des Edge
> Functions (voir le PAT révoqué). Le **PAT Management `sbp_…` précédent a été
> révoqué par l'utilisateur** et remplacé. Aucune valeur n'a été reportée dans ce
> document, dans une migration ni dans un commit.

> **Architecture retenue** : **Application → Edge Functions déployées → file de
> commandes (`network_commands`) → agent local → MikroTik.** L'autorisation, la
> collecte du trafic et la déconnexion passent par les fonctions `agent-*`
> déployées (`request-wifi-session` enfile la commande signée ; l'agent tire via
> `agent-command-fetch`, signe avec `NETWORK_HMAC_SECRET`, exécute et remonte le
> résultat via `agent-command-result` ; `agent-collect`/`agent-reconcile`/
> `agent-ping`/`agent-expire` complètent le cycle, `expire-stale-sessions` exécute
> l'expiration heartbeat). Les cinq fonctions locales **non déployées**
> (`network-mikrotik-authorize`, `network-mikrotik-disconnect`,
> `network-radius-authorize`, `network-radius-disconnect`, `network-session-usage`)
> sont des **stubs de l'ancienne architecture directe** et ne sont **pas
> nécessaires** au parcours de demain.

---

## 1. Avant de partir (sans le routeur)

Ces étapes peuvent être faites chez soi / au bureau, sans matériel.

1. **Vérifier l'assiette** : les 6 documents de `docs/` existent et sont à jour
   (`ARCHITECTURE.md`, `WALLED-GARDEN.md`, `CONFIGURATION-ROUTEROS.md`,
   `ROLLBACK-MIKROTIK.md`, `DIAGNOSTIC-AGENT.md`, présent).
2. **Vérifier les migrations** : `supabase db push --include-all` termine sans
   erreur (script `npm run db:push`).
3. **Vérifier les secrets** : les variables Edge Functions sont renseignées dans
   la console Supabase (section « Edge Functions » → Secrets) :
   - `AGENT_TOKEN` (ou la valeur dont le hash est utilisé pour l'agent),
   - `NETWORK_HMAC_SECRET` (signature des commandes),
   - `NETWORK_ADAPTER_TYPE=mock` si l'on veut répéter sans équipement, sinon
     `mikrotik`,
   - `MIKROTIK_HOST` / `MIKROTIK_USERNAME` / `MIKROTIK_PASSWORD`.
   > Dans `agent/.env`, `MIKROTIK_PASSWORD` vaut encore `changez-moi` (placeholder) :
   > **le mot de passe réel du routeur doit être saisi par le client avant le test**.
4. **Vérifier les tests** : `npm test`, `npm run test:functions`, et les tests
   Node de `agent/` passent au vert.
5. **Vérifier l'agent en mock** (optionnel, hors routeur) : lancer l'agent avec
   `NETWORK_ADAPTER_TYPE=mock` et observer le déroulé complet dans les logs.

---

## 2. Checklist du sac (à apporter)

| Quantité | Objet |
|---|---|
| 1 | MikroTik hAP ac² (ou équivalent RouterOS ≥ 7) |
| 1 | Câble Ethernet (WAN → box Internet ou data mobile en partage) |
| 1 | Alimentation du routeur |
| 1 | Ordinateur portable (agent local + `expo start`) |
| 1 | Smartphone Android pour l'app WiFi Zone |
| 1 | Smartphone de contrôle (optionnel, pour vérifier le walled garden) |
| — | Mot de passe du routeur (admin) et du Wi-Fi invité |

---

## 3. Sur le routeur (installation)

Voir `docs/CONFIGURATION-ROUTEROS.md` pour les commandes complètes. Résumé :

1. Connecter le WAN (Internet) et configurer l'adressage / DHCP.
2. Créer le profil de la limite de quota (address-list `wz-limited`).
3. Créer l'address-list de coupe dure `wz-active` (celle que l'agent pilote).
4. Créer le Wi-Fi « WiFi-Gratuit » en guest (réseau isolé, mDNS off).
5. Configurer le pare-feu : mangle + forward pour router le trafic des clients
   non autorisés vers la page (walled garden), et la règle `drop` lorsque
   l'adresse est dans `wz-active`.
6. Créer l'utilisateur API REST (lecture + `set` sur la liste `wz-active`).
7. Activer le service `www-ssl`/REST (ou API sur 8728 si protocole `api`).

---

## 4. Enregistrer l'agent local

L'agent se connecte à Supabase par token. Depuis `agent/` avec `.env` rempli :

```powershell
# (optionnel) générer un token et hacher sha256
Write-Output -NoNewline "votre-token" | Get-FileHash -Algorithm SHA256

# démarrer l'agent
node main.mjs   # ou .\start.ps1
```

Résultat attendu dans les logs :
```
[register] enregistrement OK  agentId=<uuid>  adapter=mikrotik
[engine] boucle démarrée  fetch=2s  ping=15s  collect=10s  expire=20s
[routeros] connexion REST établie  192.168.88.1
```

---

## 5. Déroulé du test de bout en bout (scénario payant)

Conditions de départ : l'utilisateur est **déconnecté** (state `idle`), le Wi-Fi
de l'app est **coupé** (`wifi_active` absent).

1. **Créer un compte** dans l'app (ou se connecter). Quota initial attendu :
   **5 Go** (5 368 709 120 octets).
2. **Lancer la connexion** : l'app `connect()`, → ad load → **publicité active**
   (la bannière défile).
3. À la fin de la publicité (`AD_WATCHED`) : l'app passe `authorizing_wifi`,
   l'attente dure quelques secondes.
   - **Passe en `wifi_active`** uniquement lorsque l'agent a confirmé
     l'autorisation réelle sur le routeur (présence de `router_session_reference`).
   - Si le routeur n'a pas confirmé dans le délai (agent hors ligne ou erreur) :
     l'app reste bloquée en erreur et **jamais** en `wifi_active`.
4. **Vérifier sur le routeur** que l'adresse IP du client est bien dans la liste
   `wz-active` : `:put [/ip firewall address-list find list=wz-active]`.
5. **Laisser consommer** ~30-60 s : l'agent `agent-collect` lit les compteurs
   RouterOS et appelle `apply_data_usage` ; le dashboard doit afficher
   « Dernière synchronisation » mise à jour et un quota **décroissant**.
6. **Vérifier la persistance** : rafraîchir le quota (`quota-status`) — le
   `consumed_bytes` reste monotone (jamais réinitialisé à la reconnexion).
7. **Couper la publicité / déconnecter** (`disconnect`) : l'app passe
   `disconnecting`, puis `idle`. Vérifier que l'adresse est retirée de
   `wz-active` et que le Wi-Fi du client est recoupé.

---

## 6. Vérifications d'affichage (§6)

Sur le dashboard, confirmer que tous les états s'affichent correctement :

| État attendu | Condition |
|---|---|
| Autorisation en cours | pendant l'attente de confirmation agent/routeur |
| Wi-Fi gratuit actif | **uniquement** après confirmation du routeur (`router_session_reference`) |
| En pause | l'app passe en arrière-plan pendant `wifi_active` |
| Déconnexion en cours | pendant `disconnect()` |
| Accès coupé | state `idle` |
| Quota épuisé | `disconnect_reason = QUOTA_EXHAUSTED` |
| Dernière synchronisation | horodatage mis à jour après chaque `quota-status` |
| État de l'agent | lecture de `networkHealth` (READY / UNREACHABLE / etc.) |
| Quota initial / consommé / restant | 5 Go, volume consommé, volume restant |

---

## 7. Séquences d'échec à tester

1. **Quota épuisé** : réduire temporairement l'allocation via
   `admin_reset_allocation` (ou un débit artificiellement élevé en mock), puis
   constater la coupure + `QUOTA_EXHAUSTED`.
2. **Agent hors ligne** : stopper l'agent, lancer une connexion → l'app ne doit
   **jamais** atteindre `wifi_active` (reste en erreur / timeout).
3. **Expiration de session** : agent coupé pendant une session active → après la
   grâce (25 s), `expire_stale_network_sessions` déconnecte la session
   (`HEARTBEAT_TIMEOUT`).
4. **Obsolescence de l'agent / du routeur** : sans heartbeat valide pendant le
   délai (120 s par défaut), `expire_stale_agents` bascule l'agent (`online` →)
   et le routeur (`active` →) à `offline`. Un ancien heartbeat ne laisse donc
   **jamais** le routeur `active` indéfiniment. Ce contrôle est délégué par la
   cron `expire-stale-sessions`. Sur le terrain, seul l'agent réellement connecté
   au hAP ac² (heartbeat `router_ok=true`) maintient le routeur `active`.

---

## 8. Critères de sortie (définition of done)

- [ ] Quota initial = 5 Go affiché.
- [ ] `wifi_active` n'apparaît qu'après confirmation réelle du routeur.
- [ ] Consommation décroit le quota (compteurs RouterOS réels via l'agent).
- [ ] `consumed_bytes` persiste (jamais remis à zéro à la reconnexion).
- [ ] Coupure effective sur le routeur à l'épuisement.
- [ ] Tous les états d'affichage du §6 visibles et corrects.
- [ ] `docs/ROLLBACK-MIKROTIK.md` exécutable pour remettre le routeur à l'état
      initial.
- [ ] Aucun APK généré, aucun push GitHub, aucun déploiement de production.
