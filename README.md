# WiFi Zone

Application mobile de gestion de zones WiFi. Le client regarde une publicité vidéo, gagne un quota de 5 Go, et son accès Internet est débloqué par le routeur (MikroTik).

## Stack technique

- **Mobile** : React Native + Expo SDK 51, TypeScript strict, Expo Router, NativeWind/Tailwind, React Native Reanimated
- **Backend** : Supabase (Postgres + Row Level Security + Edge Functions Deno)
- **Agent local** : Node.js, bridge Supabase ↔ routeur MikroTik (API REST + protocole RouterOS)
- **Paiement réseau** : adresse MAC du client → liste firewall/simple queue `wz-active`

## Architecture

```
Mobile (Expo) ──▶ Supabase (Postgres + Edge Functions) ──▶ Agent (Node.js) ──▶ Routeur MikroTik
      ▲                     │                                    ▲
      │                     └── RLS : quota, sessions             │
      └─────────── état connexion (machine à états) ─────────────┘
```

Le flux : l'utilisateur regarde une pub → `complete_ad_view` → quota +5 Go → `request_wifi_session` → l'agent exécute la commande d'autorisation sur le routeur → l'utilisateur est en ligne jusqu'à épuisement du quota.

## Répertoires principaux

```
src/                        # Application mobile (Expo Router)
  app/                      #   écrans (public, auth, tabs)
  components/               #   composants UI
  contexts/                 #   AuthContext, ConnectionContext, LicenseContext
  network/                  #   adaptateurs réseau (MikroTik, RADIUS, dev, mock)
  repositories/             #   couche données Supabase
  services/                 #   auth, machine à états connexion, vpn, notifications
agent/                      # Agent local Supabase ↔ MikroTik
supabase/
  migrations/               # Schéma SQL versionné
  functions/                # Edge Functions Deno (31)
  seed/                     # Données de dev
scripts/                    # Scripts de dev/migration
```

## Installation

```bash
npm install
cp .env.example .env        # renseigner les variables Supabase
npx expo start
```

Pour l'agent : voir `agent/.env.example.agent`.

## Scripts utiles

```bash
npm run start               # lancer Expo
npm run test                # tests Jest mobile
npm run test:functions      # tests Deno des Edge Functions
npm run typecheck           # TypeScript strict
npm run db:push             # push migrations Supabase
npm run functions:deploy    # déployer les Edge Functions
cd agent && npm run start   # lancer l'agent (--mock sans routeur)
```

## Licence

Propriétaire — WiFi Zone © 2026