/**
 * Écran « Naviguer » — isolation de l'élément « navigateur intégré ».
 *
 * Verrouille les deux exigences fortes du cahier des charges :
 *   A. le navigateur est INTÉGRÉ et propre — aucun navigateur ni application
 *      externe, aucun schéma non-http, aucune fenêtre multiple, TLS jamais
 *      dégradé ;
 *   B. la publicité occupe une place RÉSERVÉE SOUS le navigateur : frère de
 *      la WebView dans la mise en page, jamais un overlay, jamais comprimée.
 *
 * Le rendu de la bannière est mocké : on vérifie SA PLACE, pas son dessin.
 */

import React from "react";
import { View, Text, Pressable } from "react-native";
import { render, fireEvent, act } from "@testing-library/react-native";

import BrowseScreen from "../index";
import { browseAdZoneHeight, browseWebZoneHeight } from "../../../../../lib/browseLayout";
import { FLOATING_NAV_CLEARANCE } from "../../../../../lib/floatingNav";
import { GOOGLE_HOME_URL, googleSearchUrl } from "../../../../../lib/browser";

const mockPush = jest.fn();
const mockRenewNow = jest.fn().mockResolvedValue(undefined);
const mockGoBack = jest.fn();
const mockGoForward = jest.fn();
const mockReload = jest.fn();
const mockStopLoading = jest.fn();
const mockInjectJavaScript = jest.fn();

let mockCtx: Record<string, unknown> = {};
let mockTransport = "wifi";
let mockKeyboard = false;
let mockWindow = { width: 412, height: 915 };
let mockInsets = { top: 24, bottom: 48, left: 0, right: 0 };
let mockWebViewProps: Record<string, unknown>[] = [];

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("../../../../../contexts/ConnectionContext", () => ({
  useConnection: () => mockCtx,
}));

jest.mock("../../../../../services/networkTransport", () => ({
  useNetworkTransport: () => mockTransport,
}));

jest.mock("../../../../../hooks/useKeyboardVisible", () => ({
  useKeyboardVisible: () => mockKeyboard,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockInsets,
}));

// La hauteur de fenêtre DOIT être pilotée par le test : c'est la base de
// toute la répartition 2/3 − 1/3. La valeur par défaut du preset Jest (1334)
// masquerait sinon les erreurs de calcul.
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockWindow,
  useWindowDimensions: () => mockWindow,
}));

jest.mock("lucide-react-native", () => {
  const { View: RNView } = require("react-native");
  return new Proxy(
    {},
    { get: () => (props: Record<string, unknown>) => <RNView {...props} /> }
  );
});

// --- Le navigateur est isolé : on n'observe QUE ce que l'écran lui passe. ---
jest.mock("react-native-webview", () => {
  const { View: RNView } = require("react-native");
    const Ref = require("react").forwardRef;
  return {
    __esModule: true,
    WebView: Ref((props: Record<string, unknown>, ref: never) => {
      mockWebViewProps.push(props);
      // La ref pointe sur le handle impératif attendu par l'écran.
      if (ref && typeof ref === "object") {
        (ref as { current: unknown }).current = {
          goBack: mockGoBack,
          goForward: mockGoForward,
          reload: mockReload,
          stopLoading: mockStopLoading,
          injectJavaScript: mockInjectJavaScript,
        };
      }
      return <RNView testID="webview" {...props} />;
    }),
  };
});

// --- La publicité est isolée : on vérifie SA PLACE, pas son rendu. -----------
jest.mock("../../../../../components/BrowseAdBanner", () => {
  const { View: RNView } = require("react-native");
  const Banner = (props: Record<string, unknown>) => <RNView testID="ad-banner" {...props} />;
  Banner.displayName = "BrowseAdBanner";
  return { __esModule: true, default: Banner };
});

jest.mock("../../../../../components/AppHeader", () => {
  const { View: RNView } = require("react-native");
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => <RNView testID="app-header" {...props} />,
  };
});

jest.mock("../../../../../components/BrowseSuspensionScreen", () => {
  const { View: RNView } = require("react-native");
  const Screen = (props: Record<string, unknown>) => (
    <RNView testID="suspension-screen" {...props} />
  );
  Screen.displayName = "BrowseSuspensionScreen";
  return { __esModule: true, default: Screen };
});

