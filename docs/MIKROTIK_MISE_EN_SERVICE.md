# MikroTik — Mise en service (runbook d'exploitation)

> Document de référence pour le **jour J** et les jours suivants.
> Il remplace `MIKROTIK_MISE_EN_TEST.md` (préparation du tout premier test),
> dont les deux erreurs connues sont signalées en fin de document.
>
> **Aucune étape de ce runbook n'a été validée sur du matériel.** Tout a été
> vérifié contre un routeur simulé (`MockRouter`) et un serveur RouterOS
> simulé sur TCP. Les points qui demandent le routeur physique sont
> explicitement marqués `[MATÉRIEL]`.
>
> 📌 **Le hAP ac² sera branché à la prochaine séance : la configuration et le
> câblage réels seront poursuivis à ce moment-là.** Tout ce qui était
> préparable sans matériel est terminé et vert. Pour reprendre le fil sans
> relire le runbook en entier, aller directement au **§10**.

---

## 1. La chaîne en une phrase

L'application **ne connaît jamais le routeur**. Elle demande une session au
serveur, le serveur signe une commande, l'agent local l'exécute sur le
routeur, puis renvoie les compteurs.

```
App (EXPO_PUBLIC_NETWORK_MODE=mikrotik)
  → Edge Function request-wifi-session  → SQL begin_network_session
  → commande authorize signée HMAC
  → agent local (agent/main.mjs)
  → routeur : /ip/firewall/address-list  +  /queue/simple
  → agent-collect → apply_data_usage (delta borné à 0 côté SQL)
```

Deux invariants structurent tout le reste :

1. **pas d'identifiant routeur dans l'app** ;
2. **pas d'accès sans file de comptage** — si `/queue/simple` est refusée,
   l'autorisation est refusée. Un client non mesuré ne coûte pas plus cher
   qu'un client facturé à tort.

---

## 2. Ce qui a changé depuis le test de préparation

| Sujet | Avant | Maintenant |
| --- | --- | --- |
| Création d'un objet routeur en REST | `POST` (verbe **réservé aux commandes console** → refusé) | `PUT`, le verbe de création documenté |
| Lecture des compteurs de file | champs inexistants (`bytes-in`/`bytes-out`) ⇒ **quota figé à 0 sans signal** | propriété réelle `bytes` (« upload/download »), `print` avec `stats` |
| Compteur illisible | remonté comme « 0 octet » (faux mesuré) | `null` + alerte ; `--doctor` le classe **bloquant** |
| Cible de file (`target`) RouterOS 7 | chaîne seule ⇒ file jamais reconnue (recréée en boucle) | chaîne, liste ou **objet imbriqué** |
| Reconnexion API binaire | RST uniquement | RST **et** fermeture propre (FIN) |
| Routeur injoignable | requête coincée en silence | backoff exponentiel, puis erreur explicite |
| Mot de passe invalide | socket semi-ouverte qui reboucle sur « not logged in » | socket détruite, échec net |
| `MIKROTIK_TLS=true` | `fetch` + `agent` **ignoré** par Node → échec systématique sur certificat auto-signé | `node:https` avec `rejectUnauthorized: false` réel |
| REST absent (routeur 6.x) | échec muet indistinguishable d'une panne réseau | message nommant la version et la parade |
| File de comptage | suppression best-effort | suppression **garantie**, même si la révocation d'accès échoue |
| `ensureQueue` en échec | liste nettoyée, file parfois fantôme | liste **et** file nettoyées |
| Mode réseau par défaut | `android_vpn_demo` | `mikrotik`, démo **refusée en production** sans opt-in explicite |
| Préflight | `--doctor` | `--doctor` + `start.ps1 -Doctor`, contrôles routeur indépendants du serveur |

---

## 3. Pré-requis `[MATÉRIEL]`

### 3.1 Choisir le protocole selon la version du routeur

**C'est la première décision du jour J, et la seule qui ne se rattrape
pas toute seule.** L'agent ne peut pas deviner la version : elle est
lue dans *Winbox → System → Resources*.

