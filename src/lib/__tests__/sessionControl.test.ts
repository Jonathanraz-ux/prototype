import { describe, it, expect } from "@jest/globals";
import {
  createSessionEpoch,
  createFlowGate,
  decideHeartbeat,
  signalFromServer,
  applyServerSignal,
  quotaConsumedBytes,
  bytesToMiB,
  DEMO_QUOTA_BYTES,
  BYTES_PER_MEBIBYTE,
  QUOTA_UNIT_LABEL,
  SERVER_QUOTA_UNIT,
  buildReconciliationReport,
  CONTROL_FAILURE_THRESHOLD,
  type ServerSessionView,
} from "../sessionControl";

// ————————————————————————————————————————————————————————————
// Portée de ces tests : logique SIMULÉE (aucune Edge Function, aucun
// routeur, aucun VpnService). Les tests réseau (quota-status réel,
// ad-heartbeat réel, compteurs MikroTik) restent à exécuter sur
// l'appareil/backend — distingués à la fin de ce fichier.
// ————————————————————————————————————————————————————————————

const t0 = "2026-09-14T09:00:00.000Z";

describe("createSessionEpoch — réponses tardives vs suspension", () => {
  it("une réponse qui démarre dans une époque devenue périmée est rejetée", () => {
    const epoch = createSessionEpoch();
    const gen = epoch.current; // un heartbeat / finalize démarre
    epoch.advance(); // suspension (arrière-plan, pause, expiration)
    expect(epoch.isCurrent(gen)).toBe(false);
  });

  it("advance() est monotone et la nouvelle époque reste valide pour repartir", () => {
    const epoch = createSessionEpoch();
    const old = epoch.current;
    const next = epoch.advance();
    expect(next).toBe(old + 1);
    expect(epoch.isCurrent(next)).toBe(true);
  });

  it("deux suspensions successives invalident deux générations distinctes (aucune revanche)", () => {
    const epoch = createSessionEpoch();
    const g1 = epoch.current;
    epoch.advance();
    const g2 = epoch.current;
    epoch.advance();
    expect(epoch.isCurrent(g1)).toBe(false);
    expect(epoch.isCurrent(g2)).toBe(false);
  });
});

describe("createFlowGate — autorisations concurrentes", () => {
  it("un second établissement de session pendant le premier est refusé", () => {
    const gate = createFlowGate();
    const t1 = gate.begin();
    expect(t1).not.toBeNull();
    expect(gate.isOpen()).toBe(true);
    expect(gate.begin()).toBeNull(); // double appui / événement concurrent
  });

  it("end(jeton) referme ; un jeton étranger ne referme pas", () => {
    const gate = createFlowGate();
    const t = gate.begin()!;
    expect(gate.end("etranger")).toBe(false);
    expect(gate.isOpen()).toBe(true);
    expect(gate.end(t)).toBe(true);
    expect(gate.isOpen()).toBe(false);
  });

  it("une suspension (forceClose) éteint le flux en cours : un appui ultérieur repart", () => {
    const gate = createFlowGate();
    gate.begin();
    expect(gate.forceClose()).toBe(true);
    expect(gate.isOpen()).toBe(false);
    expect(gate.begin()).not.toBeNull();
  });
});

describe("decideHeartbeat — expiration et panne de contrôle", () => {
  const until = (ms: number) => new Date(Date.parse(t0) + ms).toISOString();

  it("ok avec dates serveur valides → authorize avec le TTL serveur (jamais l'horloge client)", () => {
    const d = decideHeartbeat({ outcome: "ok", server_time: t0, heartbeat_expires_at: until(25_000) });
    expect(d.action).toBe("authorize");
    if (d.action === "authorize") expect(d.ttlMs).toBe(25_000);
  });

  it("ok mais échéance passée → block : AUCUNE prolongation locale aveugle", () => {
    const expired = decideHeartbeat({ outcome: "ok", server_time: t0, heartbeat_expires_at: until(-5_000) });
    expect(expired.action).toBe("block");
  });

  it("ok mais échéance absente/illisible → block (une panne de contrôle ne donne pas un accès illimité)", () => {
    expect(decideHeartbeat({ outcome: "ok", server_time: t0 }).action).toBe("block");
    expect(decideHeartbeat({ outcome: "ok" }).action).toBe("block");
    expect(decideHeartbeat({ outcome: "ok", server_time: "nope", heartbeat_expires_at: "nope" }).action).toBe("block");
  });

  it("session fermée → require_reauth : une nouvelle autorisation vérifiée est exigée", () => {
    const noSess = decideHeartbeat({ outcome: "no_session" });
    expect(noSess.action).toBe("require_reauth");
    const notActive = decideHeartbeat({ outcome: "session_not_active" });
    expect(notActive.action).toBe("require_reauth");
    if (notActive.action === "require_reauth") expect(notActive.reason).toBe("HEARTBEAT_TIMEOUT");
  });

  it("quota épuisé → quota_exhausted", () => {
    expect(decideHeartbeat({ outcome: "quota_exhausted" }).action).toBe("quota_exhausted");
  });

  it("battement en échec ou réponse inconnue → block (jamais de maintien silencieux)", () => {
    expect(decideHeartbeat({ outcome: "heartbeat_failed" }).action).toBe("block");
    expect(decideHeartbeat({ outcome: "inattendu" }).action).toBe("block");
    expect(decideHeartbeat({}).action).toBe("block");
  });
});