jest.mock("../../../../../components/BrowseSuspensionOverlay", () => {
  const { View: RNView } = require("react-native");
  const Overlay = (props: Record<string, unknown>) => (
    <RNView testID="suspension-overlay" {...props} />
  );
  Overlay.displayName = "BrowseSuspensionOverlay";
  return { __esModule: true, default: Overlay };
});

function setCtx(overrides: Record<string, unknown> = {}) {
  mockCtx = {
    state: "wifi_active",
    currentAd: { id: "c1" },
    vpnStatus: { tunnelUp: true },
    renewNow: mockRenewNow,
    ...overrides,
  };
}

function flatStyle(style: unknown): Record<string, unknown> {
  const resolved = typeof style === "function" ? style({ pressed: false }) : style;
  if (Array.isArray(resolved)) return Object.assign({}, ...resolved.filter(Boolean));
  return (resolved ?? {}) as Record<string, unknown>;
}

/** Style d'un View désigné par son testID. */
function styleOf(node: StyleNode | null | undefined): Record<string, unknown> {
  return flatStyle(node?.props?.style);
}

type StyleNode = { props?: { style?: unknown; testID?: string }; parent?: StyleNode };
type Findable = {
  findAll: (p: (n: StyleNode) => boolean) => StyleNode[];
};

/** L'ancêtre à `levels` de distance du nœud identifié par testID. */
function ancestorOf(root: unknown, testID: string, levels: number): StyleNode | undefined {
  const r = root as Findable;
  let node: StyleNode | undefined = r.findAll((n) => n.props?.testID === testID)[0];
  for (let i = 0; i < levels && node; i += 1) node = node.parent;
  return node;
}

/**
 * Les DEUX zones de hauteur calculée de l'écran. Elles portent toutes deux
 * `flexShrink: 0` + une hauteur inline : les repérer ici, c'est vérifier que
 * l'écran a bien construit deux zones et non un overlay flottant.
 */
function zonesOf(root: unknown): Array<Record<string, unknown>> {
  const r = root as Findable;
  const styles = r
    .findAll(
      (n) =>
        styleOf(n).flexShrink === 0 &&
        typeof styleOf(n).height === "number" &&
        !n.props?.testID
    )
    .map(styleOf);
  // Le `View` du preset Jest apparaît en deux nœuds (composant + hôte) :
  // on déduplique les hauteurs, une zone = une hauteur.
  const seen = new Set<number>();
  const zones: Array<Record<string, unknown>> = [];
  for (const s of styles) {
    if (seen.has(s.height as number)) continue;
    seen.add(s.height as number);
    zones.push(s);
  }
  return zones;
}

function inputProps(view: ReturnType<typeof render>): {
  onChangeText: (t: string) => void;
  onSubmitEditing: () => void;
} {
  const node = view.getByLabelText("Adresse ou recherche");
  return node.props as never;
}

function submitAddress(view: ReturnType<typeof render>, text: string) {
  fireEvent.changeText(view.getByLabelText("Adresse ou recherche"), text);
  fireEvent.press(view.getByLabelText("Aller à l'adresse ou lancer la recherche"));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWebViewProps = [];
  mockTransport = "wifi";
  mockKeyboard = false;
  mockWindow = { width: 412, height: 915 };
  mockInsets = { top: 24, bottom: 48, left: 0, right: 0 };
  setCtx();
});

