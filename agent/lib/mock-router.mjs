// ============================================================
// lib/mock-router.mjs — Routeur SIMULÉ (aucun équipement requis).
// Pour le déroulé de bout en bout avant le routeur : l'address-list
// et les compteurs vivent en mémoire ; chaque client actif génère
// un débit simulé (AGENT_MOCK_BYTES_PER_SEC).
// ============================================================

import { clientTarget, queueNameFor } from "./router-targets.mjs";

export class MockRouter {
  constructor({ listName = "wz-active", bytesPerSec = 120000, leases } = {}) {
    this.name = "mock";
    this.listName = listName;
    this.bytesPerSec = bytesPerSec;
    this.entries = new Map(); // address -> { comment, bytesIn, bytesOut }
    this.queues = new Map(); // address -> nom de file
    this.lastTick = Date.now();
    this.leases = leases;
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

  /**
   * Contrat commun aux vrais routeurs : la file de comptage fait
   * partie de l'autorisation. Le simulateur n'a rien à créer — ses
   * compteurs sont générés par le temps simulé — mais la méthode
   * existe pour que le moteur se comporte à l'identique.
   */
  async ensureQueue({ address, comment } = {}) {
    if (!address) throw new Error("ensureQueue: adresse requise");
    const name = queueNameFor(address, comment);
    const known = this.queues.get(address);
    this.queues.set(address, name);
    return { created: !known, id: null, name, target: clientTarget(address) };
  }

  /** Renvoie true si une file a réellement été supprimée (comme le REST). */
  async removeQueue({ address } = {}) {
    if (!address) return false;
    return this.queues.delete(address);
  }

  async connect() {
    return true;
  }

  async disconnect() {}

  async close() {}

  async deauthorize({ address } = {}) {
    if (address && this.entries.delete(address)) return true;
    return false;
  }

  /**
   * Baux DHCP simulés. Le mock expose une méthode de plus que le vrai
   * routeur n'a de raison d'en avoir : c'est ce qui permet de tester le
   * moteur SANS adresse déclarée, exactement comme le fait l'app.
   *
   * Par défaut un seul client actif : la résolution « sole_client » est
   * alors la seule possible, comme sur un banc de test à un téléphone.
   * Les tests peuvent en injecter d'autres via le constructeur.
   */
  async dhcpLeases() {
    return (this.leases ?? [{ address: "10.0.0.42", activeAddress: "10.0.0.42", dynamic: "true" }]).map(
      (l) => ({ status: "bound", blocked: "false", ...l })
    );
  }

  async clients() {
    this.tickCounters();
    return [...this.entries.entries()].map(([address, v]) => ({
      address,
      comment: v.comment,
      reference: `mock:${address}`,
    }));
  }

  /**
   * Compteurs de la file du client. Comme sur un vrai routeur : sans
   * file, AUCUNE mesure n'est disponible (c'est précisément ce qui
   * rend la création de file obligatoire pour l'autorisation, et ce
   * que l'auto-réparation du moteur doit détecter).
   */
  async queueUsage(address) {
    this.tickCounters();
    if (!this.queues.has(address)) return null;
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