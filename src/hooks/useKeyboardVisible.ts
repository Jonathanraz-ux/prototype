import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

/**
 * Vrai quand le clavier logiciel Android/iOS est visible.
 *
 * Utilisé par l'écran « Naviguer » (la zone publicitaire se réduit) et par
 * la navigation flottante (les boutons se retirent) pour ne jamais
 * confisquer la surface de saisie ni les barres système.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
