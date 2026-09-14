import { describe, it, expect } from "@jest/globals";
import { AndroidVpnDemoAdapter } from "../AndroidVpnDemoAdapter";
import { resolveNetworkAdapter } from "../index";

describe("AndroidVpnDemoAdapter & resolveNetworkAdapter", () => {
  it("instancie AndroidVpnDemoAdapter quand le mode est android_vpn_demo", () => {
    const adapter = resolveNetworkAdapter("android_vpn_demo");
    expect(adapter).toBeInstanceOf(AndroidVpnDemoAdapter);
    expect(adapter.name).toBe("android_vpn_demo");
  });

  it("gère getSessionUsage en retournant disponible sans simuler de faux compteurs", async () => {
    const adapter = new AndroidVpnDemoAdapter();
    const usage = await adapter.getSessionUsage("ref-123");
    expect(usage.available).toBe(true);
    expect(usage.consumedBytes).toBe(0);
  });

  it("gère disconnectSession proprement", async () => {
    const adapter = new AndroidVpnDemoAdapter();
    await expect(adapter.disconnectSession("ref-123")).resolves.not.toThrow();
  });

  it("authorizeSession NE DÉBLOQUE JAMAIS sans validation serveur explicite", async () => {
    const adapter = new AndroidVpnDemoAdapter();
    const res = await adapter.authorizeSession({ allocatedSeconds: 60 } as any);
    if (res.success === true) {
      throw new Error("authorizeSession ne doit jamais renvoyer success=true");
    }
    expect(res).toEqual(expect.objectContaining({ success: false }));
  });
});