describe("A. le navigateur est INTÉGRÉ (rien ne sort de l'application)", () => {
  it("la WebView est montée dans la zone navigateur, sur la page de DÉPART", () => {
    const view = render(<BrowseScreen />);
    expect(view.getByTestId("webview")).toBeTruthy();
    expect(mockWebViewProps[0].source).toEqual({ uri: GOOGLE_HOME_URL });
  });

  it("page de DÉPART = Google (raccourci du cahier des charges)", () => {
    expect(GOOGLE_HOME_URL).toBe("https://www.google.com");
    expect(googleSearchUrl("meteo")).toContain("https://www.google.com/search?q=");
  });

  it("aucune fenêtre multiple : target=_blank reste dans LA MÊME WebView", () => {
    render(<BrowseScreen />);
    expect(mockWebViewProps[0].setSupportMultipleWindows).toBe(false);
    // Le script injecté réécrit window.open ET target="_blank".
    const js = String(mockWebViewProps[0].injectedJavaScript);
    expect(js).toContain("window.open");
    expect(js).toContain('getAttribute("target") === "_blank"');
  });

  it("seuls http/https sont autorisés (mailto:, tel:, intent: rejetés)", () => {
    render(<BrowseScreen />);
    expect(mockWebViewProps[0].originWhitelist).toEqual(["http://*", "https://*"]);
    const guard = mockWebViewProps[0].onShouldStartLoadWithRequest as (r: { url: string }) => boolean;
    expect(guard({ url: "https://exemple.test" })).toBe(true);
    expect(guard({ url: "http://exemple.test" })).toBe(true);
    expect(guard({ url: "HTTPS://exemple.test" })).toBe(true);
    expect(guard({ url: "mailto:a@b.c" })).toBe(false);
    expect(guard({ url: "tel:+33100000000" })).toBe(false);
    expect(guard({ url: "sms:+331" })).toBe(false);
    expect(guard({ url: "intent://scan/#Intent;end" })).toBe(false);
    expect(guard({ url: "geo:0,0" })).toBe(false);
    expect(guard({ url: "file:///etc/passwd" })).toBe(false);
    expect(guard({ url: "javascript:alert(1)" })).toBe(false);
    expect(guard({ url: "data:text/html,<b>x" })).toBe(false);
  });

  it("la sécurité n'est JAMAIS dégradée", () => {
    render(<BrowseScreen />);
    const props = mockWebViewProps[0];
    // Contenu mixte interdit et protections fichier non ouvertes.
    expect(props.mixedContentMode).toBe("never");
    expect(props.allowFileAccess).toBeUndefined();
    expect(props.allowUniversalAccessFromFileURLs).toBeUndefined();
    expect(props.allowFileAccessFromFileURLs).toBeUndefined();
    // Plein écran vidéo désactivé : la surface reste celle de Bôjô, donc la
    // zone pub (et les boutons flottants) ne sont jamais masqués.
    expect(props.allowsFullscreenVideo).toBe(false);
    // Navigation standard : le geste « retour » Android reste disponible.
    expect(props.allowsBackForwardNavigationGestures).toBe(true);
  });

  it("la barre d'adresse est typée URL et sans autocorrection", () => {
    const view = render(<BrowseScreen />);
    const props = view.getByLabelText("Adresse ou recherche").props as Record<string, unknown>;
    expect(props.keyboardType).toBe("url");
    expect(props.autoCapitalize).toBe("none");
    expect(props.autoCorrect).toBe(false);
    expect(props.returnKeyType).toBe("go");
    expect(props.editable).toBe(true);
  });

  it("une recherche textuelle devient une recherche Google encodée", () => {
    const view = render(<BrowseScreen />);
    submitAddress(view, "meteo cameroun");
    const last = mockWebViewProps[mockWebViewProps.length - 1].source as { uri: string };
    expect(last.uri).toBe(googleSearchUrl("meteo cameroun"));
    expect(last.uri).toContain("meteo%20cameroun");
  });

  it("un nom de domaine nu est normalisé en https, sans toucher au DNS", () => {
    const view = render(<BrowseScreen />);
    submitAddress(view, "exemple.test");
    const last = mockWebViewProps[mockWebViewProps.length - 1].source as { uri: string };
    expect(last.uri).toBe("https://exemple.test");
  });

  it("un protocole interdit affiche un avertissement SANS naviger", () => {
    const view = render(<BrowseScreen />);
    submitAddress(view, "javascript:alert(1)");
    // Avertissement visible…
    expect(view.getByText("Protocole non pris en charge par le navigateur")).toBeTruthy();
    // … et AUCUNE navigation ni battement d'autorisation déclenchés.
    expect(mockRenewNow).not.toHaveBeenCalled();
    for (const p of mockWebViewProps) {
      expect((p.source as { uri: string }).uri).toBe(GOOGLE_HOME_URL);
    }
  });

  it("précédent / suivant sont câblés à la WebView et s'activent après navigation", () => {
    const view = render(<BrowseScreen />);
    expect(view.getByLabelText("Page précédente")).toBeTruthy();
    expect(view.getByLabelText("Page suivante")).toBeTruthy();
    // Pendant un chargement, le bouton devient « Arrêter le chargement ».
    expect(view.queryByLabelText("Actualiser")).toBeNull();
    expect(view.getByLabelText("Arrêter le chargement")).toBeTruthy();

    // Le site remonte un historique : les commandes deviennent actives.
    act(() => {
      fireEvent(
        view.getByTestId("webview"),
        "navigationStateChange",
        { url: "https://exemple.test", canGoBack: true, canGoForward: true, loading: false }
      );
    });
    expect(view.getByLabelText("Actualiser")).toBeTruthy();
    fireEvent.press(view.getByLabelText("Page suivante"));
    expect(mockGoForward).toHaveBeenCalled();
    fireEvent.press(view.getByLabelText("Page précédente"));
    expect(mockGoBack).toHaveBeenCalled();
  });

  it("le bouton « Page de départ » du navigateur ne se confond pas avec l'onglet Accueil", () => {
    const view = render(<BrowseScreen />);
    expect(view.getByLabelText("Page de départ du navigateur (Google)")).toBeTruthy();
    // L'onglet Accueil de Bôjô est un bouton flottant hors de cet écran.
    expect(view.queryByLabelText("Accueil")).toBeNull();
  });
});