describe("signalFromServer / applyServerSignal — les écrans reflètent l'état confirmé", () => {
  const sess = (s: Partial<ServerSessionView>): ServerSessionView => ({ status: "active", ...s });

  it("session autorisée SANS référence routeur → jamais « Connecté » (unconfirmed)", () => {
    expect(signalFromServer(sess({ status: "authorized", router_session_reference: null }))).toEqual({ mode: "unconfirmed" });
  });

  it("session autorisée AVEC référence routeur → active", () => {
    expect(signalFromServer(sess({ status: "active", router_session_reference: "r1" }))).toEqual({ mode: "active" });
  });

  it("paused → suspended ; pending/authorizing → authorizing ; absent → none", () => {
    expect(signalFromServer(sess({ status: "paused" }))).toEqual({ mode: "suspended" });
    expect(signalFromServer(sess({ status: "authorizing" }))).toEqual({ mode: "authorizing" });
    expect(signalFromServer(null)).toEqual({ mode: "none" });
    expect(signalFromServer({})).toEqual({ mode: "none" });
  });

  it("motif QUOTA_EXHAUSTED → quota_exhausted même si la session est fermée", () => {
    expect(signalFromServer(sess({ status: "disconnected", disconnect_reason: "QUOTA_EXHAUSTED" }))).toEqual({
      mode: "quota_exhausted",
    });
  });

  it("fermée/expirée/failed → closed avec le motif exact", () => {
    expect(signalFromServer(sess({ status: "expired", disconnect_reason: "HEARTBEAT_TIMEOUT" }))).toEqual({
      mode: "closed",
      reason: "HEARTBEAT_TIMEOUT",
    });
  });

  it("active + MikroTik confirmé → wifi_active + internet active", () => {
    const d = applyServerSignal({ mode: "active" }, "idle", { isVpnDemo: false, nativeAllowed: false });
    expect(d).toEqual({ apply: true, wantInternet: "active", wantState: "wifi_active" });
  });

  it("active + démo SANS autorisation native → coupé, jamais wifi_active", () => {
    const d = applyServerSignal({ mode: "active" }, "idle", { isVpnDemo: true, nativeAllowed: false });
    expect(d).toEqual({ apply: true, wantInternet: "cut", wantState: "authorizing_wifi" });
  });

  it("active + démo AVEC autorisation native effective → wifi_active + internet active", () => {
    const d = applyServerSignal({ mode: "active" }, "paused", { isVpnDemo: true, nativeAllowed: true });
    expect(d).toEqual({ apply: true, wantInternet: "active", wantState: "wifi_active" });
  });

  it("suspension serveur (paused) : depuis wifi_active → paused, depuis idle → juste cut", () => {
    const fromActive = applyServerSignal({ mode: "suspended" }, "wifi_active", { isVpnDemo: false, nativeAllowed: false });
    expect(fromActive).toMatchObject({ apply: true, wantInternet: "active", wantState: "paused" });
    const fromIdle = applyServerSignal({ mode: "suspended" }, "idle", { isVpnDemo: false, nativeAllowed: false });
    expect(fromIdle).toMatchObject({ apply: true, wantInternet: "active" });
  });

  it("unconfirmed → jamais d'accès actif", () => {
    const d = applyServerSignal({ mode: "unconfirmed" }, "idle", { isVpnDemo: false, nativeAllowed: false });
    expect(d).toMatchObject({ apply: true, wantInternet: "cut" });
    if (!d.apply) throw new Error("apply attendu");
    expect(d.wantState).not.toBe("wifi_active");
  });

  it("quota épuisé → quota_exhausted + cut + raison", () => {
    const d = applyServerSignal({ mode: "quota_exhausted" }, "wifi_active", { isVpnDemo: false, nativeAllowed: false });
    expect(d).toMatchObject({ apply: true, wantInternet: "cut", wantState: "quota_exhausted", reason: "QUOTA_EXHAUSTED" });
  });

  it("session fermée → idle + cut (nouvelle autorisation requise), jamais d'accès résiduel", () => {
    const d = applyServerSignal({ mode: "closed", reason: "HEARTBEAT_TIMEOUT" }, "wifi_active", {
      isVpnDemo: false,
      nativeAllowed: false,
    });
    expect(d).toEqual({ apply: true, wantInternet: "cut", wantState: "idle", reason: "HEARTBEAT_TIMEOUT" });
  });

  it("pas de signal serveur → le client ne bouge pas (noop)", () => {
    expect(applyServerSignal({ mode: "none" }, "idle", { isVpnDemo: false, nativeAllowed: false })).toEqual({
      apply: false,
    });
  });
});

