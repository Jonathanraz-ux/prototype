# ==============================================================
# bojo-setup.rsc — Mise en service WiFi Zone (routeur MikroTik)
#
# CIBLE : hAP ac² en configuration d'usine (RouterOS 6.42+),
#         ou tout routeur MikroTik en 6.x / 7.x.
#
# ⚠ À IMPORTER UNE SEULE FOIS (Winbox > System > Scripts > Import,
#   ou glisser-déposer le fichier dans Winbox).
#
# ──────────────────────────────────────────────────────────────
# ⚠ PIÈGE N°1 — LE WiFi EST DANS LE BRIDGE, PAS « SUR UNE INTERFACE »
#
# Sur un hAP d'usine, le SSID Bôjô et les ports LAN sont membres du
# bridge `bridge`. Le trafic des clients est donc filtré sur
# `in-interface=bridge`, et JAMAIS sur `wireless1` / `wlan1`.
#
# Une règle qui ne matche jamais ne provoque AUCUNE erreur : le
# routeur reste silencieux. Résultat : `wz: blocage` ne bloque rien,
# `wz: session` n'accepte rien → les clients ont un accès INTERNET
# LIBRE et ILLIMITÉ, et le quota ne descend jamais.
#
# → On ne filtre donc JAMAIS sur le nom d'une interface WiFi, mais
#   sur la LISTE D'INTERFACES `wz-clients`, qui est détectée ici.
# ──────────────────────────────────────────────────────────────
#
# ⚠ PIÈGE N°2 — LE PC QUI PORTE L'AGENT DOIT ÊTRE EXEMPTÉ
#
# L'agent tourne sur un PC branché au même réseau. S'il est bloqué
# comme un client ordinaire, il perd l'accès à Supabase, ne reçoit
# plus aucune autorisation → AUCUNE session ne peut plus démarrer,
# sans le moindre message d'erreur. On l'exempte donc par IP.
#
# ⚠ PIÈGE N°3 — IPv6
#
# L'agent ne gère QUE de l'IPv4. Un client en IPv6 contournerait
# intégralement la liste wz-active. On coupe l'IPv6 des clients.
# ==============================================================

# ---- 0. Variables à/personnaliser ------------------------------
:local list            "wz-active"
# Adresse du PC qui porte l'agent (WiFi Zone operator). À REMPLIR.
# `ipconfig` sur ce PC. Laisser vide = l'agent perd l'accès à Supabase
# et plus aucune session ne démarre.
:local ip-agent        "192.168.88.10"
:local dns-serveurs    "1.1.1.1,8.8.8.8"
# 192.0.2.0/24 = TEST-NET-1 (RFC 5737), jamais routable : sert
# uniquement à faire EXISTER la liste (RouterOS refuse une liste
# d'adresses vide). `0.0.0.0` ne convient pas (adresse « unspecified »
# inerte mais susceptible de perturber les règles).
:local adresse-reserve "192.0.2.1/32"
# Réseau des clients : VIDE = détection automatique (recommandé).
# Renseigner une valeur oblige à la maintenir à la main.
:local reseau-clients  ""

# ---- 1. Détection de l'interface ET du réseau ---------------------
# Le WiFi d'usine est dans le bridge. Le trafic des clients est donc
# filtré sur `in-interface=bridge`, JAMAIS sur `wireless1`.
# Une règle qui ne matche jamais ne lève AUCUNE erreur : le routeur
# reste muet. On filtre donc sur la LISTE `wz-clients`, détectée ici.
:local iface-clients ""
:local net-clients    ""
:local best-pas-court 999

