// ============================================================
// lib/mock-router.mjs — Routeur SIMULÉ (aucun équipement requis).
// Pour le déroulé de bout en bout avant mercredi : l'address-list
// et les compteurs vivent en mémoire ; chaque client actif génère
// un débit simulé (AGENT_MOCK_BYTES_PER_SEC).
// ============================================================

export class MockRouter {
  constructor({ listName = "wz-active", bytesPerSec = 120000 } = {}) {
    this.name = "mock";
    this.listName = listName;
    this.bytesPerSec = bytesPerSec;
    this.entries = new Map(); // address -> { comment, bytesIn, bytesOut }
    this.lastTick = Date.now();
  }

  async connect() {
    // rien à faire
  }

  async disconnect() {
    // rien à faire
  }

  async authorize({ address, comment } = {}) {
    if (!address) throw new Error("authorize: adresse requise");
    const prev = this.entries.get(address) ?? { bytesIn: 0, bytesOut: 0 };
    this.entries.set(address, { comment: comment ?? "", ...prev });
    return { reference: `mock:${address}`, address };
  }

  async deauthorize({ address } = {}) {
    if (address && this.entries.delete(address)) return true;
    return false;
  }

  async clients() {
    this.tickCounters();
    return [...this.entries.entries()].map(([address, v]) => ({
      address,
      comment: v.comment,
      reference: `mock:${address}`,
    }));
  }

  async queueUsage(address) {
    this.tickCounters();
    const v = this.entries.get(address);
    if (!v) return null;
    return { bytesIn: v.bytesIn, bytesOut: v.bytesOut, reference: `mock:${address}` };
  }

  // Le temps simulé fait grandir les compteurs des clients actifs.
  tickCounters() {
    const now = Date.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    const perTick = Math.max(1, Math.floor((this.bytesPerSec * dt) / 1000));
    for (const v of this.entries.values()) {
      // cycle alterné pour simuler up/down réels
      const up = Math.floor(perTick * 0.9);
      const down = perTick - up;
      v.bytesIn = Math.max(0, v.bytesIn) + down;
      v.bytesOut = Math.max(0, v.bytesOut) + up;
    }
  }
}