| Version du routeur | Protocole | Transport |
| --- | --- | --- |
| **RouterOS 6.x** (dont hAP ac² d'usine : **6.42.3**) | `AGENT_ROUTER_PROTOCOL=api` | TCP 8728 |
| **RouterOS 7.1 – 7.8** | `AGENT_ROUTER_PROTOCOL=rest` + `MIKROTIK_TLS=true` | HTTPS 443 (`www-ssl`) |
| **RouterOS 7.9+** | `AGENT_ROUTER_PROTOCOL=rest` (TLS au choix) | HTTP 80 (`www`) ou HTTPS 443 |

> **Routeur du jour J : hAP ac², RouterOS 6.42.3.** Les trois lignes
> « REST » ci-dessus sont donc **écartées**. `agent/.env` est déjà posé
> sur `AGENT_ROUTER_PROTOCOL=api`.
>
> L'API REST RouterOS **n'existe qu'à partir de 7.1**, et le service
> `www` (HTTP en clair) **qu'à partir de 7.9**. Un hAP ac² livré
> d'usine tourne en 6.x : y mettre `rest` produit un **404 immédiat**,
> désormais diagnostiqué nommément par l'agent (« API REST absente …
> AGENT_ROUTER_PROTOCOL=api »).
>
> En cas de doute sur la version : **`api` marche partout**, 6.x comme
> 7.x. Le port 8728 doit être ouvert sur l'interface de gestion
> (`IP → Services`).

### 3.2 Droits du compte routeur

- **API binaire : toutes les versions, 6.x comprise.** Le routeur du
  jour J est en 6.42.3, donc **antérieur** au défi MD5 (6.43).
  L'agent applique l'ordre du client de référence MikroTik :
  il envoie `name` + `password` en clair, et c'est le routeur qui décide —
  soit il accepte (6.43+ / 7.x), soit il répond par un `=ret=` auquel
  l'agent riposte `"00" + md5(0x00 || mdp || défi)`. Aucune manipulation
  n'est nécessaire, et les deux branches sont testées.
- L'agent parle au routeur en **API binaire (port 8728)**, pas en REST :
  ouvrir le service `api` (`IP → Services`, actif par défaut).
- Un utilisateur dédié, par exemple `wifi-agent`, avec une politique
  d'accès limitée à :
  - `/ip/firewall/address-list` (lecture + écriture) ;
  - `/queue/simple` (lecture + écriture) ;
  - `/system/resource` (lecture, pour le ping).

  > Un compte `admin` complet fonctionne mais ne doit pas rester la
  > configuration cible : la politique d'accès est notre garde-fou.
  >
  > ⚠ La lecture des **statistiques** de file doit être autorisée :
  > sans elle le routeur renvoie la file sans compteur, l'agent refuse
  > alors toute mesure et le quota ne se décompte pas. `--doctor`
  > le signale comme **bloquant**.
  >
  > ⚠ Sur les versions antérieures à 6.43, `/queue/simple/print`
  > refuse l'argument `=stats=`. L'agent le détecte et **retente sans**,
  > plutôt que d'échouer : ce n'est pas une action manuelle.

### 3.3 Où le pare-feu doit voir passer le trafic des clients

> ⚠ **Sur un hAP d'usine, le WiFi est MEMBRE DU BRIDGE.** Le SSID Bôjô et
> les ports LAN sont des membres de `bridge`, et le trafic des clients est
> donc filtré sur `in-interface=bridge` — **jamais** sur `wireless1`.

Une règle qui ne matche jamais ne lève **aucune erreur** : le routeur
reste muet. Résultat : `wz: session` n'accepte rien et `wz: blocage` ne
bloque rien → les clients ont un accès **Internet libre et illimité**, et
le quota ne descend jamais.

`docs/routeros/bojo-setup.rsc` évite le piège : il détecte lui-même
l'interface qui porte le réseau de gestion, la range dans une liste
nommée `wz-clients`, et **toutes** les règles référencent cette liste.
Ne pas écrire `in-interface=wireless1` à la main.

