# Walled Garden (jardin clos) — WiFi Zone

Le walled garden est le mécanisme qui, **avant autorisation**, restreint le
client non connecté à une page de connexion/advertiseur, tout en lui laissant
résoudre quelques domaines essentiels (page de capture, serveur Supabase de
l'app, résolution de la plateforme). Une fois l'utilisateur **autorisé** (agent
+ MikroTik), le client quitte le walled garden et accède à Internet complet sous
contrainte de quota.

---

## 1. Principe

- Les clients **non autorisés** (pas dans l'address-list active `wz-active`) sont
  dirigés vers la page de capture par des règles pare-feu :
  - toute requête DNS/HTTP/HTTPS est interceptée,
  - seuls les domaines de la **liste blanche** (`wz-whitelist`) sont résolus,
  - tout le reste est bloqué / redirigé.
- Les clients **autorisés** (dans `wz-active`) sont exemptés des règles de
  capture et soumis uniquement aux règles de quota/coupe.

---

## 2. Commandes réseau associées

Le type de commande `walled_garden` existe dans
`supabase/functions/_shared/network-commands.ts` (liste `COMMAND_TYPES`). Il
permet au serveur d'enqueuyer pour l'agent une mise à jour de la liste blanche
(jardin clos) au lieu d'une autorisation/déconnexion classique. L'enveloppe
signée est : `id|type|site_id|expires_at|payload` (signature HMAC-SHA256,
`signCommand`/`verifyCommand`).

Côté agent, l'adaptateur RouterOS lit/écrit les address-lists de pare-feu ; le
walled garden est implémenté comme une liste d'adresses de domaines résolus.

---

## 3. Domaines de la liste blanche (exemples réels)

> ⚠️ **À adapter à la plateforme réellement utilisée le jour du test.** Les
> domaines blancs sont ceux nécessaires au fonctionnement de la page de capture
> et de l'app avant connexion. Ils sont **configurés par l'administrateur**, pas
> codés en dur dans l'application.

Catégorie « plateforme / app » (nécessaires au client mobile) :

- `hwwivzsdepzdgonfbkxq.supabase.co` — API Supabase (auth + Edge Functions).
- `supabase.co`, `supabase.in` — domaines de l'infra Supabase (images, etc.).
- `exp.host` — notifications push Expo (si utilisées pour relancer l'app).

Catégorie « page de capture / advertiseur » (la page qu'un navigateur du client
non connecté doit pouvoir charger) :

- le domaine hébergeant la page d'accueil/advertiseur du réseau (ex. à définir
  à la mise en production, par ex. `wifi-zone.example.com`).
- `fonts.googleapis.com`, `fonts.gstatic.com` — polices de la page.
- `cdn.jsdelivr.net`, `unpkg.com` — CDN si la page s'appuie dessus.

Catégorie « robustesse de la détection captive » (recommandé, exemples courants
utilisés par OS/browser pour détecter un portail captif) :

- `connectivitycheck.gstatic.com` — Android / Chrome.
- `captive.apple.com` — iOS/macOS.
- `neverssl.com`, `example.com` — contrôle utilitaire en HTTP.

Catégorie « réseau social / monétisation » (à décider avec le client ; options
communes) :

- `www.facebook.com`, `facebook.com` — pages de marque.
- `www.instagram.com`, `instagram.com`.
- `www.tiktok.com`, `tiktok.com`.
- `www.youtube.com`, `youtube.com`, `googlevideo.com`.

> Le choix d'autoriser les réseaux sociaux dans le walled garden est une décision
> **commerciale** : par défaut seul le strict nécessaire est blanc, le reste est
> bloqué pendant la capture.

---

## 4. Résolution DNS des domaines blancs

Sur le MikroTik hAP ac², avec les DNS lists RouterOS (≤ 7.x) :

```routeros
# (non exécutable directement — fourni en guide)
/ip dns static add name=www.google.com address=142.250.75.4
```

En pratique on préférera une **liste d'adresses par domaine** résolus par le DNS
interne, puis une règle pare-feu qui autorise uniquement les destinations de ces
listes pour les clients non connectés. Les adresses exactes changent ; elles sont
donc résolues/cachées dans une address-list maintenue par l'agent.

---

## 5. Vérification

1. Client non connecté : ouvrir un navigateur → la page de capture s'affiche ;
   `www.google.com` (si blanc) se résout, un site non blanc est bloqué.
2. Après autorisation (client dans `wz-active`) : navigation libre ; recharger
   `quota-status` montre le quota qui décroît.
3. Après déconnexion : retour au walled garden.

---

## 6. Sécurité

- Le walled garden n'est **qu'un** pré-filtre. La coupure réelle de quota est
  assurée par `wz-active` (coupe dure `drop`), pilotée par l'agent.
- Ne jamais blanc-lister des ports/domaines au-delà du nécessaire, pour éviter de
  contourner la monetisation.
- Toutes les commandes walled garden transitent par la file signée HMAC ;
  l'agent ignore toute commande à signature invalide.
