import type { ConnectionState } from "../types";

// ============================================================
// Bôjô — Politique d'accès à la navigation intégrée.
//
// Étape B — Séparation des modes :
//  - contrôle de la navigation DANS l'application (ce module) ;
//  - filtrage VPN local (VpnBlockerService, indépendant) ;
//  - contrôle réseau MikroTik (phase suivante, adaptateur dédié).
//
// Ce module n'affirme JAMAIS un contrôle global du Wi-Fi ni du
// routeur : la portée du contrôle exercé ici est uniquement la
// WebView intégrée de Bôjô. La règle : la navigation n'est permise
// que lorsque les conditions de session ET d'affichage publicitaire
// sont satisfaites. Tout autre état suspend la navigation réellement
// (masquage + arrêt de la WebView), jamais par un simple libellé.
// ============================================================

/** Transport réseau actif, tel que rapporté par le système Android. */
export type NetworkTransport = "wifi" | "cellular" | "unknown" | "none";

/** Portée réelle du contrôle exercé sur la navigation. */
export type BrowseControlScope = "in_app_browser" | "local_vpn" | "router";

/** Source de mesure du quota affiché à l'utilisateur. */
export type MeterSource = "router_counters" | "simulated" | "unavailable";

/** Nature réelle ou simulée du contrôle réseau. */
export type ControlNature = "real" | "simulated" | "none";

export interface BrowseCapabilities {
  navigationControlScope: BrowseControlScope;
  claimsRouterControl: boolean;
  meterSource: MeterSource;
  networkControlNature: ControlNature;
}

/**
 * Capacités explicites du mode courant. Le seul contrôle de navigation
 * exercé par cette couche est « in_app_browser » (la WebView de Bôjô).
 * Le mode VPN local (android_vpn_demo) est une SIMULATION locale : il ne
 * prétend ni administrer le routeur ni mesurer le trafic.
 */
export function browserCapabilities(opts: {
  networkMode?: string;
  providerKind?: string;
}): BrowseCapabilities {
  const mode = opts.networkMode ?? "not_configured";
  const kind = opts.providerKind ?? "unconfigured";
  const isLive = kind === "live";
  return {
    navigationControlScope: "in_app_browser",
    claimsRouterControl: isLive && mode === "mikrotik",
    meterSource: isLive ? "router_counters" : "simulated",
    networkControlNature: isLive ? "real" : "simulated",
  };
}

// ————————————————————————————————————————————————————————————
// Décision d'accès à la navigation
// ————————————————————————————————————————————————————————————

/** États pendant lesquels les conditions session + publicité sont satisfaites. */
export const BROWSING_STATES: ReadonlySet<ConnectionState> = new Set([
  "ad_active", // publicité à l'écran, session en cours d'acquisition
  "wifi_active", // session autorisée, publicité affichée (boucle)
]);

export type BrowseGateReason =
  | "preparing_ad"
  | "authorizing"
  | "verifying"
  | "paused"
  | "quota_exhausted"
  | "error"
  | "disconnecting"
  | "no_session"
  | "offline"
  | "cellular";

/**
 * Decision d'accès à la navigation.
 *
 * `preservePage` indique si la page DÉJÀ CHARGÉE peut rester montée (gelée,
 * navigation bloquée, médias arrêtés) derrière un voile, en attendant une
 * reprise courte (vérification, autorisation, pause). Quand c'est `false`,
 * l'absence d'accès est réelle et durable (offline, session finie, quota) :
 * la WebView est démontée.
 */
export interface BrowseGateDecision {
  allowed: boolean;
  reason: BrowseGateReason | null;
  preservePage: boolean;
}

/**
 * Politique pure de navigation.
 *
 * - transport "none" AVEC notre tunnel VPN actif (`vpnTunnelUp` true) → ce
 *   n'est PAS une perte de Wi-Fi : c'est NOTRE tunnel (autorisation native
 *   échue/en cours de renouvellement) qui est devenu l'interface par défaut.
 *   On n'affiche donc JAMAIS « Aucune connexion » (raison "verifying"), et on
 *   préserve la page tant que la re-validation serveur peut reprendre.
 * - transport "none" SANS tunnel VPN → réellement hors ligne → "offline".
 * - transport "cellular" + requireWifi → suspendu (passage sur données
 *   mobiles : Bôjô n'est plus sur le Wi-Fi du point d'accès).
 * - transport "unknown" → ne suspend pas (module absent ou source OS
 *   indéterminée : on ne fabrique pas de fausse certitude).
 * - état session/pub insatisfait → suspendu avec motif explicite.
 */
