import { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions } from "react-native";

/**
 * Retarde l'exécution d'un callback jusqu'à ce que l'appelant
 * cesse de l'appeler (recherche, filtres, champs de saisie).
 * La référence courante du callback est mémorisée pour ne pas
 * recréer la fonction retardée à chaque rendu du parent.
 */
export function useDebounce<T extends (...args: any[]) => void>(callback: T, delay = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay]
  );
}

/**
 * true sur un écran étroit (iPhone SE et.androidphones compacts).
 * À utiliser pour basculer une mise en page deux colonnes / une colonne.
 */
export function useIsSmallScreen(below = 375) {
  const [isSmall, setIsSmall] = useState(false);

  useEffect(() => {
    const { width } = Dimensions.get("window");
    setIsSmall(width < below);
  }, [below]);

  return isSmall;
}
