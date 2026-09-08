// ============================================================
// _shared/quota.test.ts — Tests Deno du module quota.
// Run : deno test supabase/functions/_shared/quota.test.ts
// ============================================================

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  BYTES_PER_GB,
  TEST_QUOTA_BYTES,
  buildQuotaSnapshot,
  clampDelta,
  isExhausted,
  formatBytes,
} from "./quota.ts";

Deno.test("quota: le quota de test est exactement 5 Go", () => {
  assertEquals(BYTES_PER_GB, 1073741824);
  assertEquals(TEST_QUOTA_BYTES, 5368709120);
  assertEquals(TEST_QUOTA_BYTES, 5 * 1024 * 1024 * 1024);
});

Deno.test("quota: snapshot borné strictement (pas de négatif, pas de dépassement)", () => {
  const fresh = buildQuotaSnapshot(TEST_QUOTA_BYTES, 0);
  assertEquals(fresh.remaining_bytes, TEST_QUOTA_BYTES);
  assert(!fresh.exhausted);

  const partial = buildQuotaSnapshot(TEST_QUOTA_BYTES, 1024);
  assertEquals(partial.consumed_bytes, 1024);
  assertEquals(partial.remaining_bytes, TEST_QUOTA_BYTES - 1024);

  const over = buildQuotaSnapshot(TEST_QUOTA_BYTES, TEST_QUOTA_BYTES + 50);
  assertEquals(over.consumed_bytes, TEST_QUOTA_BYTES);
  assertEquals(over.remaining_bytes, 0);
  assert(over.exhausted);

  const zero = buildQuotaSnapshot(TEST_QUOTA_BYTES, TEST_QUOTA_BYTES);
  assert(zero.exhausted);
  assertEquals(zero.remaining_bytes, 0);

  const negative = buildQuotaSnapshot(-50, -30);
  assertEquals(negative.quota_bytes, 0);
  assertEquals(negative.consumed_bytes, 0);
  assert(negative.exhausted);
});

Deno.test("quota: clampDelta borde au reste disponible", () => {
  assertEquals(clampDelta(10, 100), 10);
  assertEquals(clampDelta(200, 100), 100);
  assertEquals(clampDelta(-5, 100), 0);
  assertEquals(clampDelta(10, -1), 0);
  assertEquals(clampDelta(10, 0), 0);
});

Deno.test("quota: isExhausted", () => {
  assert(isExhausted(0));
  assert(isExhausted(-1));
  assert(!isExhausted(1));
});

Deno.test("quota: formatBytes lisible", () => {
  assertEquals(formatBytes(0), "0 o");
  assertEquals(formatBytes(1536), "1.50 Ko");
  assertEquals(formatBytes(5368709120), "5.00 Go");
  assertEquals(formatBytes(TEST_QUOTA_BYTES - 1024 * 1024 * 100), "4.90 Go");
});