export function browseGateDecision(opts: {
  state: ConnectionState;
  bannerPresent: boolean;
  transport: NetworkTransport;
  requireWifi: boolean;
  vpnTunnelUp?: boolean;
}): BrowseGateDecision {
  const { state, bannerPresent, transport, requireWifi } = opts;
  const vpnTunnelUp = opts.vpnTunnelUp ?? false;

  if (transport === "none" && vpnTunnelUp) {
    // Notre propre tunnel bloque : la session est en cours de re-validation,
    // la page déjà chargée est conservée (gelée) plutôt que détruite.
    return { allowed: false, reason: "verifying", preservePage: true };
  }
  if (transport === "none") {
    return { allowed: false, reason: "offline", preservePage: false };
  }
  if (transport === "cellular" && requireWifi) {
    return { allowed: false, reason: "cellular", preservePage: false };
  }

  if (BROWSING_STATES.has(state)) {
    // En session validée (wifi_active), la publicité a déjà été regardée :
    // la bannière persistante reste affichée. Pendant ad_active, la
    // publicité doit réellement être à l'écran (currentAd présent).
    const adSatisfied = state === "wifi_active" || bannerPresent;
    if (!adSatisfied) {
      return { allowed: false, reason: "preparing_ad", preservePage: true };
    }
    return { allowed: true, reason: null, preservePage: true };
  }

  switch (state) {
    case "ad_loading":
      return { allowed: false, reason: "preparing_ad", preservePage: true };
    case "authorizing_wifi":
      return { allowed: false, reason: "authorizing", preservePage: true };
    case "paused":
      return { allowed: false, reason: "paused", preservePage: true };
    case "quota_exhausted":
      return { allowed: false, reason: "quota_exhausted", preservePage: false };
    case "error":
      return { allowed: false, reason: "error", preservePage: false };
    case "disconnecting":
      return { allowed: false, reason: "disconnecting", preservePage: true };
    case "idle":
    default:
      return { allowed: false, reason: "no_session", preservePage: false };
  }
}

/** Texte de l'écran de suspension (aucune promesse d'attention publicitaire). */
export function browseSuspensionText(
  reason: BrowseGateReason
): { title: string; message: string } {
  switch (reason) {
    case "preparing_ad":
      return {
        title: "Préparation de la publicité…",
        message: "L'accès s'ouvre dès que la publicité est prête et que la session démarre.",
      };
    case "authorizing":
      return {
        title: "Autorisation de l'accès…",
        message: "Le serveur confirme votre session. La navigation reprend toute seule.",
      };
    case "verifying":
      return {
        title: "Vérification de l'accès…",
        message: "L'accès est en cours de contrôle. La navigation reprend dès confirmation.",
      };
    case "paused":
      return {
        title: "Session en pause",
        message: "Reprenez la session depuis l'Accueil pour continuer à naviguer.",
      };
    case "quota_exhausted":
      return {
        title: "Quota de données épuisé",
        message: "Le quota n'est pas renouvelé automatiquement. Contactez un administrateur.",
      };
    case "error":
      return {
        title: "Connexion interrompue",
        message: "Réessayez depuis l'Accueil. La navigation se rouvrira après vérification.",
      };
    case "disconnecting":
      return {
        title: "Déconnexion en cours…",
        message: "L'accès à Internet est en cours de coupure.",
      };
    case "no_session":
      return {
        title: "Hors session",
        message: "Regardez une publicité depuis l'Accueil pour accéder à Internet.",
      };
    case "offline":
      return {
        title: "Aucune connexion",
        message: "Vérifiez votre connexion Wi-Fi, puis revenez à l'Accueil.",
      };
    case "cellular":
      return {
        title: "Données mobiles détectées",
        message: "La navigation Bôjô est suspendue hors Wi-Fi pour préserver votre forfait.",
      };
  }
}