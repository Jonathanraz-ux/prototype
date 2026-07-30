import type { MikrotikSession, MikrotikResponse } from "../types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SESSION: MikrotikSession = {
  id: "mt-session-001",
  username: "jean.dupont@email.com",
  startedAt: "",
  quotaUsedMB: 0,
  quotaTotalMB: 5000,
  timeElapsedMinutes: 0,
  timeTotalMinutes: 60,
  ipAddress: "192.168.100.45",
  macAddress: "A4:83:E7:12:34:56",
  status: "stopped"
};

let currentSession = { ...SESSION };

export const MikrotikService = {
  async login(username: string, password: string): Promise<MikrotikResponse<{ token: string }>> {
    await delay(400);
    if (!username || !password) {
      return { success: false, error: { code: 400, message: "Identifiants requis" } };
    }
    return { success: true, data: { token: "mt-token-" + Date.now() } };
  },

  async logout(): Promise<MikrotikResponse> {
    await delay(200);
    currentSession = { ...SESSION };
    return { success: true };
  },

  async startSession(username: string): Promise<MikrotikResponse<MikrotikSession>> {
    await delay(500);
    currentSession = {
      ...SESSION,
      username,
      startedAt: new Date().toISOString(),
      status: "active"
    };
    return { success: true, data: { ...currentSession } };
  },

  async stopSession(): Promise<MikrotikResponse<MikrotikSession>> {
    await delay(300);
    currentSession.status = "stopped";
    return { success: true, data: { ...currentSession } };
  },

  async checkQuota(): Promise<MikrotikResponse<{ remainingMB: number; remainingMinutes: number }>> {
    await delay(150);
    return {
      success: true,
      data: {
        remainingMB: currentSession.quotaTotalMB - currentSession.quotaUsedMB,
        remainingMinutes: currentSession.timeTotalMinutes - currentSession.timeElapsedMinutes
      }
    };
  },

  async consumeQuota(mb: number, minutes: number): Promise<MikrotikResponse<MikrotikSession>> {
    currentSession.quotaUsedMB = Math.min(currentSession.quotaUsedMB + mb, currentSession.quotaTotalMB);
    currentSession.timeElapsedMinutes = Math.min(currentSession.timeElapsedMinutes + minutes, currentSession.timeTotalMinutes);
    return { success: true, data: { ...currentSession } };
  },

  async disconnect(reason: string): Promise<MikrotikResponse> {
    await delay(200);
    currentSession.status = "stopped";
    return { success: true, data: { disconnectReason: reason } };
  },

  async getSession(): Promise<MikrotikResponse<MikrotikSession>> {
    return { success: true, data: { ...currentSession } };
  }
};
