import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSupabase } from "../lib/supabase";
import { callFunction } from "../lib/functions";
import { logger } from "../lib/logger";
import type { DeviceInfo } from "../types";

const TAG = "device";

let cachedInstallationId: string | null = null;

const INSTALLATION_KEY = "@wifizone/installation_id";

async function loadOrCreateInstallationId(): Promise<string> {
  if (cachedInstallationId) return cachedInstallationId;

  try {
    const stored = await AsyncStorage.getItem(INSTALLATION_KEY);
    if (stored) {
      cachedInstallationId = stored;
      return stored;
    }
  } catch {
    // ignore
  }

  const id = generateInstallationId();
  cachedInstallationId = id;

  try {
    await AsyncStorage.setItem(INSTALLATION_KEY, id);
  } catch {
    // ignore
  }

  return id;
}

function generateInstallationId(): string {
  // Identifiant d'installation sécurisé, réinitialisable, généré côté client.
  // Suffisamment aléatoire pour ne pas servir d'identité fiable unique.
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let result = "wi-";
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function getPlatform(): string {
  if (Platform.OS === "web") return "web";
  return Platform.OS;
}

export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  const installationId = await loadOrCreateInstallationId();
  return {
    installationId,
    platform: getPlatform(),
    appVersion: getAppVersion(),
  };
}

export async function resetInstallationId(): Promise<void> {
  cachedInstallationId = null;
  try {
    await AsyncStorage.removeItem(INSTALLATION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Enregistre l'appareil côté serveur via la Edge Function register-device.
 */
export async function registerDevice(): Promise<{
  deviceId: string | undefined;
  status: string;
}> {
  try {
    const info = await getDeviceInfo();
    const res = await callFunction<{ device_id?: string; status?: string }>(
      "register-device",
      {
        installation_id: info.installationId,
        platform: info.platform,
        app_version: info.appVersion,
      }
    );

    if (!res.ok) {
      return { deviceId: undefined, status: "error" };
    }
    return { deviceId: res.data.device_id, status: res.data.status ?? "registered" };
  } catch (e) {
    logger.warn(TAG, "Enregistrement de l'appareil impossible", e);
    return { deviceId: undefined, status: "error" };
  }
}

export async function getSupabaseDeviceRows(): Promise<unknown[]> {
  const { data, error } = await getSupabase()
    .from("devices")
    .select("*");
  if (error) {
    logger.warn(TAG, "Lecture appareils impossible", error.message);
    return [];
  }
  return data ?? [];
}
