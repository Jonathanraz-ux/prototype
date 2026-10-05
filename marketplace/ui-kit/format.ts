/**
 * Formatters d'unités réseau pour l'interface.
 *
 * Convention volontairement simple : les valeurs entrantes sont en
 * kilo-octets (MB côté session, kbps côté débit), la sortie est lisible
 * par un humain en français.
 */

/** 1 500 kbps → « 1.5 Mbps ». */
export function formatSpeed(kbps: number): string {
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`;
  }
  return `${kbps} Kbps`;
}

/** 2 048 Mo → « 2.00 GB ». */
export function formatBytes(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(0)} MB`;
}

/** 95 minutes → « 1h 35min ». */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}min`;
  }
  return `${mins}min`;
}
