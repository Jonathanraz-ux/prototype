// ===========================================
// Types métier de l'application Bôjô
// Ces types reflètent le schéma Supabase (voir supabase/migrations)
// ===========================================

export type AppRole = "user" | "site_manager" | "organization_admin" | "super_admin";

export type LicenseStatus = "pilot" | "active" | "suspended" | "expired" | "revoked";

export type OrganizationStatus = "active" | "suspended" | "onboarding";

export type SiteStatus = "active" | "inactive" | "maintenance";

export type RouterStatus = "active" | "inactive" | "offline" | "maintenance";

export type DeviceStatus = "active" | "blocked" | "inactive";

export type AdCampaignStatus = "draft" | "active" | "paused" | "ended";

export type AdCompletionStatus = "completed" | "abandoned" | "invalidated";

export type WifiSessionStatus =
  | "pending"
  | "authorizing"
  | "authorized"
  | "active"
  | "paused"
  | "disconnected"
  | "expired"
  | "failed";

export type QuotaTransactionType = "grant" | "consume" | "refund" | "adjustment";

export type NotificationType = "promotion" | "maintenance" | "quota" | "system";

// ===========================================
// Utilisateur connecté (profil enrichi dérivé de la table profiles)
// ===========================================
export interface User {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  role: AppRole;
  status: "active" | "suspended" | "pending" | "blocked";
  createdAt: string;
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
}

// ===========================================
// Licence
// ===========================================
export interface LicenseInfo {
  id: string;
  organizationId: string;
  status: LicenseStatus;
  plan: string;
  validFrom: string;
  validUntil: string;
  gracePeriodHours: number;
  maxSites: number;
  maxRouters: number;
  maxAdmins: number;
  features: string[];
}

export type LicenseCheckResult = {
  status: "valid" | "expired" | "suspended" | "revoked" | "unreachable";
  license?: LicenseInfo;
  issuedAt: string;
  expiresAt: string;
};

// ===========================================
// Publicité / Campagnes
// ===========================================
export type AdType = "image" | "video";

export interface AdCampaign {
  id: string;
  title: string;
  advertiserName: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  rewardType: "minutes" | "megabytes" | "mixed";
  rewardValue: number;
  background: string;
  accentColor: string;
  gradient?: [string, string];
  cta: string;
  type: AdType;
}

export interface AvailableCampaignResult {
  campaign?: AdCampaign;
  reason: "available" | "no_campaign" | "daily_limit" | "cooldown" | "suspended" | "backend_error" | "unauthorized";
  nextAvailableAt?: string;
  errorMessage?: string;
  isDemo?: boolean;
}

export interface StartAdViewResult {
  viewId: string;
  campaign: AdCampaign;
  expiresAt: string;
}

export interface CompleteAdViewResult {
  success: boolean;
  rewardGranted: boolean;
  viewId: string;
  reason?: "completed" | "already_completed" | "invalid" | "too_early" | "expired";
}

// ===========================================
// Quotas / Utilisation
// ===========================================
export interface UsageStats {
  remainingQuotaMB: number;
  totalQuotaMB: number;
  remainingTimeMinutes: number;
  totalTimeMinutes: number;
  todayConsumptionMB: number;
  downloadSpeedKbps?: number;
  uploadSpeedKbps?: number;
  // Unité SERVEUR/RÉSEAU : octets (relation 1:1 avec les compteurs
  // MikroTik). Les champs « MB » ci-dessus sont l'affichage dérivé.
  totalBytes?: number;
  remainingBytes?: number;
  consumedBytes?: number;
}

// ===========================================
// Device
// ===========================================
export interface DeviceInfo {
  installationId: string;
  platform: string;
  appVersion: string;
}

// ===========================================
// Sessions Wi-Fi
// ===========================================
export interface WifiSession {
  id: string;
  status: WifiSessionStatus;
  startedAt?: string;
  endedAt?: string;
  allocatedBytes?: number;
  consumedBytes?: number;
  authorizationState?: string;
  adState?: string;
  routerSessionReference?: string;
  heartbeatExpiresAt?: string;
  disconnectReason?: string;
}

export interface SessionUsage {
  consumedSeconds: number;
  consumedBytes: number;
  available: boolean;
}

// ===========================================
// Historique
// ===========================================
export interface ConnectionHistoryItem {
  id: string;
  connectedAt: string;
  disconnectedAt?: string;
  durationMinutes: number;
  dataUsedMB?: number;
  status: "active" | "completed" | "expired" | "interrupted";
  disconnectReason?: DisconnectReason;
}

// ===========================================
// Notifications
// ===========================================
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
}

// ===========================================
// État de connexion (machine à états, orientée serveur)
// ===========================================
export type ConnectionState =
  | "idle"
  | "ad_loading"
  | "ad_active"
  | "authorizing_wifi"
  | "wifi_active"
  | "paused"
  | "quota_exhausted"
  | "error"
  | "disconnecting";

export type InternetStatus = "active" | "cut" | "suspended";

// Motifs ALIGNÉS sur la base (session-machine.ts côté serveur). Le
// client ne fait que refléter ce que le serveur décide.
export type DisconnectReason =
  | "USER_PAUSED_AD"
  | "APP_BACKGROUND"
  | "USER_LOGOUT"
  | "HEARTBEAT_TIMEOUT"
  | "QUOTA_EXHAUSTED"
  | "NETWORK_LOST"
  | "ADMIN_DISCONNECT"
  | "ROUTER_ERROR";

export interface ConnectivityStatus {
  connected: boolean;
  state: ConnectionState;
  internetStatus: InternetStatus;
  ssid?: string;
  signalStrength: number;
  ipAddress?: string;
  connectedAt?: string;
  disconnectReason?: DisconnectReason;
}

// ===========================================
// Navigation
// ===========================================
export type TabParamList = {
  dashboard: undefined;
  browse: undefined;
  history: undefined;
  profile: undefined;
};