describe("B. la publicité est RÉSERVÉE SOUS le navigateur", () => {
  it("la bannière est rendue comme FRÈRE de la WebView, jamais en overlay", () => {
    const view = render(<BrowseScreen />);
    expect(view.getByTestId("ad-banner")).toBeTruthy();
    // Le cadre web ne porte aucun positionnement absolu/fixe.
    expect(styleOf(ancestorOf(view.UNSAFE_root, "webview", 2)).position).toBeUndefined();
    // Le conteneur de la bannière non plus.
    expect(styleOf(ancestorOf(view.UNSAFE_root, "ad-banner", 2)).position).toBeUndefined();
  });

  it("l'écran construit DEUX zones de hauteur calculée, pas un overlay", () => {
    const view = render(<BrowseScreen />);
    const zones = zonesOf(view.UNSAFE_root);
    // Exactement deux zones : navigateur puis publicité.
    expect(zones).toHaveLength(2);
    // Elles remplissent la hauteur utile AU PIXEL PRÈS (843 = 915−24−48).
    expect((zones[0].height as number) + (zones[1].height as number)).toBe(843);
    // La pub est le tiers inférieur, la WebView garde le reste.
    expect(zones[1].height).toBe(browseAdZoneHeight({ usableHeight: 843, keyboardVisible: false }));
    expect(zones[0].height).toBe(browseWebZoneHeight({ usableHeight: 843, keyboardVisible: false }));
  });

  it("la zone pub est fermée au flexShrink : jamais comprimée", () => {
    const view = render(<BrowseScreen />);
    const adZone = ancestorOf(view.UNSAFE_root, "ad-banner", 2);
    const style = styleOf(adZone);
    expect(style.flexShrink).toBe(0);
    expect(typeof style.height).toBe("number");
    // Si la zone pub devait céder, ce serait la WebView (au-dessus) qui perd.
    expect(styleOf(ancestorOf(view.UNSAFE_root, "webview", 2)).flex).toBe(1);
  });

  it("les deux zones partagent EXACTEMENT la hauteur utile (aucun pixel perdu)", () => {
    // 915 − 24 (statut) − 48 (navigation Android) = 843
    const opts = { usableHeight: 915 - 24 - 48, keyboardVisible: false };
    const ad = browseAdZoneHeight(opts);
    const web = browseWebZoneHeight(opts);
    expect(ad + web).toBe(843);
    expect(ad).toBe(Math.round(843 / 3));
    expect(web).toBe(843 - ad);
  });

  it("la zone pub occupe ~1/3, la WebView garde le reste", () => {
    const opts = { usableHeight: 843, keyboardVisible: false };
    expect(browseAdZoneHeight(opts) / 843).toBeCloseTo(1 / 3, 1);
    expect(browseWebZoneHeight(opts)).toBeGreaterThan(0);
  });

  it("l'écran applique les insets système pour que le total tienne au pixel près", () => {
    mockInsets = { top: 24, bottom: 48, left: 0, right: 0 };
    const view = render(<BrowseScreen />);
    const screen = view.UNSAFE_root.children[0] as unknown as StyleNode;
    const style = styleOf(screen);
    expect(style.paddingTop).toBe(24);
    expect(style.paddingBottom).toBe(48);
  });

  it("clavier fermé : la pub réserve la marge des boutons flottants", () => {
    mockKeyboard = false;
    const view = render(<BrowseScreen />);
    expect(view.getByTestId("ad-banner").props.contentBottomInset).toBe(FLOATING_NAV_CLEARANCE);
  });

  it("clavier ouvert : la marge disparaît AVEC les boutons (pas de trou béant)", () => {
    mockKeyboard = true;
    const view = render(<BrowseScreen />);
    expect(view.getByTestId("ad-banner").props.contentBottomInset).toBe(0);
  });

  it("la pub reste présente même quand la navigation est réellement coupée", () => {
    // Hors session : la WebView est DÉMONTÉE (perte d'accès durable)…
    setCtx({ state: "idle" });
    const view = render(<BrowseScreen />);
    expect(view.queryByTestId("webview")).toBeNull();
    expect(view.getByTestId("suspension-screen")).toBeTruthy();
    // … mais la place publicitaire n'est JAMAIS libérée.
    expect(view.getByTestId("ad-banner")).toBeTruthy();
  });
});

