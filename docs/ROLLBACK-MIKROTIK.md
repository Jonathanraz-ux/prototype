# Rollback MikroTik — WiFi Zone

Procédure pour **remettre le routeur à son état initial** après un test, ou pour
annuler rapidement toute modification si un test part de travers. À exécuter
dans Winbox / terminal d'un hAP ac².

> Toujours commencer par **stopper l'agent local** pour éviter qu'il ne
> re-crée des objets pendant le rollback.

---

## 0. Pré-requis

1. Arrêter l'agent : fermer `node main.mjs` / `.\start.ps1`.
2. (Si besoin) noter la configuration existante : `/export file=avant-test`.
3. Se connecter en terminal avec un compte `full`.

---

## 1. Vider l'address-list de coupe dure

```routeros
/ip firewall address-list remove [ find list=wz-active ]
# Vérifier
/ip firewall address-list print where list=wz-active
```

> Si une entrée « placeholder » avait été créée, elle est supprimée aussi ; la
> recréer si l'on relance un test (le pilote l'accepte vide).

---

## 2. Supprimer les règles de pare-feu créées pour le test

Les règles portent le préfixe log `WZ-` (créées pour WiFi Zone). Les retirer
**uniquement** si elles ont été ajoutées pour le test :

```routeros
/ip firewall filter remove [ find comment~"WZ-" ]
/ip firewall mangle remove [ find comment~"WZ-" ]
/ip firewall nat remove [ find comment~"WZ-" ]
```

> ⚠️ Ne pas toucher aux règles préexistantes de l'établissement : cibler
> uniquement les règles marquées WZ.

---

## 3. Supprimer les files de comptage

```routeros
/queue simple remove [ find name~"wz-" ]
/queue simple print
```

---

## 4. Nettoyer les règles walled garden

Si des règles de capture/jardin clos ont été ajoutées (voir
`WALLED-GARDEN.md`) :

```routeros
# Domaines blancs / redirections ajoutées pour le test
/ip firewall address-list remove [ find list~"whitelist" ]
# Retirer les redirections nav/forward dédiées au portail (marquées WZ)
/ip firewall nat remove [ find comment~"WZ-" ]
/ip firewall filter remove [ find comment~"WZ-" ]
```

---

## 5. Révoquer l'utilisateur API REST (optionnel mais recommandé en fin de test)

```routeros
/user remove wzapi
/user group remove wzapi
# Réactiver les services éventuellement laissés ouverts si on veut restreindre
/ip service set www-ssl disabled=yes
/ip service set api disabled=yes
```

---

## 6. Reset complet du routeur (dernier recours)

Si l'état est incohérent et que l'on veut repartir de zéro **sans préserver la
config** (⚠️ détruit adresses, utilisateurs, Wi-Fi) :

```routeros
/system reset-configuration no-defaults=yes skip-backup=no do-not-backup=no
# ou reloader une sauvegarde antérieure :
/system backup load name=avant-test.backup
```

---

## 7. Vérification finale

```routeros
/ip firewall address-list print           # vide pour wz-active
/queue simple print                        # vide (sauf préexistants)
/ip firewall filter print where comment~"WZ-"   # aucun
/user print                                # wzapi absent
```

Une fois le rollback confirmé, l'agent peut être relancé pour un nouveau test.