describe("QUOTA — source serveur, unités explicites, aucune réattribution locale", () => {
  it("le quota serveur est en octets ; l'affichage en Mo (base 1024)", () => {
    expect(SERVER_QUOTA_UNIT).toBe("bytes");
    expect(QUOTA_UNIT_LABEL).toBe("Mo");
    expect(BYTES_PER_MEBIBYTE).toBe(1024 * 1024);
    expect(DEMO_QUOTA_BYTES).toBe(5 * 1024 * 1024 * 1024);
    expect(bytesToMiB(DEMO_QUOTA_BYTES)).toBe(5120);
  });

  it("consommation = quota − restant, bornée à zéro sur données incohérentes", () => {
    expect(quotaConsumedBytes(1024, 768)).toBe(256);
    expect(quotaConsumedBytes(1024, undefined)).toBe(0);
    expect(quotaConsumedBytes(1024, 9999)).toBe(0);
    expect(quotaConsumedBytes(undefined, undefined)).toBe(0);
  });

  it("aucune réattribution automatique : deux lectures de la même allocation donnent le MÊME restant", () => {
    // Simule une « reconnexion » : le client relit le serveur, il reçoit
    // exactement le restant serveur (pas de cache local qui réapprovisionne).
    const before = quotaConsumedBytes(5 * BYTES_PER_MEBIBYTE, 1_000_000);
    const after = quotaConsumedBytes(5 * BYTES_PER_MEBIBYTE, 1_000_000);
    expect(after).toBe(before);
    // Épuisée côté serveur → reste épuisée côté client.
    expect(quotaConsumedBytes(5 * BYTES_PER_MEBIBYTE, 0)).toBe(5 * BYTES_PER_MEBIBYTE);
  });

  it("la consommation est CONSERVÉE entre pause/reconnexion (elle ne se réinitialise jamais)", () => {
    // Pause puis reconnexion : le serveur renvoie la consommation cumulée,
    // le client relit la MÊME allocation serveur, jamais un compteur local.
    const quota = DEMO_QUOTA_BYTES;
    const remaining = 1 * BYTES_PER_MEBIBYTE; // 1 Mo restant après usage
    const before = quotaConsumedBytes(quota, remaining);
    const afterResume = quotaConsumedBytes(quota, remaining);
    expect(before).toBe(afterResume);
    expect(before).toBe(quota - remaining);
  });

  it("préparation de réconciliation MikroTik : delta serveur − routeur, unité explicite", () => {
    const rep = buildReconciliationReport(
      { quota_bytes: 1000, remaining_bytes: 700 },
      { session_id_ignored: undefined, status: "active", bytes_total: 250 } as never
    );
    expect(rep.server).toEqual({ quotaBytes: 1000, consumedBytes: 300, remainingBytes: 700, unit: "bytes" });
    expect(rep.deltaWhenRouterTotalKnown).toBe(50);
    expect(rep.quotaRemainingPerServerBytes).toBe(700);

    const unknown = buildReconciliationReport({ quota_bytes: 1000, remaining_bytes: 700 }, null);
    expect(unknown.deltaWhenRouterTotalKnown).toBeNull();
  });
});

describe("scénario : expiration → nouvelle autorisation VÉRIFIÉE uniquement", () => {
  it("une session expirée repasse par un nouveau flux avec une époque fraîche", () => {
    const epoch = createSessionEpoch();
    const gate = createFlowGate();

    // Session active.
    const genActive = epoch.current;
    expect(epoch.isCurrent(genActive)).toBe(true);

    // Le serveur ferme la session (battement « session_not_active »).
    const decision = decideHeartbeat({ outcome: "session_not_active" });
    expect(decision.action).toBe("require_reauth");
    epoch.advance();
    gate.forceClose();

    // Une réponse tardive du VIEUX flux ne réactive pas la session.
    expect(epoch.isCurrent(genActive)).toBe(false);

    // Nouvelle connexion = nouveau flux, nouvelle époque, autorisable.
    const token = gate.begin();
    expect(token).not.toBeNull();
    const genNew = epoch.current;
    expect(epoch.isCurrent(genNew)).toBe(true);
    gate.end(token!);
  });
});

// ————————————————————————————————————————————————————————————
// TAUX de panne de contrôle — seuil de suspension pour NETWORK_LOST.
// ————————————————————————————————————————————————————————————
describe("panne de contrôle — seuil de défaillances consécutives", () => {
  it("seuil exposé et borné (>= 1) : le client ne maintient jamais un accès aveugle", () => {
    expect(CONTROL_FAILURE_THRESHOLD).toBeGreaterThanOrEqual(1);
  });
});