describe("C. la navigation est suspendue franchement hors session", () => {
  it("hors session : plus aucune navigation n'est acceptée par le garde-fou", () => {
    const view = render(<BrowseScreen />);
    const guard = mockWebViewProps[0].onShouldStartLoadWithRequest as (r: { url: string }) => boolean;
    expect(guard({ url: "https://exemple.test" })).toBe(true);

    // On re-rend hors session : la WebView part, le garde-fou suit.
    setCtx({ state: "idle" });
    act(() => {
      view.rerender(<BrowseScreen />);
    });
    expect(view.queryByTestId("webview")).toBeNull();
  });

  it("la barre d'adresse est verrouillée pendant la suspension", () => {
    setCtx({ state: "idle" });
    const view = render(<BrowseScreen />);
    const props = view.getByLabelText("Adresse ou recherche").props as Record<string, unknown>;
    expect(props.editable).toBe(false);
  });

  it("le bouton « aller » est neutralisé pendant la suspension", () => {
    setCtx({ state: "idle" });
    const view = render(<BrowseScreen />);
    const go = view
      .UNSAFE_getAllByType(Pressable as never)
      .find(
        (n) =>
          (n.props as Record<string, unknown>).accessibilityLabel ===
          "Aller à l'adresse ou lancer la recherche"
      );
    expect(go).toBeTruthy();
    expect((go?.props as Record<string, unknown>).disabled).toBe(true);
    fireEvent.press(go as never);
    expect(mockRenewNow).not.toHaveBeenCalled();
  });

  it("suspension COURTE : la page est GELÉE (pas détruite) et les médias arrêtés", () => {
    const view = render(<BrowseScreen />);
    // Notre tunnel VPN devient l'interface par défaut : « verifying », page
    // conservée derrière un voile — c'est NOTRE blocage, pas une coupure.
    mockTransport = "none";
    act(() => {
      view.rerender(<BrowseScreen />);
    });
    expect(view.queryByTestId("webview")).toBeTruthy();
    expect(view.getByTestId("suspension-overlay")).toBeTruthy();
    expect(mockStopLoading).toHaveBeenCalled();
    // Arrêt des médias : pas de son qui continue de tourner en suspension.
    expect(String(mockInjectJavaScript.mock.calls[0][0])).toContain("video,audio");
    // La pub reste là.
    expect(view.getByTestId("ad-banner")).toBeTruthy();
  });

  it("coupure RÉELLE (offline) : la page est détruite, pas gelée", () => {
    const view = render(<BrowseScreen />);
    setCtx({ vpnStatus: { tunnelUp: false } });
    mockTransport = "none";
    act(() => {
      view.rerender(<BrowseScreen />);
    });
    expect(view.queryByTestId("webview")).toBeNull();
    expect(view.queryByTestId("suspension-overlay")).toBeNull();
  });

  it("session active : naviguer déclenche un battement d'autorisation", () => {
    const view = render(<BrowseScreen />);
    submitAddress(view, "https://exemple.test");
    expect(mockRenewNow).toHaveBeenCalledTimes(1);
  });
});

describe("D. la WebView est pleine largeur et proprement rognée", () => {
  it("le cadre web est flexible, arrondi et en overflow caché", () => {
    const view = render(<BrowseScreen />);
    const style = styleOf(ancestorOf(view.UNSAFE_root, "webview", 2));
    expect(style.flex).toBe(1);
    expect(style.overflow).toBe("hidden");
    expect(style.borderTopLeftRadius).toBeGreaterThan(0);
    // Pas de marge horizontale parasite : pleine largeur.
    expect(style.marginHorizontal).toBeUndefined();
  });

  it("l'écran racine ne déborde pas sous la barre de navigation Android", () => {
    const view = render(<BrowseScreen />);
    const root = view.UNSAFE_root.children[0] as unknown as StyleNode;
    const style = styleOf(root);
    expect(style.flex).toBe(1);
    expect(style.paddingBottom).toBe(48);
  });
});
