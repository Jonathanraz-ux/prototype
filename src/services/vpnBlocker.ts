import { NativeModules, NativeEventEmitter, Platform } from "react-native";
import { logger } from "../lib/logger";

const TAG = "vpn:blocker";

export type VpnState =
  | "DISABLED"
  | "PERMISSION_REQUIRED"
  | "BLOCKING"
  | "BLOCKED"
  | "ALLOWING"
  | "ALLOWED"
  | "ERROR";

export interface VpnBlockerStatus {
  consentGranted: boolean;
  state: VpnState;
  tunnelUp: boolean;
  serviceRunning: boolean;
  generation: number;
  authTtlMs: number;
}

export interface VpnBlockerEvent {
  state: VpnState;
  tunnelUp: boolean;
  authExpiresAt: number;
  generation: number;
}

interface NativeVpnBlockerInterface {
  isConsentGranted(): Promise<{ granted: boolean }>;
  prepare(): Promise<{ granted: boolean; cancelled: boolean; error?: string }>;
  startBlocking(): Promise<{ ok: boolean; state: string }>;
  setAuthorized(
    generation: number,
    ttlMs: number
  ): Promise<{
    ok: boolean;
    authExpiresAt?: number;
    generation?: number;
    reason?: string;
    currentGeneration?: number;
  }>;
  blockNow(): Promise<{ ok: boolean; state: string }>;
  invalidateGeneration(): Promise<{ ok: boolean; generation: number; state: string }>;
  getStatus(): Promise<VpnBlockerStatus>;
  stop(): Promise<{ ok: boolean }>;
  logTrace(message: string): void;
}

const NativeModule: NativeVpnBlockerInterface | undefined = NativeModules.VpnBlocker;

class VpnBlockerService {
  private emitter: NativeEventEmitter | null = null;
  private currentGeneration = 1;

  constructor() {
    if (Platform.OS === "android" && NativeModule) {
      this.emitter = new NativeEventEmitter(NativeModules.VpnBlocker);
    }
  }

  isAvailable(): boolean {
    return Platform.OS === "android" && Boolean(NativeModule);
  }

  async isConsentGranted(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      const res = await NativeModule!.isConsentGranted();
      return res.granted;
    } catch (e) {
      logger.warn(TAG, "Erreur isConsentGranted", e);
      return false;
    }
  }

  async requestConsent(): Promise<{ granted: boolean; cancelled: boolean }> {
    if (!this.isAvailable()) {
      return { granted: false, cancelled: false };
    }
    try {
      const res = await NativeModule!.prepare();
      return { granted: res.granted, cancelled: res.cancelled ?? false };
    } catch (e) {
      logger.error(TAG, "Erreur prepare()", e);
      return { granted: false, cancelled: false };
    }
  }

  async startBlocking(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      const res = await NativeModule!.startBlocking();
      return res.ok;
    } catch (e) {
      logger.error(TAG, "Erreur startBlocking()", e);
      return false;
    }
  }

  async setAuthorized(ttlMs: number): Promise<{ ok: boolean; generation: number; reason?: string }> {
    if (!this.isAvailable()) {
      return { ok: false, generation: this.currentGeneration, reason: "native_unavailable" };
    }
    try {
      const res = await NativeModule!.setAuthorized(this.currentGeneration, ttlMs);
      return {
        ok: res.ok,
        generation: this.currentGeneration,
        reason: res.reason,
      };
    } catch (e) {
      logger.error(TAG, "Erreur setAuthorized()", e);
      return { ok: false, generation: this.currentGeneration, reason: "native_error" };
    }
  }

  async blockNow(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      const res = await NativeModule!.blockNow();
      return res.ok;
    } catch (e) {
      logger.error(TAG, "Erreur blockNow()", e);
      return false;
    }
  }

  async invalidateGeneration(): Promise<number> {
    this.currentGeneration += 1;
    if (!this.isAvailable()) return this.currentGeneration;
    try {
      const res = await NativeModule!.invalidateGeneration();
      this.currentGeneration = Math.round(res.generation);
      return this.currentGeneration;
    } catch (e) {
      logger.error(TAG, "Erreur invalidateGeneration()", e);
      return this.currentGeneration;
    }
  }

  async getStatus(): Promise<VpnBlockerStatus> {
    if (!this.isAvailable()) {
      return {
        consentGranted: false,
        state: "DISABLED",
        tunnelUp: false,
        serviceRunning: false,
        generation: this.currentGeneration,
        authTtlMs: 0,
      };
    }
    try {
      const status = await NativeModule!.getStatus();
      return {
        ...status,
        generation: Math.round(status.generation),
        authTtlMs: Math.round(status.authTtlMs),
      };
    } catch (e) {
      logger.error(TAG, "Erreur getStatus()", e);
      return {
        consentGranted: false,
        state: "ERROR",
        tunnelUp: false,
        serviceRunning: false,
        generation: this.currentGeneration,
        authTtlMs: 0,
      };
    }
  }

  async stop(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      const res = await NativeModule!.stop();
      return res.ok;
    } catch (e) {
      logger.error(TAG, "Erreur stop()", e);
      return false;
    }
  }

  trace(message: string): void {
    if (Platform.OS === "android" && NativeModule) {
      try {
        NativeModule.logTrace(message);
      } catch (e) {
        // ignore
      }
    }
  }

  addStateListener(listener: (event: VpnBlockerEvent) => void): () => void {
    if (!this.emitter) {
      return () => {};
    }
    const sub = this.emitter.addListener("VpnBlockerStateChange", (raw: any) => {
      const evtGeneration = Number(raw.generation ?? 0);
      if (evtGeneration > 0) {
        this.currentGeneration = evtGeneration;
      }
      listener({
        state: raw.state as VpnState,
        tunnelUp: Boolean(raw.tunnelUp),
        authExpiresAt: Number(raw.authExpiresAt ?? 0),
        generation: evtGeneration,
      });
    });
    return () => sub.remove();
  }
}

export const vpnBlocker = new VpnBlockerService();
