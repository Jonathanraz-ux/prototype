/**
 * BrowseAdBanner — isolation de l'élément « publicité sous le navigateur ».
 *
 * Exigence de la dernière séance (cahier des charges §2.2) : la publicité
 * est PERSISTANTE et BIEN VISIBLE pendant toute la navigation, dans la
 * place RÉSERVÉE sous le navigateur, et la navigation flottante ne doit
 * jamais la rogner.
 *
 * Chaque `describe` verrouille UN point de l'exigence.
 */

import React from "react";
import { View, Pressable, Image } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";

import BrowseAdBanner from "../BrowseAdBanner";
import { FLOATING_NAV_CLEARANCE } from "../../lib/floatingNav";
import { BROWSE_AD_MIN_HEIGHT, BROWSE_AD_MAX_HEIGHT } from "../../lib/browseLayout";

const mockPush = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockPauseSession = jest.fn().mockResolvedValue(undefined);
const mockPlaybackStatus = jest.fn().mockResolvedValue(undefined);
const mockMediaError = jest.fn().mockResolvedValue(undefined);

/** Contexte central simulé (rempli par setCtx avant chaque rendu). */
let mockCtx: Record<string, unknown> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: () => {},
}));

jest.mock("../../hooks/useIsFocusedScreen", () => ({
  useIsFocusedScreen: () => true,
}));

jest.mock("expo-linear-gradient", () => {
  const { View: RNView } = require("react-native");
  return { LinearGradient: (props: Record<string, unknown>) => <RNView {...props} /> };
});

/** Journal de montage du lecteur : prouve un REMONTAGE à chaque visionnage. */
const mockMediaMounts: string[] = [];

jest.mock("expo-av", () => {
  const ReactLocal = require("react");
  const { View: RNView } = require("react-native");
  const Video = (props: Record<string, unknown>) => {
    ReactLocal.useEffect(() => {
      mockMediaMounts.push("mount");
      return () => {
        mockMediaMounts.push("unmount");
      };
    }, []);
    return ReactLocal.createElement(RNView, { testID: "ad-video", ...props });
  };
  return {
    Video,
    ResizeMode: { CONTAIN: "contain", COVER: "cover" },
  };
});

jest.mock("../../contexts/ConnectionContext", () => ({
  useConnection: () => mockCtx,
}));

const AD = {
  id: "campagne-1",
  type: "video" as const,
  mediaUrl: "https://exemple.test/pub.mp4",
  title: "Bôjô et vous",
  advertiserName: "Sponsor Test",
  background: "#5912ED",
  accentColor: "#7C3AED",
  gradient: ["#5912ED", "#7C3AED"],
  durationSeconds: 30,
  rewardMinutes: 15,
  rewardMegabytes: 0,
  dailyLimit: 10,
};

function setCtx(overrides: Record<string, unknown> = {}) {
  mockCtx = {
    currentAd: AD,
    state: "wifi_active",
    adProgress: 0.42,
    adIsPlaying: true,
    adBuffering: false,
    connect: mockConnect,
    pauseSession: mockPauseSession,
    handlePlaybackStatusUpdate: mockPlaybackStatus,
    handleAdMediaError: mockMediaError,
    adViewNonce: 3,
    ...overrides,
  };
}

function renderStrip(props: { contentBottomInset?: number } = {}) {
  return render(
    <BrowseAdBanner variant="strip" contentBottomInset={FLOATING_NAV_CLEARANCE} {...props} />
  );
}

/** Style aplati d'un noeud : accepte un objet, un tableau OU une fonction. */
function flatStyle(style: unknown): Record<string, unknown> {
  const resolved = typeof style === "function" ? style({ pressed: false }) : style;
  if (Array.isArray(resolved)) return Object.assign({}, ...resolved.filter(Boolean));
  return (resolved ?? {}) as Record<string, unknown>;
}

/** Noeud View dont le style porte `marginBottom` (cadre du média). */
function mediaFrames(root: { findAll: (p: (n: never) => boolean) => unknown[] }) {
  return root.findAll(
    ((n: { type: unknown; props: { style: unknown } }) =>
      n.type === View &&
      Array.isArray(n.props.style) &&
      n.props.style.some(
        (s: unknown) => s !== null && typeof s === "object" && "marginBottom" in (s as object)
      )) as never
  ) as Array<{ props: { style: Array<Record<string, unknown>> } }>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMediaMounts.length = 0;
  setCtx();
});

describe("A. la zone publicitaire REMPLIT la place réservée", () => {
  it("conteneur en flex:1, sans marge latérale (zone plein écran)", () => {
    const { UNSAFE_getByType } = renderStrip();
    const zone = flatStyle(UNSAFE_getByType(View).props.style);
    expect(zone.flex).toBe(1);
    expect(zone.overflow).toBe("hidden");
    expect(zone.marginHorizontal).toBeUndefined();
  });

  it("la place réservée est plus haute que la navigation flottante", () => {
    // Sinon la création serait entièrement mangée par les boutons.
    expect(BROWSE_AD_MIN_HEIGHT).toBeGreaterThan(FLOATING_NAV_CLEARANCE);
    expect(BROWSE_AD_MAX_HEIGHT).toBeGreaterThan(BROWSE_AD_MIN_HEIGHT);
  });

  it("le média est monté et lisible", () => {
    expect(renderStrip().getByTestId("ad-video")).toBeTruthy();
  });
});

