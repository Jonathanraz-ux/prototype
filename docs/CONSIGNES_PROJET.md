# Bôjô — Document de Consignes Générales et Spécifications Projet (MVP 12 Jours)

> **Document de Référence Unique**  
> Ce document consigne l'ensemble des instructions, règles et choix d'architecture pour le projet **Bôjô** (évolution du prototype Android vers un MVP client en 12 jours).

---

## 1. Identité et Charte Visuelle

- **Nom Public du Produit** : **Bôjô**
  - *Note* : `WiFi Zone` est uniquement l’ancien nom de code interne et ne doit plus figurer dans l'interface client.
- **Signature Exacte (Tagline)** : `Internet Bôjô pour tous`
- **Couleur Primaire (Thème)** : `#5913f5` (Violet officiel extrait du logo de référence)
- **Texte & Contrasts** : Textes blancs sur fond violet.
- **Logo & Assets** :
  - **Logo complet** (`assets/bojo-logo-full.png`) : Utilisé dans les écrans principaux (Login, Dashboard, Splash/Header). Conserve scrupuleusement le lettrage, le violet et les accents. Ne pas redessiner arbitrairement.
  - **Icône d'application Android** (`assets/bojo-icon-square.png`) : Symbolise uniquement le carrée blanc avec le `B` accentué sur fond violet, sans le nom ni la signature pour garantir une lisibilité optimale à petite échelle. Ne jamais déformer ni étirer le logo horizontal dans une icône carrée.

---

## 2. Spécifications Produit & Fonctionnalités (MVP)

1. **Accès Internet Sponsorisé** :
   - Connexion Internet financée par l'affichage d'une publicité visible.
2. **Navigateur Intégré avec Raccourci Google** :
   - Intégration d'un navigateur In-App avec accès direct / raccourci vers Google.
   - Publicité persistante (bannière/overlay) maintenue pendant la navigation.
3. **Conservation du Socle Existant** :
   - Préserver l'ensemble des fonctionnalités existantes valides du prototype (Auth, Session management, etc.).
4. **Gestion du Quota de Test** :
   - Quota de test fixé à **5 Go**, non renouvelable automatiquement.
   - La reprise d'une session existante ne réinitialise pas le quota.
5. **Intégration Réseau & Matériel MikroTik** :
   - Intégration réelle avec le routeur MikroTik cible du client.
   - **Analyse préalable requise** : Examiner le VPN/TUN existant avant toute décision sur son maintien ou son remplacement par un portail captif nativement géré avec le MikroTik.
   - **Règle absolue** : Ne jamais présenter une simple simulation comme un fonctionnement réseau réel.

---

## 3. Méthode de Travail & Principes de Développement

- **Dépôt & Branchement** :
  - Travail direct dans le dépôt existant (`c:\Users\JONATHAN\PROTOTYPE`).
  - Conservation impérative des modifications locales existantes.
  - Branche de travail dédiée : `feat/bojo-mvp`.
- **Politique de Modifications** :
  - Inspection approfondie du code avant de conclure sur son fonctionnement.
  - Aucune réécriture complète ni montée de version majeure sans nécessité démontrée.
  - Exécution stricte de l'étape demandée avec fourniture du bilan standardisé.
  - Autonomie sur les décisions techniques courantes.
  - Escalade par question précise uniquement sur les vrais blocages métier/technique.

---

## 4. Stratégie de Builds Android & EAS (Expo)

- **Mode de Compilation** :
  - **EAS Build Cloud uniquement** pour les builds Android.
  - **Interdiction** des builds Gradle locaux (`expo run:android` ou `eas build --local`).
- **Workflow Quotidien** :
  - Développement quotidien via `npx expo start --dev-client`.
  - Regroupement stratégique des modifications natives (plugins Expo, AndroidManifest, icônes) pour limiter le nombre de compilations EAS.
- **Jalons de Build (Budget 5 à 7 APKs)** :
  - Builds de développement réutilisables avec Expo Dev Client.
  - APK autonomes générés aux jalons clés de recette et de livraison finale.
  - Vérification obligatoire des quotas du compte EAS avant tout premier build.
  - Aucun déclenchement d'abonnement payant automatique.
- **Sécurité Prebuild** :
  - Ne jamais exécuter `npx expo prebuild --clean` sans s'être assuré que les modifications Android spécifiques sont bien préservées via des Expo Config Plugins ou sauvegardées dans le répertoire `android`.

---

## 5. Modèle de Bilan Obligatoire à Chaque Fin d'Étape

Chaque livraison d'étape doit comporter les rubriques suivantes :
1. **Changements effectués**
2. **Fichiers concernés** (avec liens cliquables)
3. **Vérifications réellement exécutées**
4. **Éléments non vérifiés**
5. **Blocages éventuels**
6. **Nécessité ou non d’une recompilation native (EAS Build)**
