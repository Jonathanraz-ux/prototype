import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  useWindowDimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  WebView,
  type WebViewNavigation,
} from "react-native-webview";
import {
  ArrowUpRight,
  Globe,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
} from "lucide-react-native";
import { COLORS, RADIUS } from "../../../../constants/theme";
import AppHeader from "../../../../components/AppHeader";
import BrowseAdBanner from "../../../../components/BrowseAdBanner";
import BrowseSuspensionScreen from "../../../../components/BrowseSuspensionScreen";
import BrowseSuspensionOverlay from "../../../../components/BrowseSuspensionOverlay";
import { useConnection } from "../../../../contexts/ConnectionContext";
import { useNetworkTransport } from "../../../../services/networkTransport";
import { FLOATING_NAV_CLEARANCE } from "../../../../lib/floatingNav";
import { browseAdZoneHeight, browseWebZoneHeight } from "../../../../lib/browseLayout";
import { useKeyboardVisible } from "../../../../hooks/useKeyboardVisible";
import {
  browseGateDecision,
  type BrowseGateReason,
} from "../../../../lib/browsePolicy";
import { normalizeBrowserInput, googleSearchUrl, GOOGLE_HOME_URL } from "../../../../lib/browser";

// Compatibilité "nouvelle fenêtre" : les liens target="_blank" et window.open
// sont réécrits pour s'ouvrir dans LA MÊME WebView. Combiné à
// setSupportMultipleWindows={false}, aucun navigateur ou application externe
// n'est lancé silencieusement. Aucune injection publicitaire.
const NEW_WINDOW_HANDLER_JS = `
(function () {
  try {
    var winOpen = window.open;
    window.open = function (url) {
      if (typeof url === "string" && url.indexOf("http") === 0 && window.location.href !== url) {
        window.location.href = url;
      }
      return null;
    };
    document.addEventListener("click", function (e) {
      var el = e.target || e.srcElement;
      while (el && el.nodeName !== "A") { el = el.parentNode; }
      if (el && el.getAttribute("target") === "_blank" && el.href) {
        e.preventDefault();
        window.location.href = el.href;
      }
    }, true);
  } catch (err) {}
})();
true;
`;

// Arrêt des médias (audio/vidéo) de la page chargée avant démontage de la
// WebView en suspension. Aucune injection publicitaire, aucun autre accès.
const STOP_MEDIA_JS = `
(function () {
  try {
    var m = document.querySelectorAll("video,audio");
    for (var i = 0; i < m.length; i++) { m[i].pause(); }
  } catch (err) {}
})();
true;
`;

function shouldIgnoreWebError(code: string | number): boolean {
  if (code === "ERR_ABORTED" || code === "-999" || code === "-1" || code === -999 || code === -1) return true;
  return false;
}

interface BrowseError {
  title: string;
  detail: string;
}

interface WebErrorEvent {
  nativeEvent: { code: string | number; description: string };
}

interface WebHttpErrorEvent {
  nativeEvent: { statusCode: number; url: string };
}

interface LoadRequest {
  url: string;
}

interface NavState {
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  currentUrl: string;
}

const INITIAL_NAV: NavState = { canGoBack: false, canGoForward: false, loading: true, currentUrl: GOOGLE_HOME_URL };

/**
 * Écran « Naviguer ».
 *
 * Deux zones de hauteur CALCULÉE sur la surface réellement disponible
 * (hauteur de fenêtre − barres système), sans chevauchement :
 *
 *   ┌──────────────────────────────┐  ← 2/3 : navigateur
 *   │ en-tête compact (1 ligne)    │
 *   │ barre d'adresse              │
 *   │ précédent / suivant /        │
 *   │ actualiser / page Google     │
 *   │ WebView (tout l'espace       │
 *   │ restant, pleine largeur)     │
 *   ├──────────────────────────────┤  ← 1/3 : zone publicitaire
 *   │ création PUB en « contain »  │  (fixe au défilement de la page,
 *   │ [Accueil] [Naviguer]         │   les boutons flottants sont
 *   └──────────────────────────────┘   superposés dans sa partie basse)
 *
 * La publicité est une place RÉSERVÉE dans la mise en page (frère de la
 * WebView, jamais un overlay) : elle ne peut donc ni recouvrir la WebView
 * ni être comprimée par la navigation.
 */
