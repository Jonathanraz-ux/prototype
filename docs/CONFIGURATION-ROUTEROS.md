# Configuration du routeur MikroTik (RouterOS 7) — WiFi Zone

Guide d'installation/de dépannage du routeur hAP ac² utilisé pour le test.
Les noms (adresse-lists, queue, interface Wi-Fi) correspondent à ce que pilote
l'agent local (`agent/lib/routeros-rest.mjs`).

> **Pré-requis** : un utilisateur API REST avec privilèges suffisants, et le
> service `www-ssl` (REST) actif ; sinon protocole `api` (TCP 8728).

---

## 1. Vue des objets pilotés par l'agent

L'agent manipule exactement deux choses sur le routeur :

1. **`/ip/firewall/address-list`** nommée `wz-active` — la **coupe dure** :
   - `authorize` → **ajoute** l'adresse IP du client dans `wz-active`,
   - `deauthorize` → **retire** l'adresse de `wz-active`.
   La règle `drop` associée bloque le client tant qu'il y figure. Lever la coupe
   = retirer de la liste.
2. **`/queue/simple`** — une file par client (tag ou cible = adresse IP) pour
   relever les **compteurs** `bytes-in` / `bytes-out`. C'est la source du trafic
   mesuré (relevé par `agent-collect` → `apply_data_usage`).

---

## 2. Configuration initiale (résumé — exécuter dans Winbox / terminal)

### 2.1 Réseau & Wi-Fi

```routeros
# Interface Wi-Fi invité dédiée (à adapter : signaux/interfaces réels)
/interface wireless set [ find default-name=wlan1 ] ssid="WiFi-Gratuit" mode=ap-bridge \
    security-profile=guest disabled=no
/interface wireless security-profiles add name=guest mode=dynamic-keys \
    authentication-types=wpa2-psk wpa2-pre-shared-key="CHANGE-MOI" \
    group-key-update=0m unicast-ciphers=aes-ccm multicast-ciphers=aes-ccm

# DHCP sur le réseau invité
/ip pool add name=guest-pool ranges=192.168.10.10-192.168.10.200
/ip dhcp-server add name=dhcp-guest interface=<interface-invitee> \
    address-pool=guest-pool lease-time=1h
/ip dhcp-server network add address=192.168.10.0/24 gateway=192.168.10.1 \
    dns-server=192.168.88.1
```

### 2.2 Coupe dure (gérée par l'agent)

```routeros
# Address-list pilotée par l'agent (wz-active)
/ip firewall address-list add list=wz-active address=0.0.0.0/0 comment="placeholder"
/ip firewall address-list print

# Règle forward : bloquer toute adresse présente dans wz-active (coupe)
/ip firewall filter add chain=forward src-address-list=wz-active action=drop \
    log=no log-prefix="WZ-CUT" comment="WiFiZone coupe dure"

# Ordre important : la coupe doit prévaloir sur l'autorisation walled-garden
# (règles de drop AVANT les règles d'acceptation jardin clos).
```

### 2.3 Files de comptage par client

```routeros
# Une file simple par client (créée dynamiquement par l'agent si absente, ou en amont).
# Cible = adresse IP du client ; name portant le tag wz:<ip> pour le retrouver.
/queue simple add name="wz-<IP>" target=<IP> max-limit=20M/20M comment="wifi-zone"
/queue simple print
```

> L'agent `routeros-rest.mjs` cherche la file par cible `target` commençant par
> l'adresse, ou par tag `wz:<address>`. La file doit exister pour que le relevé
> de consommation aboutisse.

### 2.4 Walled garden (voir `WALLED-GARDEN.md`)

Rediriger les clients non autorisés vers la page de capture et n'autoriser que
les domaines blancs. Les règles de capture doivent être **avant** la coupe dure.

---

## 3. Utilisateur API REST

Privilèges minimum pour que l'agent fonctionne :

```routeros
/user group add name=wzapi policy=read,write,api,rest
/user add name=wzapi password="CHANGE-MOI" group=wzapi
# Activer le service REST (www-ssl)
/ip service set www-ssl disabled=no
/ip service print
```

> Pour le protocole `api` (8728), activer `/ip service set api disabled=no`.

---

## 4. Correspondance avec la config de l'agent

Dans `agent/.env` :

| Variable | Valeur attendue |
|---|---|
| `NETWORK_ADAPTER_TYPE` | `mikrotik` |
| `MIKROTIK_HOST` | adresse IP du routeur (ex. `192.168.88.1`) |
| `MIKROTIK_USERNAME` | `wzapi` |
| `MIKROTIK_PASSWORD` | le mot de passe de `wzapi` |
| `MIKROTIK_TLS` | `true` si REST via `www-ssl`, sinon `false` |
| `MIKROTIK_PORT_REST` | `443` (TLS) ou `80` (http) |
| `MIKROTIK_PORT_API` | `8728` |
| `WIFI_LIST_NAME` | `wz-active` |
| `AGENT_ROUTER_PROTOCOL` | `rest` ou `api` |

---

## 5. Dépannage rapide

1. `netwatch` / `ping` vers `MIKROTIK_HOST` depuis la machine de l'agent.
2. `GET /rest/system/resource` doit répondre (test de connexion `connect()`).
3. `: /ip firewall address-list print where list=wz-active` doit montrer le
   client une fois autorisé.
4. Si les compteurs restent à zéro : vérifier la **file simple** du client
   (l'agent ne peut relever que ce qui passe dans une queue).
5. Recomposer le poste en cas de blocage : voir `ROLLBACK-MIKROTIK.md`.