describe("B. la navigation flottante ne masque jamais la création", () => {
  it("le cadre du média porte la marge interne des boutons", () => {
    const frames = mediaFrames(renderStrip().UNSAFE_root);
    expect(frames.length).toBeGreaterThan(0);
    const margin = frames[0].props.style.find(
      (s) => "marginBottom" in s
    ) as { marginBottom: number };
    expect(margin.marginBottom).toBe(FLOATING_NAV_CLEARANCE);
  });

  it("clavier ouvert (inset 0) : plus de place vide béante", () => {
    const frames = mediaFrames(
      render(<BrowseAdBanner variant="strip" contentBottomInset={0} />).UNSAFE_root
    );
    const margin = frames[0].props.style.find(
      (s) => "marginBottom" in s
    ) as { marginBottom: number };
    expect(margin.marginBottom).toBe(0);
  });

  it("titres, annonceur et état sont composés AU-DESSUS des boutons", () => {
    const { getByText } = renderStrip();
    expect(getByText(AD.title)).toBeTruthy();
    expect(getByText(AD.advertiserName)).toBeTruthy();
    expect(getByText("Lecture en cours — session Internet active")).toBeTruthy();
  });
});

describe("C. la pub reste visible pendant toute la navigation", () => {
  it("session active : média en lecture et en boucle", () => {
    const video = renderStrip().getByTestId("ad-video");
    expect(video.props.shouldPlay).toBe(true);
    // La boucle maintient la session tant que l'abonné navigue.
    expect(video.props.isLooping).toBe(true);
  });

  it("visionnage en cours : progression visible, média monté", () => {
    setCtx({ state: "ad_active", adProgress: 0.75 });
    const { getByTestId, getByText } = renderStrip();
    expect(getByTestId("ad-video")).toBeTruthy();
    expect(getByText("75%")).toBeTruthy();
  });

  it("AUCUNE campagne : la zone reste occupée, jamais un trou", () => {
    setCtx({ currentAd: null });
    const { getByText } = renderStrip();
    expect(getByText("Votre connexion est financée par la publicité")).toBeTruthy();
    expect(
      getByText("Regardez une publicité depuis l'Accueil pour débloquer l'accès")
    ).toBeTruthy();
  });

  it("chaque visionnage REMONTE le lecteur (clé campagne:visionnage)", () => {
    // Régression du défaut documenté : avec une clé égale au seul id de
    // campagne, expo-av recyclait un lecteur figé en fin de vidéo, donc
    // `didJustFinish` n'arrivait jamais et les visions restaient
    // « abandoned » côté serveur.
    //
    // On re-rend le MÊME arbre (pas de unmount) avec un nonce différent :
    // si la clé ne portait que l'id de campagne, React réutiliserait
    // l'instance et le lecteur ne se remonterait pas.
    setCtx({ adViewNonce: 1 });
    const view = renderStrip();
    expect(mockMediaMounts).toEqual(["mount"]);

    setCtx({ adViewNonce: 2 });
    view.rerender(
      <BrowseAdBanner variant="strip" contentBottomInset={FLOATING_NAV_CLEARANCE} />
    );

    // Le nonce change → nouveau visionnage → lecteur remonté depuis 0.
    expect(mockMediaMounts).toEqual(["mount", "unmount", "mount"]);
  });
});

describe("D. la zone n'intercepte que ce qui lui appartient", () => {
  it("un appui sur la zone pilote la lecture/suspension", () => {
    setCtx({ adIsPlaying: true });
    const { getByLabelText } = renderStrip();
    fireEvent.press(getByLabelText("Publicité — contrôler la lecture"));
    // Pause volontaire : média coupé ET session suspendue.
    expect(mockPauseSession).toHaveBeenCalledTimes(1);
  });

  it("lecture arrêtée : l'appui reprend la session", () => {
    setCtx({ adIsPlaying: false });
    const { getByLabelText } = renderStrip();
    fireEvent.press(getByLabelText("Publicité — contrôler la lecture"));
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it("sans campagne, le bouton Partenaires mène à l'écran campagnes", () => {
    setCtx({ currentAd: null });
    const { getByLabelText } = renderStrip();
    fireEvent.press(getByLabelText("Annonces partenaires"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/campaigns");
  });
});

describe("E. la variante historique « top » reste un bandeau", () => {
  it("hauteur fixe de 96 px", () => {
    const { UNSAFE_getByType } = render(<BrowseAdBanner />);
    const banner = flatStyle(UNSAFE_getByType(Pressable).props.style);
    expect(banner.height).toBe(96);
    expect(banner.marginHorizontal).toBe(20);
  });
});

describe("F. la zone est identifiée comme publicitaire", () => {
  it("badge PUB présent dans les deux variantes", () => {
    expect(renderStrip().getAllByText("PUB").length).toBeGreaterThan(0);
    expect(render(<BrowseAdBanner />).getAllByText("PUB").length).toBeGreaterThan(0);
  });
});

describe("G. la création n'est ni déformée ni rognée", () => {
  it("vidéo en resizeMode contain", () => {
    expect(renderStrip().getByTestId("ad-video").props.resizeMode).toBe("contain");
  });

  it("image en resizeMode contain", () => {
    setCtx({ currentAd: { ...AD, type: "image" as const } });
    const { UNSAFE_getByType } = renderStrip();
    expect(UNSAFE_getByType(Image).props.resizeMode).toBe("contain");
  });
});

describe("H. la zone reste pilotable au doigt", () => {
  it("toute la zone est pressable, pas seulement le média", () => {
    const { UNSAFE_getAllByType } = renderStrip();
    const pressables = UNSAFE_getAllByType(Pressable);
    expect(pressables.length).toBeGreaterThan(0);
    expect(
      pressables.some(
        (p) => p.props.accessibilityLabel === "Publicité — contrôler la lecture"
      )
    ).toBe(true);
  });
});
