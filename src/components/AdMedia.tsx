import React, { useEffect, useRef } from "react";
import { Image, StyleSheet } from "react-native";
import { Video, ResizeMode, type AVPlaybackStatus } from "expo-av";

const localDemoVideo = require("../../assets/demo-ad.mp4");

export interface AdMediaProps {
  ad: { id?: string; type: "image" | "video"; mediaUrl: string };
  shouldPlay: boolean;
  isLooping?: boolean;
  onError: () => void;
  onPlaybackStatusUpdate: (status: AVPlaybackStatus) => void;
  /**
   * Typage du média dans son conteneur. "cover" (défaut, hérité) remplit et
   * recadre ; "contain" (bande persistante du navigateur) conserve les
   * proportions réelles de la création sans la déformer ni la couper.
   */
  mediaResizeMode?: "cover" | "contain";
}

/**
 * AdMedia — Lecteur média publicitaire (vidéo expo-av ou image).
 *
 * Logique déclarative partagée entre l'Accueil (HeroAdCard) et le navigateur
 * (BrowseAdBanner) : `shouldPlay` pilote la lecture, `isLooping` démarre la
 * boucle de maintien à la validation de la première lecture (jamais à chaque
 * reprise). La source de vérité d'autorisation reste le mécanisme central.
 */
export default function AdMedia({
  ad,
  shouldPlay,
  isLooping = false,
  onError,
  onPlaybackStatusUpdate,
  mediaResizeMode = "cover"
}: AdMediaProps) {
  const videoRef = useRef<Video>(null);

  // Stratégie déclarative : shouldPlay pilote la lecture/pause. Aucune
  // remise à zéro systématique à chaque reprise : on reprend là où l'on était.
  useEffect(() => {
    if (!videoRef.current) return;
    if (shouldPlay) {
      videoRef.current.playAsync().catch(() => {});
    } else {
      videoRef.current.pauseAsync().catch(() => {});
    }
  }, [shouldPlay]);

  // Entrée dans LA boucle de maintien (validation de la première lecture).
  // isLooping ne change qu'à cette jonction (stable durant pause/reprise),
  // donc ce n'est pas une remise à zéro à chaque reprise mais le démarrage
  // explicite de la boucle après validation serveur.
  useEffect(() => {
    if (isLooping && shouldPlay && videoRef.current) {
      videoRef.current.setPositionAsync(0).then(() => videoRef.current?.playAsync()).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLooping]);

  if (ad.type === "video") {
    const isDemo = ad.id === "demo-campaign-video";
    const source = isDemo ? localDemoVideo : { uri: ad.mediaUrl };

    return (
      <Video
        ref={videoRef}
        source={source}
        style={StyleSheet.absoluteFill}
        resizeMode={mediaResizeMode === "contain" ? ResizeMode.CONTAIN : ResizeMode.COVER}
        shouldPlay={shouldPlay}
        isLooping={isLooping}
        isMuted={true}
        useNativeControls={false}
        onError={onError}
        onLoad={() => {
          if (shouldPlay) {
            videoRef.current?.playAsync().catch(() => {});
          }
        }}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
      />
    );
  }

  return (
    <Image
      source={{ uri: ad.mediaUrl }}
      style={StyleSheet.absoluteFill}
      resizeMode={mediaResizeMode === "contain" ? "contain" : "cover"}
      onError={onError}
    />
  );
}