export default function BrowseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const webRef = useRef<WebView>(null);
  const { height: windowHeight } = useWindowDimensions();
  const keyboardVisible = useKeyboardVisible();

  const { state, currentAd, vpnStatus, renewNow } = useConnection();
  const transport = useNetworkTransport(5000);

  const [input, setInput] = useState(GOOGLE_HOME_URL);
  const [sourceUrl, setSourceUrl] = useState(GOOGLE_HOME_URL);
  const [navState, setNavState] = useState<NavState>(INITIAL_NAV);
  const [editing, setEditing] = useState(false);
  const [loadError, setLoadError] = useState<BrowseError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resumeNonce, setResumeNonce] = useState(0);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hauteur RÉELLEMENT exploitable : la fenêtre moins les barres système
  // Android (barre de statut en haut, barre de navigation / gestes en bas).
  // La répartition 2/3 − 1/3 en découle, sans valeur codée en dur.
  const usableHeight = Math.max(0, windowHeight - insets.top - insets.bottom);
  const zoneOptions = useMemo(
    () => ({ usableHeight, keyboardVisible }),
    [usableHeight, keyboardVisible]
  );
  const webZoneHeight = browseWebZoneHeight(zoneOptions);
  const adZoneHeight = browseAdZoneHeight(zoneOptions);
  // Les boutons flottants se retirent au clavier ouvert : la marge interne
  // de la publicité disparaît avec eux (aucune place vide béante).
  const adContentInset = keyboardVisible ? 0 : FLOATING_NAV_CLEARANCE;

  // Décision pure de navigation (session + publicité + réseau). La WebView
  // n'est montée qu'à l'état autorisé ; toute autre condition suspend
  // réellement la navigation (démontage, arrêt chargements et médias).
  const bannerPresent = Boolean(currentAd);
  // Notre tunnel VPN natif est-il l'interface par défaut ? Si oui, un
  // transport « none » n'est pas une perte de Wi-Fi : c'est notre propre
  // blocage (autorisation en cours de re-validation) → jamais « offline ».
  const vpnTunnelUp = vpnStatus?.tunnelUp ?? false;
  const gate = browseGateDecision({
    state,
    bannerPresent,
    transport,
    requireWifi: true,
    vpnTunnelUp,
  });
  const suspended = !gate.allowed;
  const suspendReason = gate.reason as BrowseGateReason | null;
  // Page déjà chargée conservée (gelée) au lieu d'être détruite : les
  // suspensions COURTES (vérification, autorisation, pause, préparation)
  // ne démolissent plus l'URL/historique/contenu de la page en cours.
  const preserve = Boolean(gate.preservePage);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const preservedRef = useRef(false);

  // Suspension effective : arrêt des chargements/médias de la page. Si la
  // suspension est COURTE (verifying/authorizing/paused/preparing_ad), la page
  // et son historique sont CONSERVÉS (gelés derrière le voile) ; sinon
  // (offline, fin de session, quota, erreur), la WebView est démontée et la
  // reprise repart proprement sur l'accueil Google (nouvelle instance).
  useEffect(() => {
    if (suspended) {
      webRef.current?.stopLoading();
      webRef.current?.injectJavaScript(STOP_MEDIA_JS);
      if (preserve) {
        preservedRef.current = true;
        return;
      }
      preservedRef.current = false;
      setNavState(INITIAL_NAV);
      setLoadError(null);
      return;
    }
    if (preservedRef.current) {
      // Reprise après une suspension courte : pas de remontée, la page
      // redevient simplement interactive (médias gérés par la bannière).
      preservedRef.current = false;
      setLoadError(null);
      setNotice(null);
      return;
    }
    setSourceUrl(GOOGLE_HOME_URL);
    setInput(GOOGLE_HOME_URL);
    setLoadError(null);
    setNotice(null);
    setResumeNonce((n) => n + 1);
  }, [suspended, preserve]);

  const navigate = useCallback((targetUrl: string) => {
    if (suspendedRef.current) return;
    Keyboard.dismiss();
    setEditing(false);
    setNotice(null);
    if (targetUrl === sourceUrl && !navState.loading) {
      webRef.current?.reload();
      return;
    }
    setSourceUrl(targetUrl);
    setInput(targetUrl);
    // Battement d'autorisation immédiat au démarrage d'une navigation
    // (complémentaire du battement périodique — jamais un remplacement) :
    // réduit les fenêtres sans renouvellement pendant l'usage du navigateur.
    void renewNow();
  }, [sourceUrl, navState.loading, renewNow]);

  // La recherche textuelle ouvre une recherche Google correctement encodée.
  const submit = useCallback(() => {
    if (suspendedRef.current) return;
    const target = normalizeBrowserInput(input);
    if (target.kind === "invalid") {
      setNotice(target.reason);
      return;
    }
    if (target.kind === "home") {
      navigate(GOOGLE_HOME_URL);
      return;
    }
    if (target.kind === "search") {
      navigate(googleSearchUrl(target.query));
      return;
    }
    navigate(target.url);
  }, [input, navigate]);

  const handleNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    setNavState({
      canGoBack: nav.canGoBack,
      canGoForward: nav.canGoForward,
      loading: nav.loading,
      currentUrl: nav.url,
    });
    if (!editing) {
      setInput(nav.url || GOOGLE_HOME_URL);
    }
  }, [editing]);

  const handleLoadStart = useCallback(() => {
    setLoadError(null);
    setNavState((prev) => ({ ...prev, loading: true }));
  }, []);

  const handleWebError = useCallback((event: WebErrorEvent) => {
    const { code, description } = event.nativeEvent;
    if (shouldIgnoreWebError(code)) return;
    setLoadError({
      title: "Impossible de charger la page",
      detail: description || String(code) || "Erreur réseau",
    });
  }, []);

  const handleHttpError = useCallback((event: WebHttpErrorEvent) => {
    const { statusCode, url } = event.nativeEvent;
    // Les erreurs 4xx/5xx ne coupent pas l'affichage : on signale la réponse.
    if (statusCode >= 500) {
      setLoadError({
        title: `Le serveur a répondu (${statusCode})`,
        detail: "Erreur de connexion au site demandé.",
      });
    }
    // Conserve l'URL réelle pour le retour à la recherche Google.
    if (url) setInput(url);
  }, []);

  const shouldStartLoad = useCallback((request: LoadRequest): boolean => {
    // Pendant une suspension, AUCUNE nouvelle navigation n'est autorisée
    // (garde-fou en plus du démontage). Hors suspension : seul http/https
    // est autorisé dans la WebView — les autres schémas (mailto:, tel:,
    // intent:, geo:, etc.) ne déclenchent AUCUNE application externe. Les
    // protections TLS ne sont jamais désactivées.
    if (suspendedRef.current) return false;
    const scheme = request.url.split(":")[0].toLowerCase();
    return scheme === "http" || scheme === "https";
  }, []);

  // Auto-effacement du message d'avertissement (protocole invalide…).
  useEffect(() => {
    if (!notice) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [notice]);

  const renderToolbarButton = (opts: {
    onPress: () => void;
    disabled?: boolean;
    accessibilityLabel: string;
    children: React.ReactNode;
  }) => (
    <Pressable
      onPress={opts.onPress}
      disabled={opts.disabled}
      hitSlop={6}
      accessibilityLabel={opts.accessibilityLabel}
      style={({ pressed }) => [
        styles.toolButton,
        { opacity: opts.disabled ? 0.35 : pressed ? 0.7 : 1 }
      ]}
    >
      {opts.children}
    </Pressable>
  );

  return (
    // paddingTop/Bottom = EXACTEMENT les insets système : la somme des deux
    // zones (webZoneHeight + adZoneHeight) remplit alors la hauteur utile au
    // pixel près, sans débordement sous la barre de navigation Android.
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* ── Zone navigateur : deux tiers supérieurs ───────────────────── */}
      <View style={[styles.browserZone, { height: webZoneHeight }]}>
        {/* En-tête compact : une seule ligne, slogan inclus (l'inset haut est
            déjà posé par l'écran — pas de double marge système). */}
        <View style={styles.headerRow}>
          <AppHeader
            title="Naviguer"
            subtitle="Internet Bôjô pour tous"
            applyTopInset={false}
            compact
            horizontalPadding={0}
          />
        </View>

        <View style={styles.addressRow}>
          <View style={styles.inputWrap}>
            <Globe color={COLORS.textSecondary} size={16} />
            <TextInput
              value={input}
              onChangeText={setInput}
              onSubmitEditing={submit}
              onFocus={() => setEditing(true)}
              onBlur={() => setEditing(false)}
              returnKeyType="go"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              keyboardAppearance="dark"
              style={styles.input}
              selectTextOnFocus
              editable={!suspended}
              accessibilityLabel="Adresse ou recherche"
            />
            {navState.loading && (
              <ActivityIndicator size="small" color={COLORS.actionFg} />
            )}
          </View>

          <Pressable
            disabled={suspended}
            onPress={submit}
            hitSlop={6}
            accessibilityLabel="Aller à l'adresse ou lancer la recherche"
            style={({ pressed }) => [
              styles.goButton,
              { opacity: suspended ? 0.4 : pressed ? 0.7 : 1 }
            ]}
          >
            <ArrowUpRight color={COLORS.actionFg} size={20} />
          </Pressable>
        </View>

        {/* Commandes utiles : précédent, suivant, actualiser et retour à la
            page de DÉPART du navigateur. Ce dernier bouton est étiqueté
            « Google » (icône Globe) pour ne pas être confondu avec l'onglet
            « Accueil » de Bôjô (icône Home, bouton flottant). */}
        <View style={styles.toolbar}>
          {renderToolbarButton({
            onPress: () => webRef.current?.goBack(),
            disabled: suspended || !navState.canGoBack,
            accessibilityLabel: "Page précédente",
            children: <ChevronLeft color={COLORS.textPrimary} size={20} />,
          })}
          {renderToolbarButton({
            onPress: () => webRef.current?.goForward(),
            disabled: suspended || !navState.canGoForward,
            accessibilityLabel: "Page suivante",
            children: <ChevronRight color={COLORS.textPrimary} size={20} />,
          })}
          {renderToolbarButton({
            onPress: () =>
              navState.loading ? webRef.current?.stopLoading() : webRef.current?.reload(),
            disabled: suspended,
            accessibilityLabel: navState.loading ? "Arrêter le chargement" : "Actualiser",
            children: (
              <View style={styles.refreshWrap}>
                {navState.loading ? (
                  <ActivityIndicator size="small" color={COLORS.textPrimary} />
                ) : (
                  <RefreshCw color={COLORS.textPrimary} size={19} />
                )}
              </View>
            ),
          })}
          <View style={styles.toolbarSpacer} />
          <Pressable
            disabled={suspended}
            onPress={() => navigate(GOOGLE_HOME_URL)}
            hitSlop={6}
            accessibilityLabel="Page de départ du navigateur (Google)"
            style={({ pressed }) => [
              styles.toolButton,
              styles.browserHome,
              { opacity: suspended ? 0.35 : pressed ? 0.7 : 1 }
            ]}
          >
            <Globe color={COLORS.actionFg} size={16} />
            <Text style={styles.browserHomeText}>Google</Text>
          </Pressable>
        </View>

        {notice ? (
          <View style={styles.noticeRow}>
            <AlertTriangle color={COLORS.warning} size={13} />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {/* La WebView occupe TOUT l'espace restant de la zone supérieure,
            sans grandes marges inutile. */}
        <View style={styles.webArea}>
          {suspended && !preserve ? (
            <BrowseSuspensionScreen
              reason={suspendReason ?? "no_session"}
              onGoHome={() => router.push("/(app)/(tabs)/dashboard")}
            />
          ) : (
            <View style={styles.webFrame}>
              <WebView
                key={`web-${resumeNonce}`}
                ref={webRef}
                source={{ uri: sourceUrl }}
                style={styles.webview}
                startInLoadingState
                javaScriptEnabled
                domStorageEnabled
                thirdPartyCookiesEnabled
                decelerationRate="normal"
                allowsBackForwardNavigationGestures
                setSupportMultipleWindows={false}
                originWhitelist={["http://*", "https://*"]}
                mixedContentMode="never"
                allowsFullscreenVideo={false}
                injectedJavaScript={NEW_WINDOW_HANDLER_JS}
                onShouldStartLoadWithRequest={shouldStartLoad}
                onLoadStart={handleLoadStart}
                onNavigationStateChange={handleNavigationStateChange}
                onError={handleWebError}
                onHttpError={handleHttpError}
              />
              {suspended && preserve && (
                <BrowseSuspensionOverlay
                  reason={suspendReason ?? "verifying"}
                  onRetry={() => {
                    // Re-validation immédiate : la page reste gelée tant que
                    // l'accès n'est pas re-confirmé (aucune navigation possible).
                    void renewNow();
                  }}
                />
              )}
            </View>
          )}

          {!suspended && loadError && (
            <View style={styles.errorOverlay}>
              <View style={styles.errorIcon}>
                <AlertTriangle color={COLORS.warning} size={26} />
              </View>
              <Text style={styles.errorTitle}>{loadError.title}</Text>
              <Text style={styles.errorDetail}>{loadError.detail}</Text>
              <View style={styles.errorActions}>
                <Pressable
                  onPress={() => {
                    setLoadError(null);
                    webRef.current?.reload();
                  }}
                  style={({ pressed }) => [styles.errorRetry, { opacity: pressed ? 0.8 : 1 }]}
                >
                  <RefreshCw color={COLORS.actionFg} size={15} />
                  <Text style={styles.errorRetryText}>Réessayer</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigate(GOOGLE_HOME_URL)}
                  style={({ pressed }) => [styles.errorHome, { opacity: pressed ? 0.8 : 1 }]}
                >
                  <Globe color={COLORS.textPrimary} size={15} />
                  <Text style={styles.errorHomeText}>Page de départ</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* ── Zone publicitaire : tiers inférieur ─────────────────────────
          Place RÉSERVÉE (jamais un overlay) : fixe pendant le défilement
          de la page, elle ne peut ni recouvrir la WebView ni être écrasée
          par la navigation. Les boutons flottants Accueil / Naviguer sont
          superposés dans sa partie basse, au-dessus de la marge interne
          réservée au contenu publicitaire. */}
      <View style={[styles.adZone, { height: adZoneHeight }]}>
        <BrowseAdBanner variant="strip" contentBottomInset={adContentInset} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  browserZone: { flexShrink: 0, overflow: "hidden" },
  headerRow: { paddingHorizontal: 16 },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 16
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 42,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.10)"
  },
  input: { flex: 1, color: COLORS.textPrimary, fontSize: 14, fontFamily: "Inter-Regular" },
  goButton: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.actionBg
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 16
  },
  toolbarSpacer: { flex: 1 },
  toolButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: COLORS.border
  },
  // Retour à la page de DÉPART du navigateur : pastille étiquetée « Google »
  // (et non l'onglet « Accueil » de Bôjô, bouton flottant Home).
  browserHome: {
    width: "auto",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: COLORS.actionBg
  },
  browserHomeText: { color: COLORS.actionFg, fontSize: 12.5, fontFamily: "Inter-Bold" },
  refreshWrap: { alignItems: "center", justifyContent: "center", width: 20, height: 20 },
  noticeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
    backgroundColor: "rgba(245, 158, 11, 0.1)"
  },
  noticeText: { flex: 1, color: COLORS.warning, fontSize: 11.5, fontFamily: "Inter-Regular" },
  // La WebView prend TOUT l'espace restant de la zone navigateur.
  webArea: { flex: 1, marginTop: 8 },
  webFrame: {
    flex: 1,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomWidth: 0,
    backgroundColor: COLORS.white
  },
  webview: { flex: 1, backgroundColor: COLORS.white },
  // Zone publicitaire réservée : jamais compressée sous sa hauteur lisible
  // (flexShrink 0) — c'est la WebView au-dessus qui se réduit si besoin.
  adZone: { flexShrink: 0, overflow: "hidden" },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(255,255,255,0.97)"
  },
  errorIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    backgroundColor: "rgba(245, 158, 11, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)"
  },
  errorTitle: { color: "#111827", fontSize: 16, fontFamily: "Inter-Bold", textAlign: "center" },
  errorDetail: {
    color: "#4B5563",
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 16,
    fontFamily: "Inter-Regular"
  },
  errorActions: { flexDirection: "row", gap: 10 },
  errorRetry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.actionBg
  },
  errorRetryText: { color: COLORS.actionFg, fontSize: 13, fontFamily: "Inter-Bold" },
  errorHome: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(89, 18, 237, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(89, 18, 237, 0.35)"
  },
  errorHomeText: { color: COLORS.actionFg, fontSize: 13, fontFamily: "Inter-Bold" }
});
