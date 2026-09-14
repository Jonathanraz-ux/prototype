import { describe, it, expect, jest } from "@jest/globals";
import { waitForMikrotikAuthorization } from "../mikrotikAuth";
import type { QuotaStatusShape } from "../../repositories/sessionRepository";

function makeSession(
  status: string,
  reference: string | null = null,
  disconnectReason?: string
): QuotaStatusShape["session"] {
  return {
    session_id: "sess-1",
    status,
    authorization_state: status,
    router_session_reference: reference,
    disconnect_reason: disconnectReason ?? null,
  };
}

describe("waitForMikrotikAuthorization", () => {
  it("retourne ok dès que la vue serveur passe à active", async () => {
    let call = 0;
    const statuses = [
      { session: makeSession("authorizing", null) },
      { session: makeSession("authorizing", null) },
      { session: makeSession("active", "mk-ref-1") },
    ];
    const result = await waitForMikrotikAuthorization({
      timeoutMs: 10000,
      pollIntervalMs: 1,
      delay: () => Promise.resolve(),
      fetchStatus: async () => statuses[Math.min(call++, statuses.length - 1)],
    });
    expect(result).toEqual({
      ok: true,
      signal: expect.objectContaining({ mode: "active" }) as any,
    });
  });

  it("couvre quota_exhausted → échec explicite", async () => {
    const result = await waitForMikrotikAuthorization({
      timeoutMs: 5000,
      pollIntervalMs: 1,
      delay: () => Promise.resolve(),
      fetchStatus: async () => ({ session: makeSession("closed", null, "QUOTA_EXHAUSTED") }),
    });
    expect(result.ok).toBe(false);
    expect(result.signal?.mode).toBe("quota_exhausted");
  });

  it("couvre session fermée → échec explicite", async () => {
    const result = await waitForMikrotikAuthorization({
      timeoutMs: 5000,
      pollIntervalMs: 1,
      delay: () => Promise.resolve(),
      fetchStatus: async () => ({ session: makeSession("closed") }),
    });
    expect(result.ok).toBe(false);
    expect(result.signal?.mode).toBe("closed");
  });

  it("expire après le délai sans confirmation active", async () => {
    const started = Date.now();
    const result = await waitForMikrotikAuthorization({
      timeoutMs: 25,
      pollIntervalMs: 5,
      fetchStatus: async () => ({ session: makeSession("authorizing", null) }),
    });
    expect(result.ok).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
  });

  it("interrompu si annulé en cours de route (réponse tardive ignorée)", async () => {
    let cancelled = false;
    const result = await waitForMikrotikAuthorization({
      timeoutMs: 5000,
      pollIntervalMs: 1,
      delay: () => Promise.resolve(),
      isCancelled: () => cancelled,
      fetchStatus: async () => {
        cancelled = true;
        return { session: makeSession("active", "mk-ref-1") };
      },
    });
    expect(result).toEqual({ ok: false, interrupted: true });
  });

  it("appelle onPoll à chaque lecture (affichage quota)", async () => {
    const polls: QuotaStatusShape[] = [];
    let call = 0;
    const statuses = [
      { session: makeSession("authorizing", null) },
      { session: makeSession("active", "mk-ref-1") },
    ];
    await waitForMikrotikAuthorization({
      timeoutMs: 5000,
      pollIntervalMs: 1,
      delay: () => Promise.resolve(),
      fetchStatus: async () => statuses[Math.min(call++, statuses.length - 1)],
      onPoll: (st) => polls.push(st),
    });
    expect(polls.length).toBeGreaterThanOrEqual(1);
  });
});