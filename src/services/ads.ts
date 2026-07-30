import type { AdItem } from "../types";

const MOCK_ADS: AdItem[] = [
  {
    id: "ad-1",
    imageUrl: "",
    title: "NordVPN — Sécurisez votre connexion",
    description: "Protégez vos données avec le leader du VPN. -50% sur l'abonnement 2 ans.",
    advertiser: "NordVPN",
    backgroundColor: "#1a1a2e",
    accentColor: "#E94560"
  },
  {
    id: "ad-2",
    imageUrl: "",
    title: "Freebox Ultra — Jusqu'à 8 Gb/s",
    description: "La fibre la plus rapide de France. Offre spéciale nouveau client.",
    advertiser: "Free",
    backgroundColor: "#1a1a2e",
    accentColor: "#ED1C24"
  },
  {
    id: "ad-3",
    imageUrl: "",
    title: "Canva Pro — Design sans limites",
    description: "Créez des visuels professionnels. Essai gratuit 30 jours.",
    advertiser: "Canva",
    backgroundColor: "#1a1a2e",
    accentColor: "#00C4CC"
  },
  {
    id: "ad-4",
    imageUrl: "",
    title: "Spotify Premium — 3 mois offerts",
    description: "Musique sans pub, en illimité. Offre exclusive utilisateurs WiFi Zone.",
    advertiser: "Spotify",
    backgroundColor: "#1a1a2e",
    accentColor: "#1DB954"
  },
  {
    id: "ad-5",
    imageUrl: "",
    title: "Amazon Prime — Livraison gratuite",
    description: "Livraison illimitée, Vidéo, Musique. 30 jours d'essai gratuit.",
    advertiser: "Amazon",
    backgroundColor: "#1a1a2e",
    accentColor: "#FF9900"
  }
];

let currentAdIndex = 0;
let rotationInterval: ReturnType<typeof setInterval> | null = null;
let adVisible = true;
let adListeners: Array<(visible: boolean) => void> = [];

export const AdService = {
  getCurrentAd(): AdItem {
    return MOCK_ADS[currentAdIndex];
  },

  getAllAds(): AdItem[] {
    return [...MOCK_ADS];
  },

  startRotation(onChange: (ad: AdItem) => void) {
    if (rotationInterval) return;
    rotationInterval = setInterval(() => {
      currentAdIndex = (currentAdIndex + 1) % MOCK_ADS.length;
      onChange(MOCK_ADS[currentAdIndex]);
    }, 6000);
  },

  stopRotation() {
    if (rotationInterval) {
      clearInterval(rotationInterval);
      rotationInterval = null;
    }
  },

  isAdVisible(): boolean {
    return adVisible;
  },

  setAdVisible(visible: boolean) {
    adVisible = visible;
    adListeners.forEach((fn) => fn(visible));
  },

  onAdVisibilityChange(listener: (visible: boolean) => void) {
    adListeners.push(listener);
    return () => {
      adListeners = adListeners.filter((fn) => fn !== listener);
    };
  }
};
