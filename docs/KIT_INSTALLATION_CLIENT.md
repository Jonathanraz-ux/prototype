# Kit WiFi Zone — installation chez le client

**Durée : ~20 minutes. Vous n'avez rien à comprendre au routeur,suivez les étapes.**

---

## Étape 1 — Brancher (2 min)

1. Câble réseau du **PC technique** dans un port **LAN** du hAP (pas le port WAN).
2. Allumez le hAP et attendez que la led `SYS` clignote **vert en continu** (~1 min).
3. Sur le PC, ouvrez une fenêtre PowerShell et tapez :

   ```powershell
   ping 192.168.88.1
   ```

   Vous devez voir des réponses. **Si ce n'est pas le cas, appelez-nous : ne continuez pas.**

---

## Étape 2 — Lancer l'agent (5 min)

Dans PowerShell, à la racine du projet :

```powershell
.\agent\start.ps1 -Provision
```

Attendez le verdict. **Le routeur n'est PAS encore coupé** : c'est
voulu, vous ne perdrez pas Internet pendant l'installation.

Si une ligne `[KO]` s'affiche, **lisez le rapport** :

```powershell
notepad provision-rapport.txt
```

Envoyez-nous une photo de l'écran. **N'allez pas plus loin.**

---

## Étape 3 — Vérifier que tout est en place (3 min)

```powershell
.\agent\start.ps1 -Doctor
```

Toutes les lignes doivent être `[OK ]`. Il doit apparaître :

```
API routeur        : OK
Droits /queue      : OK
```

---

## Étape 4 — La recette (5 min)

1. **Sans l'application**, ouvrez une page web sur un téléphone
   connecté au réseau `Bôjô`.
   → Vous devez **avoir Internet** (l'agent n'a rien coupé).

2. Lancez l'application, connectez-vous, prenez un ticket,
   puis choisissez le réseau `Bôjô`.

3. Rechargez une page web.
   → Vous devez **toujours avoir Internet** (session autorisée).

4. Vérifiez dans l'application que votre **temps restant défile**.

5. Quittez l'application (ou attendez la fin du ticket).
   Après quelques secondes :

   Rechargez une page web.
   → Vous devez **ne PLUS avoir Internet**.

> **Si Internet ne coupe pas à l'étape 5**, ce n'est pas grave :
> nous armedons la règle qui le garantit. La session est de toute
> façon bornée par le temps du ticket.

---

## Étape 5 — Armer (1 min)

Quand les étapes 1 à 4 sont bonnes :

```powershell
.\agent\start.ps1 -Arm
```

Vérification :

```powershell
.\agent\start.ps1 -Verify
```

La ligne `regle wz: blocage` doit indiquer `ARMÉE`.

Refaites la recette de l'étape 4 : cette fois, un téléphone **sans
session** ne doit **plus** avoir Internet.

---

## Ce qu'il ne faut jamais faire

| ❌ Ne pas | Pourquoi |
|---|---|
| Ouvrir Winbox et rejouer le fichier `bojo-setup.rsc` | Le kit a déjà tout posé ; cela peut dupliquer des règles |
| Modifier les règles `wz:` dans Winbox | Ce sont elles qui appliquent le quota |
| Couper le câble réseau du PC technique | L'agent s'arrête, les tickets en cours sont abandonnés |
| Redémarrer le PC technique | L'agent doit tourner en continu pour tenir le quota |
| Entrer dans les réglages du routeur | Domaine de l'installateur |

---

## En cas de panne

**Internet coupé pour tout le monde, et vous êtes client connecté :**

```powershell
.\agent\start.ps1 -Undo
```

> Remet le routeur dans son état de fonctionnement normal (Internet
> pour tous, sans quota). L'accès WiFi reste actif.

Puis contactez-nous.

---

## Vos informations

À remplir avant de quitter :

| Champ | Valeur |
|---|---|
| Date d'installation | |
| Identifiant de la box | |
| Mot de passe de l'agent | *(écrit dans le rapport d'installation)* |
| Ticket de suivi | |

---

*Le routeur contient vos identifiants WiFi : ne Photographiez pas l'écran
de Winbox et ne partagez pas ces informations sur un groupe WhatsApp
d'un autre client.*