/ip address
:foreach a in=[find] do={
  :local ad [get $a address]
  :local in [get $a interface]
  # On privilégie le réseau de gestion d'usine (192.168.88.x) : c'est
  # lui qui porte le SSID Bôjô sur un hAP livré en configuration
  # d'usine. Sinon on retient le réseau privé dont le préfixe est le
  # plus long (le LAN, pas une passerelle /32).
  :if ($ad ~ "^192\.168\.88\.") do={
    :set iface-clients $in
  }
  :if (($ad ~ "^10\.") || ($ad ~ "^192\.168\.") || ($ad ~ "^172\.(1[6-9]|2[0-9]|3[01])\.")) do={
    :local idx [:tonum [:pick $ad [:find $ad "/"] [:len $ad]]]
    :if (($idx > 8) && ($idx < $best-pas-court)) do={
      :set best-pas-court $idx
      :set net-clients $ad
    }
  }
}
:if ([:len $net-clients] = 0) do={
  :put "ERREUR : aucun reseau prive trouve sur le routeur."
  :put "Verifier Winbox > IP > Addresses, puis renseigner"
  :put ":local reseau-clients \"<reseau>/<prefixe>\" et relancer."
  :put "Regles pare-feu NON posees."
  :set net-clients "192.168.88.0/24"
}
:if ($reseau-clients != "") do={ :set net-clients $reseau-clients }
:set reseau-clients $net-clients

:if ([:len $iface-clients] = 0) do={
  :put "ERREUR : aucune interface 192.168.88.x trouvee."
  :put "Verifier le reseau de gestion (Winbox > IP > Addresses) et adapter"
  :put "la variable ip-agent ci-dessus avant de relancer."
  :put "Regles pare-feu NON posees."
}

:put "Interface clients   : $iface-clients"
:put "Reseau clients      : $reseau-clients"

# ---- 2. Liste d'interfaces wz-clients --------------------------
# Regroupe l'interface LAN dans une liste nommee : c'est ce nom la
# liste que reference le pare-feu, plus jamais un nom d'interface
# WiFi qui varie selon la version de RouterOS.
:if ([:len [:find [find where name="wz-clients"]]] = 0) do={
  /interface list add name="wz-clients" comment="WiFi Zone (detecte par bojo-setup.rsc)"
  :put "-> creation de la liste d'interfaces wz-clients"
} else={
  :put "-> liste d'interfaces wz-clients deja presente"
}
:local deja-dans-liste 0
:foreach m in=[/interface list member find where list="wz-clients"] do={
  :if ([/interface list member get $m interface] = $iface-clients) do={ :set deja-dans-liste 1 }
}
:if ($deja-dans-liste = 0) do={
  /interface list member add list="wz-clients" interface=$iface-clients comment="clients WiFi Zone"
}

# ---- 3. Liste d'adresses pilotée par l'agent -------------------
/ip firewall address-list
:do {
  :local trouve [:find [find where list=$list] address=$adresse-reserve]
  :if ([:len $trouve] = 0) do={
    :put "-> creation de l'entree de reservation dans la liste $list"
    add list=$list address=$adresse-reserve comment="placeholder WiFi Zone (jamais un client reel)" disabled=yes
  } else={
    :put "-> liste $list deja presente"
  }
} on-error={
  :put "ERREUR : impossible de creer la liste $list"
}

# ---- 4. Pare-feu : sessions valides seulement -----------------
/ip firewall filter

# a) Connexions déjà établies : SANS cette règle, la sortie d'une pub
#    (initiée par une pub qui répond) est coupée en cours de session.
#    `src-address-list` N'EST PAS COSMETIQUE : sans lui, un client dont
#    la session vient d'être RÉVOQUÉE garde Internet jusqu'à la
#    fermeture de son tunnel, puisque ses paquets sont « established ».
#    Le quota ne serait respecté qu'en apparence.
:if ([:len [:find where comment="wz: etat"]] = 0) do={
  :put "-> ajout des regles WiFi Zone"
  add chain=forward action=accept in-interface-list="wz-clients" \
      src-address-list=$list connection-state=established,related,untracked \
      comment="wz: etat" place-before=0
}

# b) Le PC agent : EXEMPTÉ (cf. piège n°2). Doit précéder le blocage,
#    sinon l'agent se coupe lui-même de Supabase.
:if ([:len [:find where comment="wz: agent"]] = 0) do={
  add chain=forward action=accept in-interface-list="wz-clients" \
      src-address=$ip-agent comment="wz: agent" place-before=1
}

