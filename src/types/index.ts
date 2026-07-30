export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  plan: "free" | "pro" | "enterprise";
  createdAt: string;
}

export type ConnectionState =
  | "deconnected"
  | "connecting"
  | "connected"
  | "ad_found"
  | "ad_missing"
  | "quota_exhausted"
  | "suspended"
  | "network_error";

export type InternetStatus = "active" | "cut" | "suspended";

export type DisconnectReason =
  | "ad_closed"
  | "ad_hidden"
  | "quota_exhausted"
  | "session_expired"
  | "network_error"
  | "user_disconnected"
  | "suspended";

export interface ConnectivityStatus {
  connected: boolean;
  state: ConnectionState;
  internetStatus: InternetStatus;
  ssid?: string;
  signalStrength: number;
  ipAddress?: string;
  macAddress?: string;
  connectedAt?: string;
  disconnectReason?: DisconnectReason;
}

export interface UsageStats {
  remainingQuotaMB: number;
  totalQuotaMB: number;
  remainingTimeMinutes: number;
  totalTimeMinutes: number;
  todayConsumptionMB: number;
  downloadSpeedKbps: number;
  uploadSpeedKbps: number;
}

export interface ConnectionHistoryItem {
  id: string;
  ssid: string;
  connectedAt: string;
  disconnectedAt: string;
  durationMinutes: number;
  dataUsedMB: number;
  location: string;
  status: "active" | "completed" | "expired" | "interrupted";
  disconnectReason?: DisconnectReason;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "promotion" | "maintenance" | "quota" | "system";
  read: boolean;
  createdAt: string;
  action?: {
    label: string;
    route?: string;
  };
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  duration: string;
  quotaMB: number;
  features: string[];
  popular?: boolean;
  recommended?: boolean;
}

export interface DeviceInfo {
  model: string;
  osVersion: string;
  appVersion: string;
  deviceId: string;
  macAddress: string;
  lastConnected: string;
}

export interface AdItem {
  id: string;
  imageUrl: string;
  title: string;
  description: string;
  advertiser: string;
  backgroundColor: string;
  accentColor: string;
}

export interface MikrotikSession {
  id: string;
  username: string;
  startedAt: string;
  quotaUsedMB: number;
  quotaTotalMB: number;
  timeElapsedMinutes: number;
  timeTotalMinutes: number;
  ipAddress: string;
  macAddress: string;
  status: "active" | "stopped" | "suspended";
}

export interface MikrotikResponse<T = void> {
  success: boolean;
  data?: T;
  error?: {
    code: number;
    message: string;
  };
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
}

export type TabParamList = {
  dashboard: undefined;
  history: undefined;
  notifications: undefined;
  profile: undefined;
  settings: undefined;
};
