import type { UsageStats, ConnectionHistoryItem, DisconnectReason } from "../types";

const TOTAL_QUOTA_MB = 5000;
const TOTAL_TIME_MINUTES = 60;

let currentUsage: UsageStats = {
  remainingQuotaMB: TOTAL_QUOTA_MB,
  totalQuotaMB: TOTAL_QUOTA_MB,
  remainingTimeMinutes: TOTAL_TIME_MINUTES,
  totalTimeMinutes: TOTAL_TIME_MINUTES,
  todayConsumptionMB: 0,
  downloadSpeedKbps: 45000,
  uploadSpeedKbps: 12000
};

let consumptionInterval: ReturnType<typeof setInterval> | null = null;
let history: ConnectionHistoryItem[] = [
  {
    id: "c-1",
    ssid: "WiFi-Zone-Premium",
    connectedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    disconnectedAt: new Date(Date.now() - 86400000 * 3 + 3600000 * 2).toISOString(),
    durationMinutes: 120,
    dataUsedMB: 1500,
    location: "Paris 11e",
    status: "completed",
    disconnectReason: "user_disconnected"
  },
  {
    id: "c-2",
    ssid: "WiFi-Zone-Premium",
    connectedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    disconnectedAt: new Date(Date.now() - 86400000 * 2 + 3600000 * 1.5).toISOString(),
    durationMinutes: 90,
    dataUsedMB: 850,
    location: "Paris 11e",
    status: "completed",
    disconnectReason: "session_expired"
  },
  {
    id: "c-3",
    ssid: "WiFi-Zone-Premium",
    connectedAt: new Date(Date.now() - 86400000).toISOString(),
    disconnectedAt: new Date(Date.now() - 86400000 + 3600000 * 3).toISOString(),
    durationMinutes: 180,
    dataUsedMB: 2100,
    location: "Paris 11e",
    status: "interrupted",
    disconnectReason: "ad_closed"
  }
];

let historyIdCounter = 4;

export const QuotaService = {
  getUsage(): UsageStats {
    return { ...currentUsage };
  },

  startConsumption(onUpdate: (usage: UsageStats) => void) {
    if (consumptionInterval) return;
    consumptionInterval = setInterval(() => {
      const mbPerTick = Math.floor(Math.random() * 15) + 5;
      const minutesPerTick = parseFloat((Math.random() * 0.5 + 0.1).toFixed(1));

      currentUsage.remainingQuotaMB = Math.max(0, currentUsage.remainingQuotaMB - mbPerTick);
      currentUsage.remainingTimeMinutes = Math.max(0, parseFloat((currentUsage.remainingTimeMinutes - minutesPerTick).toFixed(1)));
      currentUsage.todayConsumptionMB += mbPerTick;
      currentUsage.downloadSpeedKbps = Math.floor(Math.random() * 30000) + 15000;
      currentUsage.uploadSpeedKbps = Math.floor(Math.random() * 10000) + 3000;

      onUpdate({ ...currentUsage });
    }, 2000);
  },

  stopConsumption() {
    if (consumptionInterval) {
      clearInterval(consumptionInterval);
      consumptionInterval = null;
    }
  },

  addHistoryEntry(reason: DisconnectReason) {
    const now = new Date();
    const connectedAt = new Date(now.getTime() - currentUsage.todayConsumptionMB > 0 ? 3600000 : 0);
    const durationMinutes = Math.round((now.getTime() - connectedAt.getTime()) / 60000);

    history.unshift({
      id: `c-${historyIdCounter++}`,
      ssid: "WiFi-Zone-Premium",
      connectedAt: connectedAt.toISOString(),
      disconnectedAt: now.toISOString(),
      durationMinutes: Math.max(1, durationMinutes),
      dataUsedMB: currentUsage.todayConsumptionMB,
      location: "Paris 11e",
      status: reason === "user_disconnected" ? "completed" : "interrupted",
      disconnectReason: reason
    });
  },

  getHistory(): ConnectionHistoryItem[] {
    return [...history];
  },

  resetDailyUsage() {
    currentUsage.todayConsumptionMB = 0;
  },

  refillQuota() {
    currentUsage.remainingQuotaMB = TOTAL_QUOTA_MB;
    currentUsage.remainingTimeMinutes = TOTAL_TIME_MINUTES;
    currentUsage.todayConsumptionMB = 0;
  },

  getQuotaPercent(): number {
    return (currentUsage.remainingQuotaMB / currentUsage.totalQuotaMB) * 100;
  },

  getTimePercent(): number {
    return (currentUsage.remainingTimeMinutes / currentUsage.totalTimeMinutes) * 100;
  }
};
