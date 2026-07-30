# WiFi Zone - Prototype

Application mobile de gestion de zones WiFi. Prototype premium développé avec React Native + Expo.

## 🚀 Installation

```bash
npm install
npx expo start
```

## 📱 Stack Technique

- **React Native** + **Expo SDK 52**
- **TypeScript** (strict mode activé)
- **Expo Router** (routing par fichier, routes typées)
- **React Native Reanimated 3** (animations 60 FPS)
- **React Native Gesture Handler**
- **NativeWind** (Tailwind CSS via NativeWind 4)
- **Lucide Icons**
- **React Hook Form** + **Zod** (préparés pour v2)
- **Context API** (préparé pour state management)

## 📂 Structure du projet

```
src/
├── app/
│   ├── _layout.tsx              # Root layout (Stack)
│   ├── (public)/                # Route group - écrans publics
│   │   ├── _layout.tsx          # Stack - transitions pub/privé
│   │   ├── splash/              # Écran de chargement animé
│   │   ├── welcome/             # Écran d'accueil avec illustration
│   │   ├── login/               # Connexion (mockée)
│   │   ├── register/            # Inscription (mockée)
│   │   ├── forgot-password/     # Mot de passe oublié (mocké)
│   │   └── otp/                 # Vérification OTP (mockée)
│   └── (app)/                   # Route group - écrans protégés
│       ├── _layout.tsx          # Stack - tabs + pages standalone
│       ├── (tabs)/              # Tab Navigator
│       │   ├── _layout.tsx      # Tab bar animée
│       │   ├── dashboard/       # 🏠 Tableau de bord principal
│       │   ├── history/         # 📊 Historique connexions
│       │   ├── notifications/   # 🔔 Centre de notifications
│       │   └── profile/         # 👤 Profil utilisateur
│       ├── subscription/        # 💎 Abonnements (Pro, Enterprise)
│       ├── admin/               # ⚙️ Dashboard admin (stats)
│       ├── settings/            # 🔧 Paramètres (toggles)
│       └── bubble-preview/      # 💬 Widget flottant (design)
├── components/
│   ├── index.ts                 # Barrel export
│   ├── AnimatedInput.tsx        # Input avec animation de label
│   ├── PrimaryButton.tsx        # Bouton principal animé
│   ├── SecondaryButton.tsx      # Bouton secondaire
│   ├── GlassCard.tsx            # Carte glassmorphisme
│   ├── StatusCard.tsx           # Carte statut
│   ├── QuotaCard.tsx            # Carte de quota détaillée
│   ├── ProgressCircle.tsx       # Cercle de progression animé
│   ├── NotificationCard.tsx     # Carte notification stylée
│   ├── HistoryCard.tsx          # Carte historique
│   ├── FloatingBubble.tsx       # Widget flottant
│   ├── AnimatedHeader.tsx       # En-tête animé
│   └── SkeletonCard.tsx         # Loader skeleton
├── constants/
│   ├── theme.ts                 # Design system complet (couleurs, ombres, animations)
│   └── index.ts
├── hooks/
│   ├── index.ts                 # useDebounce, useNetworkStatus, formatSpeed, etc.
│   ├── useColorScheme           # Détection thème
│   └── useLocalization          # (préparé)
├── services/
│   └── mockData.ts              # Toutes les données mockées réalistes
├── types/
│   └── index.ts                 # TypeScript interfaces (User, Subscription…)
└── assets/
    ├── images/                  # Icônes, splashes (placeholders)
    ├── icons/                   # SVG Lucide
    └── fonts/                   # Inter Regular/Bold (placeholders)

```

## 🎨 Design System

### Couleurs
```ts
background:  #09090B
card:        #18181B
primary:     #2563EB
accent:      #38BDF8
success:     #22C55E
warning:     #F59E0B
danger:      #EF4444
```

### Animations
- Transitions fluides sur tous les écrans (slide, fade, scale)
- Animations Reanimated 3 (60 FPS)
- Spring physics pour les boutons
- Skeleton loading
- Empty states

## 📋 Mock Data (pour prototypage)

Le fichier `src/services/mockData.ts` contient :
- `MOCK_USER` - Utilisateur de démo (Jean Dupont, Plan Pro)
- `MOCK_CONNECTIVITY` - Statut de connexion WiFi
- `MOCK_USAGE` - Consommation (quota, vitesse, temps restant)
- `MOCK_CONNECTION_HISTORY` - Historique connexions
- `MOCK_NOTIFICATIONS` - Centre de notifications
- `MOCK_PLANS` - Plans d'abonnement (Free, Pro, Enterprise)
- `MOCK_ADMIN_STATS` - Statistiques admin

## 🔒 Architecture préparée pour le backend

Le code est structuré pour faciliter l'intégration d'API :

- `src/services/api/` (à créer) - Services API typés
- `src/hooks/useReactQuery.ts` (à créer) - Wrappers React Query
- `src/contexts/AuthContext.tsx` (à créer) - Gestion auth
- Types TypeScript stricts pour tous les objets métier

## ⚠️ Notes importantes

- **Aucun backend requis** - Données mockées réalistes
- **Aucune authentification réelle** - Login/Register factices
- Ce prototype est prêt pour investisseurs/clients
- Les assets (fonts Inter, icônes PNG) doivent être ajoutés dans `/src/assets/`

## 🤝 Prochaines étapes

1. Ajouter les assets (fonts Inter via `npx expo install expo-font expo-splash-screen`)
2. Intégrer les vrais icônes PNG
3. Ajouter **React Query** (`@tanstack/react-query`) pour fetching d'API
4. Ajouter **React Hook Form** + **Zod** pour validation formulaires
5. Créer `src/services/api/` avec appels REST/GraphQL
6. Ajouter **AuthContext** avec refresh tokens
7. Connecter **MikroTik / FreeRADIUS** API backend

## 📱 Fonctionnalités incluses

| Écran | Statut | Description |
|---------|--------|-------------|
| Splash | ✅ | Animation logo + chargement |
| Welcome | ✅ | Landing page avec illustration |
| Login | ✅ | Formulaire animé (mocké) |
| Register | ✅ | Inscription avec validation (mockée) |
| Forgot Password | ✅ | Réinitialisation factice |
| OTP | ✅ | Vérification 6 chiffres |
| Dashboard | ✅ | État connexion, quota, vitesse, consommation |
| Historique | ✅ | Timeline connexions avec filtres |
| Notifications | ✅ | Centre avec types colorés |
| Profil | ✅ | Utilisateur, device, menu |
| Abonnements | ✅ | 3 plans (Free, Pro, Enterprise) |
| Admin Panel | ✅ | Stats users, data, revenus |
| Paramètres | ✅ | Thème, notifications, sécurité |
| Floating Bubble | ✅ | Design widget flottant |

## 📄 License

Propriétaire - WiFi Zone © 2026
