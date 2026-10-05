import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import FloatingNav, { type FloatingNavTarget } from "../../../components/FloatingNav";

/**
 * Navigation de Bôjô : DEUX destinations seulement — Accueil et Naviguer.
 *
 * La grande barre d'onglets à quatre entrées a été supprimée : la barre
 * d'onglets native est désactivée (`tabBar: renderFloatingTabBar`) et
 * remplacée par deux boutons flottants compacts (icône + libellé)
 * superposés en bas d'écran. Sur « Naviguer », ces boutons flottent DANS la
 * zone publicitaire ; sur « Accueil », ils restent accessibles au-dessus du
 * contenu défilant, qui réserve leur hauteur exacte (lib/floatingNav.ts).
 *
 * L'onglet « Historique » et l'onglet « Profil » n'existent plus : les
 * informations du profil vivent dans la section « Mon compte » de l'Accueil
 * (déconnexion incluse) et l'historique est mis de côté dans
 * `src/features/history/` (voir le README de ce dossier).
 *
 * Les écrans restent montés après navigation : c'est la garde de focus
 * (src/hooks/useIsFocusedScreen.ts) qui garantit UN SEUL lecteur
 * publicitaire actif entre l'Accueil et le Navigateur.
 */
const HOME_ROUTE = "dashboard/index";
const BROWSE_ROUTE = "browse/index";

function renderFloatingTabBar(props: BottomTabBarProps) {
  const { state, navigation } = props;
  const current = state.routes[state.index]?.name;
  const active: FloatingNavTarget = current === BROWSE_ROUTE ? "browse" : "home";

  const onNavigate = (target: FloatingNavTarget) => {
    const routeName = target === "browse" ? BROWSE_ROUTE : HOME_ROUTE;
    const route = state.routes.find((r) => r.name === routeName);
    if (!route) return;
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true
    });
    if (!event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  return <FloatingNav active={active} onNavigate={onNavigate} />;
}

export default function TabLayout() {
  return (
    <Tabs
      backBehavior="history"
      tabBar={renderFloatingTabBar}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name={HOME_ROUTE} options={{ title: "Accueil" }} />
      <Tabs.Screen name={BROWSE_ROUTE} options={{ title: "Naviguer" }} />
    </Tabs>
  );
}
