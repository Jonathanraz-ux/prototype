import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

/**
 * Vrai quand l'écran de l'onglet courant est au premier plan du navigateur.
 *
 * Utilisé par les lecteurs publicitaires (Accueil + Navigateur) pour n'avoir
 * QU'UN SEUL lecteur actif à la fois : les onglets restent montés, une garde
 * empêche deux vidéos/décodeurs simultanés et deux sources d'événements de
 * progression pendant que l'onglet est masqué.
 */
export function useIsFocusedScreen(): boolean {
  const [focused, setFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  return focused;
}