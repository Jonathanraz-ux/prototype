# MVP provisoire — Changements natifs, build EAS, apports MikroTik

Récapitulatif des modifications nécessaires à la compilation native,
puis de ce que la phase MikroTik pourra brancher sans réécrire l'application.

## 1. Changements natifs / dépendances (pour le build EAS)

| Fichier | Changement | Raison |
|---------|------------|--------|
| `package.json` | Ajout **`expo-network ~6.0.1`** (version attendue par le SDK 51 — attention : `~5.3.0` casse `:expo-network:androidSourcesJar`/`classifier`, échec Gradle) | Détection Wi-Fi vs données mobiles (`networkTransport.ts`) |
| `plugins/vpn-blocker/VpnBlockerService.kt` | `emitState()` émet désormais `ttlLeftMs` (double) | Corrige la timebase du TTL de session (elapsedRealtime, insensible à l'heure/fuseau) |
| `src/services/vpnBlocker.ts` | `VpnBlockerEvent.ttlLeftMs?` + parsing | Source de vérité du TTL côté JS |
| `src/contexts/ConnectionContext.tsx` | `authTtlMs = max(0, ttlLeftMs ?? fallback)` | Correction du bug `authExpiresAt − Date.now()` |

Note : ces changements sont purement additifs et compatibles avec le plugin
`withVpnBlocker.js` existant (aucune re-signature Android requise).

## 2. Checklist du build « recette » (EAS cloud)

Pré-requis locaux (aucun build local Android) :
1. `npx eas init` / projet connecté (package `com.wifizone.app`).
2. `.env` exempt de secrets non publics (uniquement `EXPO_PUBLIC_*`).
3. Commande : `npx eas build --platform android --profile recette` (APK).
4. Vérifier : versionCode/version incrémentés (`app.config.ts`), orientation
   portrait, `APP_ENV` adapté au pilote.
5. Télécharger l'APK, l'installer sur un device de test, relire
   `MVP_PROVISOIRE_RAPPORT_VALIDATION.md` (menu des vérifications device).

Signature attendue : « Internet Bôjô pour tous ».

## 3. Apports MikroTik (phase définitive, après réception du routeur)

Brancher SANS réécrire l'application :

| Composant | À faire à la phase MikroTik |
|-----------|------------------------------|
| `src/network/index.ts` | Passer `NetworkMode` à `mikrotik` et `providerKind` à `live` (dans le build pilote) |
| `src/network/MikrotikNetworkAdapter.ts` | Déjà présent : activer comme adaptateur réel (remplace `AndroidVpnDemoAdapter`) |
| Compteurs | Agent MikroTik → `allocations.consumed_bytes` ; le client réaffiche alors automatiquement les métriques car `meterTrusted = providerKind === "live"` |
| `browsePolicy.ts` | Réutilisable tel quel ; ajuster `requireWifi` si l'efficacité du contrôle routeur le permet |
| Auth | Possibilité de basculer sur le mode `radius` sans changer de machine d'état |

### Ce qui est volontairement conservé inchangé

- La machine à états et le serveur comme source de vérité.
- Le socle « navigateur contrôlé » (gating + suspension).
- Le thème Bôjô et l'identité (violet, blancs, signature).

## 4. Après le build recette

Mettre à jour `MVP_PROVISOIRE_RAPPORT_VALIDATION.md` : transformer chaque
« NON TESTÉ » en PASS/FAIL sur la base du hands-on device, puis livrer l'APK
et la notice client.