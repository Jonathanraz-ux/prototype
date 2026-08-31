// ============================================================
// services/notifications.ts — Gestion des notifications push
// ------------------------------------------------------------
// Acquiert le token Expo Push, demande les permissions système et
// enregistre le token côté Supabase (table push_tokens). Utilise
// expo-notifications. Ne renvoie jamais d'erreur fatale : une
// absence de configuration ou de permission est un état normal.
// ============================================================

import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { logger } from "../lib/logger";
import { registerPushToken, deactivatePushToken } from "../repositories/notificationRepository";

export { deactivatePushToken };

const TAG = "notif";

// Affichage en mode "banner" en premier plan pour ne pas rater les
// notifications pendant l'utilisation de l'app.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let registeredOnce = false;

/**
 * Configure le canal de notification Android (requis sur Android 8+).
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Notifications",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#F97316",
  });
}

/**
 * Demande la permission système et configure les canaux. Retourne
 * true si l'app est autorisée à recevoir des notifications.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === "android") {
      // Pas de permission à demander sur Android : le canal suffit.
      await ensureAndroidChannel();
      return true;
    }

    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (e) {
    logger.warn(TAG, "Permission notifications impossible", e);
    return false;
  }
}

/**
 * Projet Expo nécessaire pour la génération du token push.
 * Sans projectId, le token ne peut pas être généré de façon fiable.
 */
function getExpoProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
}

/**
 * Étape principale : demande la permission, génère le token Expo et
 * l'enregistre côté serveur. Idempotent à l'échelle de la session.
 */
export async function setupPushNotifications(): Promise<
  "granted" | "denied" | "not_configured" | "error"
> {
  // Déjà fait dans cette session, ne pas re-solliciter.
  if (registeredOnce) return "granted";

  const granted = await requestNotificationPermission();
  if (!granted) return "denied";

  const projectId = getExpoProjectId();
  if (!projectId) {
    logger.warn(TAG, "ProjectId Expo absent : push non configuré");
    return "not_configured";
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    if (!token) return "error";

    const status = await registerPushToken(token);
    if (status === "registered") {
      registeredOnce = true;
      return "granted";
    }
    return "not_configured";
  } catch (e) {
    logger.warn(TAG, "Acquisition/enregistrement du token impossible", e);
    return "error";
  }
}