- IPv6 : l'agent ne gère que l'IPv4. Désactiver l'IPv6 sur le SSID ou
  filtrer explicitement (le script le fait).

---

## 4. Poser la configuration du routeur `[MATÉRIEL]`

### 4.1 Chemin retenu : `agent/provision.mjs` (recommandé)

```powershell
.\agent\start.ps1 -Provision
```

C'est le chemin **privilégié** car il est vérifié : le script sauvegarde le
routeur, détecte le LAN, pose la configuration **désactivée**, se relit
lui-même, écrit un rapport, et sait tout retirer. Le script `.rsc` (§4.2)
reste disponible en secours.

```
.\agent\start.ps1 -Provision   # pose, DÉSARMÉ : Internet continue
.\agent\start.ps1 -Verify      # relit, n'écrit RIEN
.\agent\start.ps1 -Arm         # active la règle de blocage
.\agent\start.ps1 -Undo        # ne retire que nos objets (wz:)
```

`node --check` des scripts et la suite `npm test` (94 tests) passent.
Les tests d'intégration jouent un **faux routeur RouterOS en TCP** et
vérifient notamment que :

- la règle d'exemption de l'agent n'est **jamais** posée avec une IP vide ;
- l'API binaire est appelée avec les **noms de propriétés exacts**
  (`in-interface-list`, `src-address-list`, `place-before`…). RouterOS
  **ignore silencieusement** une propriété mal nommée : la règle devient
  inerte et le routeur laisse tout passer **sans la moindre erreur**. C'est
  le piège principal de cette installation ;
- l'ordre des règles est respecté (`wz: session` avant `wz: blocage`, et
  toutes nos règles **avant** le `fasttrack-connection` d'usine) ;
- `--undo` ne retire que les objets `wz:`, les règles d'usine restent ;
- un second passage ne duplique rien.

### 4.2 Secours : import `bojo-setup.rsc` dans Winbox

Le script pose tout ce qui doit exister **avant** le premier démarrage de
l'agent :

1. la liste `wz-active` pilotée par l'agent ;
2. les règles `forward` : état établi → session autorisée → blocage du
   reste sur l'interface clients → blocage IPv6 ;
3. la masquerade NAT pour le réseau des clients ;
4. les serveurs DNS ;
5. le service API 8728 et l'utilisateur `wifi-agent` ;
6. un **contrôle final** qui se relance et signale les points manquants.

**À faire avant d'importer** : renseigner `:local ip-agent` avec l'adresse
IPv4 **du PC qui porte l'agent** (`ipconfig` sur ce PC), et
`:local mdp-agent` avec un mot de passe **personnalisé**. Cet hôte est
exempté du pare-feu : sans cette exemption, l'agent se coupe lui-même de
Supabase, plus aucune autorisation ne part, et **aucune session ne démarre
sans le moindre message d'erreur**.

L'interface portant les clients et le réseau clients n'ont pas à être
renseignés : le script les détecte (§3.3). En cas de détection vide, il
affiche un `ERREUR` explicite et ne pose **aucune** règle de pare-feu
plutôt que de poser des règles qui ne matcheraient rien.

```bash
# Vérification après import
/ip firewall address-list print where list=wz-active
/ip firewall filter print where comment~"wz"
/interface list member print where list=wz-clients   # doit contenir l'interface
/queue simple print                                 # doit être VIDE : l'agent les crée
```

L'ordre des règles `forward` est significatif : la règle « session »
doit précéder la règle « blocage ». Le script insère en tête
(`place-before=0..3`).

> **À propos de la règle `wz: etat` et du quota.** Elle porte
> `src-address-list=wz-active`. Ce n'est pas décoratif : une connexion
> déjà établie est, pour le routeur, « established ». Sans ce filtre,
> l'agent peut bien retirer l'adresse du client de la liste à la
> révocation, **le tunnel continuerait de passer** jusqu'à sa fermeture et
> le quota ne serait respecté qu'en apparence.

