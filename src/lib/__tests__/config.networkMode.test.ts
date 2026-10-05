import { describe, it, expect } from "@jest/globals";
import { checkNetworkModeAllowed } from "../config";

/**
 * La règle est testée via la fonction pure `checkNetworkModeAllowed` :
 * babel-preset-expo fige les `process.env.EXPO_PUBLIC_*` à la
 * compilation, donc réassigner `process.env` dans un test n'aurait
 * aucun effet sur le code testé.
 */
describe("garde-fou : mode réseau", () => {
  it("refuse la démo VPN en production", () => {
    // Le blocage d'annonces ne filtre que le téléphone : le faire
    // croire en production donnerait un accès que rien ne contrôle.
    const message = checkNetworkModeAllowed({
      appEnv: "production",
      networkMode: "android_vpn_demo",
      allowVpnDemoInProduction: "false",
    });
    expect(message).toMatch(/android_vpn_demo/);
    expect(message).toMatch(/mikrotik/);
  });

  it("accepte la démo en production si elle est explicitement assumée", () => {
    expect(
      checkNetworkModeAllowed({
        appEnv: "production",
        networkMode: "android_vpn_demo",
        allowVpnDemoInProduction: "true",
      })
    ).toBeNull();
  });

  it("laisse passer le mode mikrotik en production", () => {
    expect(
      checkNetworkModeAllowed({
        appEnv: "production",
        networkMode: "mikrotik",
        allowVpnDemoInProduction: "false",
      })
    ).toBeNull();
  });

  it("laisse la démo disponible en développement et en pilote", () => {
    for (const appEnv of ["development", "pilot"]) {
      expect(
        checkNetworkModeAllowed({ appEnv, networkMode: "android_vpn_demo" })
      ).toBeNull();
    }
  });

  it("tolère une configuration incomplète (pas de mode déclaré)", () => {
    expect(checkNetworkModeAllowed({})).toBeNull();
  });
});
