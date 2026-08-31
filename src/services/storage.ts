import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  SETTINGS: "@wifizone/settings",
  NOTIFICATIONS_READ: "@wifizone/notifications_read",
  LAST_REFRESH_DASHBOARD: "@wifizone/last_refresh_dashboard"
} as const;

async function safeGet(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function safeSet(key: string, value: string | null): Promise<void> {
  try {
    if (value) {
      await AsyncStorage.setItem(key, value);
    } else {
      await AsyncStorage.removeItem(key);
    }
  } catch {
    // storage unavailable
  }
}

export async function getSettings(): Promise<string | null> {
  return safeGet(KEYS.SETTINGS);
}

export async function setSettings(settingsJson: string | null): Promise<void> {
  return safeSet(KEYS.SETTINGS, settingsJson);
}

export async function getReadNotifications(): Promise<string | null> {
  return safeGet(KEYS.NOTIFICATIONS_READ);
}

export async function setReadNotifications(dataJson: string | null): Promise<void> {
  return safeSet(KEYS.NOTIFICATIONS_READ, dataJson);
}

export async function getLastRefreshDashboard(): Promise<string | null> {
  return safeGet(KEYS.LAST_REFRESH_DASHBOARD);
}

export async function setLastRefreshDashboard(iso: string | null): Promise<void> {
  return safeSet(KEYS.LAST_REFRESH_DASHBOARD, iso);
}
