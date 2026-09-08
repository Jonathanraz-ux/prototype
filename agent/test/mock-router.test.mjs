// ============================================================
// test/mock-router.test.mjs — Le simulateur doit se comporter
// comme un routeur réel : liste d'adresses, compteurs cumulés.
// ============================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { MockRouter } from "../lib/mock-router.mjs";

test("authorize puis deauthorize", async () => {
  const r = new MockRouter({ bytesPerSec: 1000 });
  await r.connect();
  const out = await r.authorize({ address: "10.0.0.5", comment: "wz:abc12345" });
  assert.equal(out.reference, "mock:10.0.0.5");
  assert.equal((await r.clients()).length, 1);
  const removed = await r.deauthorize({ address: "10.0.0.5" });
  assert.equal(removed, true);
  assert.equal((await r.clients()).length, 0);
  await r.disconnect();
});

test("queues cumulées le temps passe", async () => {
  const r = new MockRouter({ bytesPerSec: 1000 });
  await r.authorize({ address: "192.168.0.9" });
  r.lastTick = Date.now() - 5000; // 5 s fictives
  const u = await r.queueUsage("192.168.0.9");
  assert.ok(u.bytesIn + u.bytesOut >= 4000);
  assert.ok(u.bytesIn >= 0 && u.bytesOut >= 0);
});