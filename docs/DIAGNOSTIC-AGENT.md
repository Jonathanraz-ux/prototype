# Diagnostic de l'agent local — WiFi Zone

Guide pour vérifier que l'agent local fonctionne, comprendre ses logs, et
corriger les problèmes courants avant/durant le test MikroTik.

---

## 1. Démarrage

```powershell
# depuis la racine du dépôt
.\agent\start.ps1          # mode configuré par agent\.env
# ou
node agent\main.mjs --mock # simulateur, aucun équipement
```

Au démarrage, les logs doivent montrer :

```
[INFO] WiFi Zone — agent local
[INFO] adapter=mikrotik  host=192.168.88.1  proto=rest ...   (formatConfig)
[INFO] [routeur] mikrotik-rest
[INFO] [routeur] connecté à 192.168.88.1 (OK)
[INFO] [agent] démarré — ... loop 2000ms fetch / 15000ms ping    (engine.mjs)
```

> La config affichée ne révèle **jamais** les secrets (mot de passe/token masqués).

---

## 2. Boucles de l'agent

L'agent (engine.mjs) fait tourner 4 boucles single-flight :

| Boucle | Interv. défaut | Rôle | Log attendu |
|---|---|---|---|
| `ping` | 15 s | heartbeat + état routeur | `[routeros] injoignable…` si panne |
| `fetch` | 2 s | tire les commandes (`agent-command-fetch`) | `[agent] commande <id> (authorize/…)` |
| `collect` | 10 s | relève les compteurs (`agent-collect`) | `[agent] collect <session> : in=… (+… )` |
| `expire` | 20 s | expire les sessions (`agent-expire`) | `[agent] N session(s) expirée(s)…` |

En cas d'échec d'une boucle : `[agent] boucle fetch en échec : <msg>`.

---

## 3. Commandes réseau & signatures

- Les commandes sont signées HMAC-SHA256. En production, sans secret configuré
  (`NETWORK_HMAC_SECRET`), l'agent refuse : `[agent] commande <id> : signature
  invalide — rejetée`.
- En mode test/démo (pas de secret), l'agent logge : `aucun secret HMAC configuré
  (mode test) — non vérifiée`.
- Après une autorisation réussie :
  `[agent] authorised <ip> → mikrotik-rest:<ip>:<...>` et après déconnexion :
  `[agent] disconnected <ip> (<raison>)`.

---

## 4. Vérifier l'enregistrement

L'agent doit être enregistré : `register.mjs` → `agent-ping`/`agent-command-fetch`
avec un token dont le sha256 est stocké dans `local_agents.token_hash`. Vérifier
côté Supabase :

```sql
select id, name, adapter_type, last_seen_at, online
from local_agents order by last_seen_at desc;
```

S'il n'apparaît pas : vérifier `AGENT_TOKEN` dans `agent/.env`, que la valeur est
bien celle attendue par le serveur, et que `NETWORK_HMAC_SECRET` (côté serveur)
correspond à celle de l'agent (nécessaire pour vérifier les commandes).

---

## 5. Problèmes fréquents et résolutions

| Symptôme | Cause probable | Action |
|---|---|---|
| `routeur injoignable` | Mauvais hôte/port/auth REST | `ping MIKROTIK_HOST` ; vérifier `Get /rest/system/resource` ; utilisateur `wzapi` (voir `CONFIGURATION-ROUTEROS.md`) |
| `signature invalide — rejetée` | `NETWORK_HMAC_SECRET` diffère serveur/agent | Aligner les deux secrets (secrets Edge Functions Supabase) |
| `boucle fetch en échec` | Supabase injoignable ou token invalide | Vérifier `SUPABASE_URL`, `AGENT_TOKEN`, réseau |
| `collect` reste à 0 | Pas de file simple du client | Configurer `/queue/simple` (voir CONFIGURATION-ROUTEROS) |
| `expired: N` répété | sessions non fermées côté client | Vérifier l'app / `expire_stale_network_sessions` |
| Agent ne démarre pas | `agent/.env` absent | `Copy-Item agent\.env.example.agent agent\.env` puis compléter |

---

## 6. Mode debug

Activer les logs détaillés :

```powershell
# dans agent\.env
AGENT_DEBUG=true
```

Ajoute les lignes `[DBG]` (notamment le détail des collect : `in=… +Δ`).

---

## 7. Arrêt propre

`Ctrl+C` déclenche un arrêt gracieux :

```
[INFO] [agent] signal SIGINT reçu, arrêt gracieux…
[INFO] [agent] arrêté
```

> Toujours arrêter l'agent **avant** un rollback routeur
> (`docs/ROLLBACK-MIKROTIK.md`).