# c) Session autorisée : l'agent a ajouté l'adresse du client dans la
#    liste wz-active au moment de son autorisation.
:if ([:len [:find where comment="wz: session"]] = 0) do={
  add chain=forward action=accept in-interface-list="wz-clients" \
      src-address-list=$list comment="wz: session" place-before=2
}

# d) IPv6 : l'agent ne gère que l'IPv4. On coupe TOUT l'IPv6 venant des
#    clients, autorisé ou non : laisser IPv6 ouvert reviendrait à offrir
#    un accès Internet illimité et non décompté, la liste wz-active étant
#    une liste d'adresses IPv4. C'est le même choix que
#    `wifi-qr` / `optional` : l'IPv6 n'est pas mesuré, donc pas servi.
:local v6 "ipv6"
:if ([:len $dns-serveurs] = 0) do={ :set v6 "" }
:if ([:len [:find where comment="wz: ipv6"]] = 0) do={
  :if ($v6 != "") do={
    add chain=forward action=drop in-interface-list="wz-clients" \
        protocol=ipv6 comment="wz: ipv6" place-before=3
  } else={
    :put "ATTENTION : pas de DNS externe -> la regle 'wz: ipv6' n'est pas posee."
  }
}

# e) Tout le reste du réseau clients est coupé.
:if ([:len [:find where comment="wz: blocage"]] = 0) do={
  add chain=forward action=drop in-interface-list="wz-clients" \
      comment="wz: blocage" place-before=4
}

# ---- 5. Sortie Internet ----------------------------------------
# NE PAS écrire `out-interface-list=!wz-clients` : RouterOS n'accepte
# pas de liste dans un `!=`, la ligne est REJETÉE silencieusement et la
# masquerade disparait. On filtre donc sur le réseau source.
:local wan ""
/ip route
:foreach r in=[find where gateway!=""] do={
  :set wan [/ip route get $r interface]
  :put "-> interface WAN detectee : $wan"
}
:if ([:len $wan] = 0) do={ :set wan "ether1" }
:if ([:len [:find where comment="wz: masquerade"]] = 0) do={
  :do {
    /ip firewall nat add chain=srcnat action=masquerade src-address=$reseau-clients \
        out-interface=$wan comment="wz: masquerade"
    :put "-> masquerade : $reseau-clients via $wan"
  } on-error={
    :put "ERREUR : masquerade impossible via $wan — " . $error
  }
}

# ---- 6. DNS ---------------------------------------------------
# `dynamic-servers` est un parametre LECTURE SEULE : le poser
# provoke une erreur sur 7.x. On n'ecrit que `servers`.
/ip dns
:if ([:len $dns-serveurs] > 0) do={
  :do { set servers=$dns-serveurs allow-remote-requests=yes } on-error={
    :put "ERREUR DNS : " . $error
  }
  :put "-> DNS : $dns-serveurs (allow-remote-requests=yes)"
}

# ---- 7. API binaire : le protocole compatible hAP ac² ---------
# Sur 6.x (hAP ac² d'usine), l'API REST N'EXISTE PAS. L'agent doit
# disposer du port 8728, activé par défaut mais parfois restreint.
:do {
  :local s [/ip service find where name="api"]
  :if ([:len $s] > 0) do={
    /ip service set $s address="" disabled=no
    :put "-> service API (8728) actif et accessible depuis tout le LAN"
  } else={
    :put "ATTENTION : service `api` introuvable dans /ip service"
  }
} on-error={
  :put "ERREUR : impossible de configurer le service API — " . $error
}

