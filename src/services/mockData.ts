import { COLORS } from "../constants/theme";

export const MOCK_USER = {
  id: "u-001",
  firstName: "Jean",
  lastName: "Dupont",
  email: "jean.dupont@email.com",
  phone: "+33 6 12 34 56 78",
  avatar: "",
  plan: "pro" as const,
  createdAt: "2024-01-15"
};

export const MOCK_CONNECTIVITY: import("../types").ConnectivityStatus = {
  connected: true,
  ssid: "WiFi-Zone-Premium",
  signalStrength: 87,
  ipAddress: "192.168.100.45",
  macAddress: "A4:83:E7:12:34:56",
  connectedAt: new Date(Date.now() - 3600000 * 2).toISOString()
};

export const MOCK_USAGE: import("../types").UsageStats = {
  remainingQuotaMB: 4500,
  totalQuotaMB: 10000,
  remainingTimeMinutes: 420,
  totalTimeMinutes: 600,
  todayConsumptionMB: 1250,
  downloadSpeedKbps: 45000,
  uploadSpeedKbps: 12000
};

export const MOCK_CONNECTION_HISTORY: import("../types").ConnectionHistoryItem[] = [
  {
    id: "c-1",
    ssid: "WiFi-Zone-Premium",
    connectedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    disconnectedAt: new Date(Date.now() - 86400000 * 2 + 3600000 * 3).toISOString(),
    durationMinutes: 180,
    dataUsedMB: 2100,
    location: "Paris, France",
    status: "completed"
  },
  {
    id: "c-2",
    ssid: "WiFi-Zone-Basic",
    connectedAt: new Date(Date.now() - 86400000).toISOString(),
    disconnectedAt: new Date(Date.now() - 86400000 + 3600000 * 1.5).toISOString(),
    durationMinutes: 90,
    dataUsedMB: 850,
    location: "Lyon, France",
    status: "completed"
  },
  {
    id: "c-3",
    ssid: "WiFi-Zone-Guest",
    connectedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    disconnectedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    durationMinutes: 60,
    dataUsedMB: 320,
    location: "Marseille, France",
    status: "expired"
  },
  {
    id: "c-4",
    ssid: "WiFi-Zone-Premium",
    connectedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    disconnectedAt: new Date().toISOString(),
    durationMinutes: 120,
    dataUsedMB: 1650,
    location: "Paris, France",
    status: "active"
  }
];

export const MOCK_NOTIFICATIONS: import("../types").Notification[] = [
  {
    id: "n-1",
    title: "Quota presque atteint",
    message: "Vous avez utilisé 75% de votre quota quotidien. Pensez à optimiser votre consommation.",
    type: "quota",
    read: false,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  {
    id: "n-2",
    title: "Offre spéciale",
    message: "Bénéficiez de -50% sur le forfait Pro annuel. Offre à durée limitée !",
    type: "promotion",
    read: false,
    createdAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: "n-3",
    title: "Maintenance programmée",
    message: "Une maintenance est prévue le 25 juillet 2026 de 02h00 à 04h00. Le service pourra être brièvement indisponible.",
    type: "maintenance",
    read: true,
    createdAt: new Date(Date.now() - 172800000).toISOString()
  },
  {
    id: "n-4",
    title: "Forfait renouvelé",
    message: "Votre forfait Pro a été renouvelé avec succès. Accès illimité jusqu'au 15 août 2026.",
    type: "system",
    read: true,
    createdAt: new Date(Date.now() - 604800000).toISOString()
  },
  {
    id: "n-5",
    title: "Bienvenue sur WiFi Zone",
    message: "Merci de nous avoir rejoint ! Profitez d'une connexion haut débit sécurisée.",
    type: "system",
    read: true,
    createdAt: new Date(Date.now() - 259200000).toISOString()
  }
];

export const MOCK_PLANS: import("../types").SubscriptionPlan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    currency: "€",
    duration: "1 month",
    quotaMB: 2048,
    features: ["2 Go de quota quotidien", "1 appareil", "Vitesse standard", "Avec publicités"]
  },
  {
    id: "pro",
    name: "Pro",
    price: 9.99,
    currency: "€",
    duration: "1 month",
    quotaMB: 50000,
    features: ["50 Go de quota quotidien", "3 appareils", "Vitesse premium (50 Mbps)", "Sans publicité", "Support prioritaire"],
    popular: true
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 29.99,
    currency: "€",
    duration: "1 month",
    quotaMB: 200000,
    features: ["200 Go de quota quotidien", "10 appareils", "Vitesse premium (100 Mbps)", "Sans publicité", "Support prioritaire", "API access", "Gestionnaire dédié"],
    recommended: true
  }
];

export const MOCK_DEVICE_INFO: import("../types").DeviceInfo = {
  model: "Samsung Galaxy S24 Ultra",
  osVersion: "Android 14",
  appVersion: "1.0.0",
  deviceId: "dev-a1b2c3d4e5f6",
  macAddress: "A4:83:E7:12:34:56",
  lastConnected: new Date().toISOString()
};

export const DEFAULT_SETTINGS = {
  darkTheme: true,
  language: "fr",
  notificationsEnabled: true,
  biometricEnabled: false,
  autoConnect: true,
  dataSaverMode: false
};

export const SPEED_DATA = Array.from({ length: 12 }, (_, i) => ({
  hour: `${String(i).padStart(2, "0")}:00`,
  download: Math.floor(Math.random() * 40000) + 10000,
  upload: Math.floor(Math.random() * 15000) + 2000
}));

export const QUOTA_DATA = [
  { label: "Utilisé", value: 5500, color: COLORS.danger },
  { label: "Restant", value: 4500, color: COLORS.primaryLight }
];
