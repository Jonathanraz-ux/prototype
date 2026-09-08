// ============================================================
// _shared/quota.ts — Calculs de quota en octets.
// Module PUR (aucune I/O) : testable hors contexte Edge Runtime.
// ============================================================

export const BYTES_PER_GB = 1024 * 1024 * 1024;

/** Quota du test physique mercredi : 5 Go, exactement 5 368 709 120 octets. */
export const TEST_QUOTA_BYTES = 5 * BYTES_PER_GB;

export interface QuotaSnapshot {
  quota_bytes: number;
  consumed_bytes: number;
  remaining_bytes: number;
  exhausted: boolean;
}

function floorNonNegative(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** Construit l'instantané de quota avec bornes strictes (jamais négatif, jamais > quota). */
export function buildQuotaSnapshot(quota_bytes: number, consumed_bytes: number): QuotaSnapshot {
  const quota = floorNonNegative(quota_bytes);
  const raw = floorNonNegative(consumed_bytes);
  const consumed = Math.min(raw, quota);
  const remaining = quota - consumed;
  return {
    quota_bytes: quota,
    consumed_bytes: consumed,
    remaining_bytes: remaining,
    exhausted: remaining <= 0,
  };
}

/** Borde un delta de consommation à ce qui reste réellement (>= 0). */
export function clampDelta(delta_bytes: number, remaining_bytes: number): number {
  const delta = floorNonNegative(delta_bytes);
  const remaining = floorNonNegative(remaining_bytes);
  return Math.min(delta, remaining);
}

export function isExhausted(remaining_bytes: number): boolean {
  return remaining_bytes <= 0;
}

/** Lecture humaine pour les logs / administrateurs (o, Ko, Mo, Go). */
export function formatBytes(bytes: number, decimals = 2): string {
  const value = floorNonNegative(bytes);
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(decimals)} Ko`;
  if (value < BYTES_PER_GB) return `${(value / (1024 * 1024)).toFixed(decimals)} Mo`;
  return `${(value / BYTES_PER_GB).toFixed(decimals)} Go`;
}