# ---- 8. Compte dédié à l'agent ----------------------------------
# Un `admin` complet fonctionnerait, mais la politique d'accès limitée
# est notre garde-fou : sans droit sur /queue/simple, le quota n'est
# pas décompté ; sans droit sur /system/resource, l'agent ne ping pas.
#
# ⚠ LE MOT DE PASSE EST À PERSONNALISER ICI. Il est affiché une seule
#   fois dans le rapport : le noter avant de quitter cette session.
:local user-agent "wifi-agent"
:local mdp-agent  "A-CHANGER-avant-de-lancer"
:if ($mdp-agent = "A-CHANGER-avant-de-lancer") do={
  :put "ERREUR : mot de passe de l'utilisateur $user-agent non personnalise."
  :put "Editer :local mdp-agent en haut de ce fichier, puis reimporter."
} else={
  :do {
    :if ([:len [/user find where name=$user-agent]] = 0) do={
      /user add name=$user-agent password=$mdp-agent group=read comment="WiFi Zone agent"
      :put "-> utilisateur $user-agent cree (groupe read)"
    } else={
      /user set [/user find where name=$user-agent] password=$mdp-agent
      :put "-> utilisateur $user-agent : mot de passe mis a jour"
    }
    :put "-> MOT DE PASSE A NOTER : $mdp-agent"
  } on-error={
    :put "ERREUR : creation de l'utilisateur impossible — " . $error
  }
}

# ---- 9. VERIFICATION AUTOMATIQUE -------------------------------
# Le script se relit lui-même : si un point manque, il le DIT. C'est ce
# qui distingue une installation vérifiée d'une installation espérée.
:put ""
:put "=== WiFi Zone : mise en service terminee ==="
:put "Interface clients   : $iface-clients (via la liste wz-clients)"
:put "Reseau clients      : $reseau-clients"
:put "Liste pilotee       : $list"
:put "PC agent exempt     : $ip-agent"
:put ""
:put "=== CONTROLE FINAL ==="
:local erreurs 0

:if ([:len [/interface list find where name="wz-clients"]] = 0) do={
  :put "KO  : liste d'interfaces wz-clients absente"
  :set erreurs ($erreurs + 1)
} else={
  :local membres [/interface list member find where list="wz-clients"]
  :if ([:len $membres] = 0) do={
    :put "KO  : wz-clients est VIDE -> aucune regle ne peut matcher"
    :set erreurs ($erreurs + 1)
  } else={
    :put "OK  : wz-clients contient " . [:len $membres] . " interface(s)"
  }
}

:foreach c in=["wz: etat","wz: agent","wz: session","wz: ipv6","wz: blocage"] do={
  :if ([:len [/ip firewall filter find where comment=$c]] = 0) do={
    :put "KO  : regle [$c] absente"
    :set erreurs ($erreurs + 1)
  } else={
    :put "OK  : regle [$c] presente"
  }
}

:if ($ip-agent = "") do={
  :put "KO  : ip-agent vide -> l'agent perd l'acces a Supabase"
  :set erreurs ($erreurs + 1)
}
:if ([:len [/queue simple find]] > 0) do={
  :put "!  : /queue simple n'est PAS vide (l'agent cree les files)"
}
:if ([:len [/ip firewall nat find where comment~"wz: masquerade"]] = 0) do={
  :put "KO  : masquerade absente -> pas d'Internet pour les clients"
  :set erreurs ($erreurs + 1)
} else={
  :put "OK  : masquerade presente"
}

:put ""
:if ($erreurs = 0) do={
  :put ">>> VERDICT : configuration COMPLETE <<<"
} else={
  :put ">>> VERDICT : $erreurs point(s) MANQUANT(S) — ne pas poursuivre <<<"
}

:put ""
:put ">>> A FAIRE MAINTENANT <<<"
:put "  1. Noter le mot de passe de l'utilisateur $user-agent"
:put "  2. Lancer l'agent, puis .\agent\start.ps1 -Doctor"
:put "  3. Tester depuis un telephone NON autorise : il doit avoir"
:put "     Internet (la regle 'wz: blocage' est encore DESACTIVEE)"
:put "  4. Armer quand la recette est bonne : .\agent\start.ps1 -Arm"
:put ""
:put "Si un telephone non autorise garde Internet apres l'armement :"
:put "la regle 'wz: blocage' ne matche pas. Verifier que"
:put "'in-interface-list=wz-clients' est bien pose."