> **Le PC agent reste administrateur.** `wifi-agent` est créé dans le
> groupe `read`, qui donne déjà le droit d'écrire sur `/ip firewall
> address-list`. Lui retirer des droits « en plus » exigerait de modifier
> le groupe `read` **global** du routeur — invasive, et susceptible de
> casser le Winbox du client. Le risque résiduel est volontairement
> assumé et documenté (§11).

---

## 5. Configuration de l'agent

```bash
copy agent\.env.example.agent agent\.env    # puis compléter
```

| Clé | Valeur attendue | Piège |
| --- | --- | --- |
| `NETWORK_ADAPTER_TYPE` | `mikrotik` | `mock` ne contacte aucun routeur |
| `AGENT_ROUTER_PROTOCOL` | **`api`** pour le hAP ac² 6.42.3 (§3.1) | `rest` sur un routeur 6.x ⇒ 404 muet |
| `MIKROTIK_HOST` | IP de gestion du routeur | pas le nom d'accès client |
| `MIKROTIK_TLS` | `false` en HTTP, `true` en HTTPS | `false` sur 7.1–7.8 ⇒ REST absent (pas de `www`) |
| `MIKROTIK_PORT_REST` | **laisser vide** | `TLS=false` + `443` est **refusé** au démarrage : REST HTTP écoute sur 80 |
| `WIFI_LIST_NAME` | `wz-active` | doit correspondre au routeur |
| `MIKROTIK_MAX_LIMIT` | `0/0` | la file **compte**, elle ne bride pas : le quota est côté serveur |
| `AGENT_DEBUG` | `false` | `true` = journal verbeux (utile le jour J) |

> `agent/.env` est ignoré par Git. Ne jamais le copier dans un ticket,
> un message ou une capture d'écran.

### 5.1 Drapeau d'honnêteté côté serveur (à poser en même temps)

`agent/.env` ci-dessus pilote le **routeur**. Ce que l'utilisateur voit dans
l'app vient d'un **autre** réglage, le secret serveur, et les deux doivent
être d'accord :

| Serveur (`supabase secrets set`) | Agent | Affichage app |
| --- | --- | --- |
| `MIKROTIK_REAL=1` | réel, sans `--mock` | « Accès réseau réel (MikroTik) » + compteurs |
| `MIKROTIK_MOCK=1` | lancé avec `--mock` | « routeur simulé », compteurs masqués |
| aucun des deux | — | « routeur simulé » (fail closed) |

> ⚠️ En **production**, un agent lancé **sans** `--mock` mais sans
> `MIKROTIK_REAL=1` fera afficher « routeur simulé » alors que le trafic est
> réel : c'est le défaut sûr, mais un ticket « l'app dit que c'est simulé »
> mérite cette vérification avant tout le reste.
>
> L'inverse est bien plus grave : `MIKROTIK_REAL=1` avec un agent `--mock`
> affiche un accès « réel » alors qu'aucun octet ne traverse de routeur.
> Aucun test automatisé ne peut le voir — c'est une erreur d'exploitation.
> Valeurs acceptées : `1`, `true`, `yes`, `on`.
> Détail et historique : §2.1.1 de `docs/MIKROTIK_MISE_EN_TEST.md`.

### Enrôlement de l'agent côté serveur

```bash
node agent\register.mjs "mon-token-secret"
```

La commande affiche le `sha256hex` du token et l'`INSERT` à exécuter dans
l'éditeur SQL Supabase (rôle `service_role`) :

```sql
INSERT INTO public.local_agents (organization_id, site_id, name, token_hash)
VALUES ('<ORGANIZATION_ID>', '<SITE_ID>', 'agent-bojo', '<sha256hex>');
```

La même valeur de token doit être posée dans `AGENT_TOKEN` (agent) et dans
les secrets Edge Functions (serveur). Le token n'est stocké qu'en SHA-256.

---

## 6. Contrôle pré-vol

```powershell
.\agent\start.ps1 -Doctor
```

Le contrôle **n'accorde aucun accès** : il se contente d'écrire puis
supprimer une entrée et une file marquées `wz:doctor` sur l'adresse
`192.0.2.1` (réservée par la RFC 5737, jamais attribuable à un client).

| Ligne | Signification |
| --- | --- |
| `✓ agent reconnu` | le token est valide côté serveur |
| `✓ connexion + identifiants` | identifiants routeur acceptés |
| `✓ lecture address-list` | droit de lecture |
| `✓ écriture address-list` | droit d'écriture + retrait |
| `✓ création file simple` | droit d'écriture sur `/queue/simple` |
| `✓ lecture des compteurs` | le quota **sera** décompté |
| `✓ suppression file simple` | routeur rendu à son état initial |

Code de sortie : `0` = prêt, `1` = bloquant.

> Les contrôles du routeur sont **indépendants** de l'injoignabilité du
> serveur : une panne réseau n'empêche plus de diagnostiquer le routeur.

---

## 7. Démarrage et vérification

```powershell
.\agent\start.ps1            # production
.\agent\start.ps1 -Mock      # sans matériel
```

Puis, côté application, `EXPO_PUBLIC_NETWORK_MODE=mikrotik` dans `.env`
(la valeur est déjà posée) et **rechargement du bundle JS**.

> ⚠ **Pas de rebuild natif, mais un rechargement de bundle obligatoire.**
> Metro fige les `EXPO_PUBLIC_*` **à la construction du bundle JS**.
> Un APK autonome compilé avec `android_vpn_demo` lèvera **toujours** le
> mode démo, même après avoir corrigé `.env`.
>
> - **Dev client** (`npx expo start --dev-client`) → recharger le
>   bundle suffit, aucune compilation.
> - **APK autonome** déjà construit → il faut une **nouvelle EAS
>   Build** pour passer en `mikrotik`. Vérifier donc *avant* la
>   recette que l'on utilise bien un dev client, sinon le test se fait
>   en mode démo et l'agent n'est jamais sollicité.

### Scénario de recette minimal `[MATÉRIEL]`

1. **Autorisation** — l'app demande une session.
   Routeur : `/ip/firewall/address-list print where list=wz-active`
   → une entrée `wz:xxxxxxxx` ; `/queue simple print` → une file
   `bojo-<ip>` en `0/0`.
2. **Navigation** — le client accède à Internet.
   La file voit `bytes` (= « upload/download ») croître.
3. **Comptage** — après un cycle de collecte (10 s par défaut),
   le tableau de bord affiche une consommation croissante.
4. **Déconnexion** — l'app coupe la session.
   Routeur : l'entrée **et** la file disparaissent.
5. **Quota épuisé** — l'app est coupée par le serveur.
   Le client perd l'accès sans intervention de l'agent.

### Redémarrage du routeur

`[MATÉRIEL]` Les files simples ajoutées par API ne survivent pas au
redémarrage. L'agent les **recrée à la collecte suivante** et le signale :

```
[agent] file de comptage disparue pour 10.0.0.24 — recréée (bojo-10.0.0.24)
```

Côté SQL, `apply_data_usage` borne le delta à 0 : la fenêtre de
redémarrage est **sous-comptée**, jamais facturée en négatif.

---

## 8. Dépannage

| Symptôme | Cause probable | Vérification |
| --- | --- | --- |
| `API REST absente … 404` | routeur RouterOS 6.x, ou service `www`/`www-ssl` désactivé | *System → Resources* ; `IP → Services` |
| `MIKROTIK_TLS=false demande le port 80` | `MIKROTIK_PORT_REST=443` hérité d'un ancien gabarit | vider la variable |
| `injoignable (http://…:443/rest)` | idem, l'agent a construit l'URL avant de s'arrêter | vider la variable |
| `Autorisation refusée : file de comptage indisponible` | le routeur refuse la création de file — **verbe HTTP erroné** (POST au lieu de PUT) ou droits insuffisants | Winbox → `/queue simple add` à la main |
| `aucune mesure exploitable` en boucle | le routeur ne renvoie pas les **statistiques** de file | Winbox → `/queue simple print stats` |
| `Authentification refusée` | mot de passe API binaire erroné | Winbox → Users |
| `Authentification (défi MD5) refusée` | idem sur routeur < 6.43 : le défi a été mal recomposé | vérifier le mot de passe, puis §14.1 |
| `Identifiants routeur refusés (not logged in)` | API binaire : mauvais couple identifiant/mot de passe | Winbox → System → Users |
| `Edge Functions injoignables` | secrets serveur absents ou token non enregistré | `supabase secrets list` |
| `token refusé (401)` | `AGENT_TOKEN` différent côté agent et base | rejouer `register.mjs` |
| Session `active` mais quota figé | file de comptage absente, ou compteurs non lisibles | `/queue simple print stats` |
| Le trafic passe mais le quota reste à 0 Go | compteurs non remontés (voir ligne « aucune mesure exploitable ») | idem |
| Client bloqué alors qu'il est autorisé | règles `forward` mal ordonnées | `/ip firewall filter print chain=forward` |
| `PRÊT POUR LE ROUTEUR` puis plus rien | agent arrêté sans laisse | le laisser tourner, ou le lancer en service planifié |

> Sous Windows, un `Ctrl+C` sur l'agent peut laisser la console en
> `UTF-8` : sans conséquence sur le fonctionnement.

---

## 9. Retour arrière

1. `.env` de l'app : `EXPO_PUBLIC_NETWORK_MODE=android_vpn_demo`
   (mode développement uniquement — refusé en production sans
   `EXPO_PUBLIC_ALLOW_VPN_DEMO_IN_PRODUCTION=true`) ;
2. recharger le bundle ;
3. arrêter l'agent (`Ctrl+C`) ;
4. les sessions actives se terminent côté serveur ; les entrées et files
   restantes se nettoient à l'arrêt ou à la prochaine expiration ;
5. **retirer les règles pare-feu** importées si le SSID doit redevenir
   ouvert (`/ip firewall filter remove [find where comment~"wz:"]`).

---

## 10. Reprise de session quand le routeur est branché

Décision actée avec l'opérateur : **le hAP ac² sera branché à la prochaine
séance, et la configuration comme le câblage réels seront poursuivis à ce
moment-là.**

Tout ce qui était préparable sans matériel est terminé et vert : agent 88/88,
serveur 330/330 (28 suites), `tsc` 0 erreur, build EAS `terrain` réussi. Ce
qui reste ne se décide pas sans le routeur sous les yeux.

Les deux correctifs de cette séance — authentification par défi MD5 (§14.1)
et décodage des réponses multi-enregistrements (§14) — sont **prouvés par
des doubles de test uniquement**. C'est précisément ce que le branchement
doit confirmer, et il faut s'attendre à devoir les ajuster.

### 10.1 À demander / mesurer au branchement

1. `MIKROTIK_PASSWORD` — le vrai mot de passe. `agent/.env` contient
   encore `changez-moi` : tant qu'il est là, `--doctor` s'arrête sur les
   identifiants.
2. `ip-agent` du PC qui porte l'agent (`ipconfig`), à injecter dans
   `docs/routeros/bojo-setup.rsc` **avant** import.
3. Confirmer la version exacte (Winbox → System → Resources), pour valider
   que 6.42.3 est bien la cible et non 6.43+.
4. Confirmer que le port **8728** est ouvert et que le pare-feu Windows
   laisse passer l'agent.

### 10.2 Ordre de branchement proposé

| # | Geste | Preuve attendue |
| --- | --- | --- |
| 1 | Câbler LAN routeur ↔ PC agent, mesurer l'IP du PC | `ping` OK des deux côtés |
| 2 | Ouvrir une session Winbox **avant** toute modification | version et sous-menus notés |
| 3 | Renseigner `ip-agent`, importer `bojo-setup.rsc` | aucune règle `ERREUR` affichée |
| 4 | Vérifications post-import (§4) | `wz-active` existe, `wz-clients` contient l'interface, `/queue simple` **vide** |
| 5 | Créer l'utilisateur API avec droits limités (§3.2) | utilisateur dédié, pas `admin` |
| 6 | `.\agent\start.ps1 -Doctor` | les 7 lignes en `✓` |
| 7 | `.\agent\start.ps1` puis vérifier `network-health` | `health: READY`, `simulated: false` |

### 10.3 Aucun commit tant que le physique n'a pas validé

Rien de ce qui précède n'a JAMAIS été exécuté contre un routeur. Tout
comportement non validé par le matériel reste marqué « NON VALIDÉ », et
c'est volontaire : le §11 le rappelle. Les correctifs d'authentification
et de décodage (§14) sont prouvés par des doubles de test, pas par un
routeur.

### 10.4 Le point qui peut mentir

`Routeur Démo` (`hAP ac3`) est encore `active` en base. Tant qu'il l'est,
`network-health` peut renvoyer `routerOnline: true` alors que le hAP ac²
réel est hors ligne — un « READY » flatteur mais faux. Le remettre à
l'arrêt **avant** la première mesure réelle, sinon le premier verdict de
la journée ne vaut rien.

---

## 11. Limites connues à la date de rédaction

- **Aucune validation matérielle.** Les pilotes REST et API binaire n'ont
  jamais été connectés à un routeur réel dans ce dépôt.
- **Pas de walled garden côté agent.** La commande répond explicitement
  `implemented: false` : le filtrage DNS/web se configure sur le routeur.
  L'interface et le serveur ne doivent jamais laisser croire qu'il est actif.
- **IPv4 uniquement.**
- **Un agent par machine** : le token est partagé, pas le compteur.
- **`MIKROTIK_REAL` n'est pas vérifiable par le serveur.** Le serveur ne voit
  pas l'argument `--mock` de l'agent, donc il croit l'opérateur sur parole et
  reste « simulé » par défaut (§5.1). Le mode ne remonte ni dans le heartbeat ni
  en base : `local_agents` n'a pas de colonne pour cela. Corriger à la source
  demanderait une migration 0017.
- `MIKROTIK_MAX_LIMIT=0/0` par défaut : la limitation de débit est
  laissée au serveur. Une file bridée ici produirait des compteurs
  différents de la réalité de l'abonné.

---

## 12. Corrections apportées à `MIKROTIK_MISE_EN_TEST.md`

Trois affirmations de ce document de préparation sont devenues fausses :

1. §3.2 proposait d'ajouter `address=0.0.0.0` comme entrée de la liste.
   Le script officiel utilise `192.0.2.1/32` (RFC 5737).
2. §3.4 annonçait la commande `walled_garden` comme « implémentée dans
   l'agent ». Elle ne l'est pas, et le signale désormais explicitement.
3. §3 annonçait « RouterOS 6.47+ pour l'API REST ». **L'API REST
   n'existe qu'à partir de 7.1**, et le service `www` (HTTP en clair)
   qu'à partir de 7.9. La version correcte est en §3.1, avec le
   protocole à choisir pour chaque cas.

---

## 13. Fichiers utiles

| Fichier | Rôle |
| --- | --- |
| `agent/main.mjs` | point d'entrée (`--mock`, `--doctor`) |
| `agent/start.ps1` | lanceur Windows (`-Mock`, `-Doctor`, `-Provision`, `-Verify`, `-Arm`, `-Undo`, `-IpAgent`) |
| `agent/.env.example.agent` | gabarit commenté |
| `agent/doctor.mjs` | contrôle pré-vol |
| `agent/engine.mjs` | autorisation, collecte, expiration, retrait |
| `agent/provision.mjs` | **configuration automatique du routeur** : sauvegarde, pose désarmée, auto-vérification, rollback |
| `agent/test/provision.integration.test.mjs` | provisionnement testé sur un **faux routeur RouterOS en TCP** |
| `agent/lib/routeros-rest.mjs` | pilote REST |
| `agent/lib/routeros-api.mjs` | pilote API binaire (+ `exec()` générique) |
| `agent/lib/router-targets.mjs` | validation IP, cibles `/32`, **lecture des compteurs** |
| `agent/test/routeros-rest.integration.test.mjs` | répétition sur **vrai socket HTTP**, sans routeur |
| `docs/KIT_INSTALLATION_CLIENT.md` | fiche client, 20 min, 5 étapes |
| `docs/routeros/bojo-setup.rsc` | configuration manuelle de secours |
| `scripts/e2e-mikrotik-chain.mjs` | validation de la chaîne sans routeur |

---

## 14. Contrat RouterOS appliqués par les pilotes

Deux détails de protocole ne se devinent pas et ont été corrigés après
contrôle de la documentation MikroTik. Ils sont verrouillés par des
tests de non-régression : ne pas les « simplifier » à l'avenir.

| Verbe REST | Action RouterOS | Utilisé par l'agent |
| --- | --- | --- |
| `GET` | `print` (lire) | lecture des listes |
| `PUT` | `add` (**créer**) | création d'entrée / de file |
| `PATCH` | `set` (modifier) | correction d'un champ qui a dérivé |
| `DELETE` | `remove` | révocation |
| `POST` | **commande console** | uniquement `/queue/simple/print` avec `stats` |

| Propriété de file | Contenu | Remarque |
| --- | --- | --- |
| `bytes` | composite `"upload/download"` | **la seule à lire en priorité** |
| `total-bytes` | total | repli |
| `bytes-in` / `bytes-out` | — | **n'existent pas** sur ce menu (ce sont les noms SNMP) |

Et côté API binaire : `/queue/simple/print` doit recevoir `=stats=`,
sans quoi RouterOS ne renvoie **aucune** propriété en lecture seule —
donc aucun compteur.

### 14.1 Deux replis côté API binaire, pour les routeurs antérieurs à 6.43

Le routeur du jour J (hAP ac²) est en **6.42.3**, antérieur au challenge
d'authentification (6.43). Le pilote gère les deux époques :

| Époque | Ce qui change | Ce que fait le pilote |
| --- | --- | --- |
| **< 6.43** | le mot de passe en clair est ignoré, le routeur renvoie un `=ret=` | riposte `"00" + md5(0x00 \|\| mdp \|\| défi)` |
| **< 6.43** | `/queue/simple/print` refuse `=stats=` (`unknown parameter`) | retente **sans** `=stats=` |

> Si les compteurs restent absents malgré le repli, `parseQueueRows`
> marque la file `available:false`, `queueUsage` renvoie `null`, et
> **`--doctor` classe le point en BLOQUANT**. L'agent ne remonte donc
> jamais « 0 octet » pour une mesure qu'il n'a pas lue : mieux vaut
> que la recette s'arrête franchement que facturer 5 Go à un client qui
> n'a rien consommé.

> La réponse au défi est **normative** et ne tolère aucune approximation :
> `"00" + md5(0x00 || mot_de_passe || défi)`. Trois détails font échouer
> l'authentification sans rien laisser voir : le préfixe littéral `00`,
> l'algorithme (**MD5**, pas SHA1) et l'ordre des octets (le mot de
> passe **entre** le `0x00` et le défi). Sans matériel, seul le test
> `réponse au défi : "00" + md5(...)` le vérifie — d'où sa présence.

> ⚠ Le décodage des réponses est tout aussi normatif : RouterOS envoie
> **une phrase par enregistrement**, `!done` n'arrivant qu'à la fin. Un
> pilote qui lit une seule phrase marche sur un enregistrement et se
> **désynchronise** dès qu'il y en a deux — les lignes suivantes sont
> alors attribuées à la requête suivante, donc les compteurs d'un client
> à un autre. C'est le second piège du jour J ; les tests envoient
> volontairement les enregistrements scindés pour le couvrir.
