// ============================================================
// test/router-targets.test.mjs — Règles PURES partagées par les
// deux pilotes. Aucun matériel, aucun réseau.
//
// Ces règles protègent l'argent des abonnés : une erreur de
// correspondance de cible fait facturer le trafic d'un client à un
// autre (ou rien du tout).
// ============================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isIpv4,
  clientTarget,
  targetMatchesAddress,
  queueNameFor,
  parseCounter,
  parseDirectionCounter,
  queueTargetStrings,
  rowTargetsAddress,
  countersFromQueueRow,
  resolveClientAddress,
} from "../lib/router-targets.mjs";

test("isIpv4 valide le format strict", () => {
  assert.equal(isIpv4("10.0.0.5"), true);
  assert.equal(isIpv4("192.168.88.254"), true);
  assert.equal(isIpv4("0.0.0.0"), true);
  assert.equal(isIpv4("10.0.0"), false);
  assert.equal(isIpv4("10.0.0.5/24"), false);
  assert.equal(isIpv4("10.0.0.256"), false);
  assert.equal(isIpv4("10.0.0.-1"), false);
  assert.equal(isIpv4("10.0.0.5;drop"), false);
  assert.equal(isIpv4(""), false);
  assert.equal(isIpv4(null), false);
  assert.equal(isIpv4(undefined), false);
});

test("clientTarget impose un /32 (une file par client, jamais un réseau)", () => {
  assert.equal(clientTarget("10.0.0.5"), "10.0.0.5/32");
  assert.equal(clientTarget("10.0.0.5/32"), "10.0.0.5/32");
  // un /24 compterait tout le LAN dans le quota d'un seul client
  assert.throws(() => clientTarget("10.0.0.0/24"), /réseau refusée/i);
  assert.throws(() => clientTarget("pas-une-ip"), /Adresse client invalide/i);
});

test("correspondance de cible EXACTE — 10.0.0.5 ne vaut pas 10.0.0.50", () => {
  assert.equal(targetMatchesAddress("10.0.0.5/32", "10.0.0.5"), true);
  assert.equal(targetMatchesAddress("10.0.0.5", "10.0.0.5"), true);
  assert.equal(targetMatchesAddress("10.0.0.5/32", "10.0.0.50"), false);
  assert.equal(targetMatchesAddress("10.0.0.5/32", "10.0.0.5/24"), false);
  // un réseau plus large que le client NE doit pas être confondu
  assert.equal(targetMatchesAddress("10.0.0.0/24", "10.0.0.5"), false);
  assert.equal(targetMatchesAddress("", "10.0.0.5"), false);
  assert.equal(targetMatchesAddress(null, "10.0.0.5"), false);
});

test("queueNameFor : nom lisible, borné et sans caractère piégeux", () => {
  assert.equal(queueNameFor("10.0.0.5", "wz:8f4ac6e2"), "bojo-10.0.0.5-8f4ac6e2");
  assert.ok(queueNameFor("10.0.0.5", "wz:8f4ac6e2").length <= 32);
  assert.equal(queueNameFor("10.0.0.5", ""), "bojo-10.0.0.5");
  assert.equal(queueNameFor("10.0.0.5", undefined), "bojo-10.0.0.5");
  // un commentaire hostile ne doit ni casser Winbox ni le nom
  const hostile = queueNameFor("10.0.0.5", "wz:" + "x".repeat(500));
  assert.ok(hostile.length <= 32, `longueur ${hostile.length}`);
  assert.match(hostile, /^[A-Za-z0-9.:-]+$/);
  assert.ok(!hostile.includes(".."), "pas de nom de fichier ambigu");
});

test("parseCounter tolère les formats RouterOS", () => {
  assert.equal(parseCounter(1234), 1234);
  assert.equal(parseCounter("1234"), 1234);
  assert.equal(parseCounter("1 234 567"), 1234567);
  assert.equal(parseCounter("1,234,567"), 1234567);
  assert.equal(parseCounter("1234B"), 1234);
  assert.equal(parseCounter("0"), 0);
  // valeurs inexploitables → 0 (jamais NaN : le serveur rejette les
  // compteurs non entiers et ferait échouer toute la collecte)
  assert.equal(parseCounter(undefined), 0);
  assert.equal(parseCounter(null), 0);
  assert.equal(parseCounter("inconnu"), 0);
  assert.equal(parseCounter(-5), 0);
  assert.equal(parseCounter(Number.NaN), 0);
});

// ---- Compteurs : la propriété réelle est `bytes` (upload/download)

test("parseDirectionCounter lit le composite RouterOS « upload/download »", () => {
  // Format réel observé sur /queue/simple : bytes=16515474/129310087
  assert.deepEqual(parseDirectionCounter("16515474/129310087"), { up: 16515474, down: 129310087 });
  assert.deepEqual(parseDirectionCounter("0/0"), { up: 0, down: 0 });
  // Pas un couple => null (jamais 0/0 : ce serait indistinguable
  // d'une file réellement inutilisée).
  assert.equal(parseDirectionCounter("1234"), null);
  assert.equal(parseDirectionCounter("abc/def"), null);
  assert.equal(parseDirectionCounter(undefined), null);
  assert.equal(parseDirectionCounter(null), null);
});

test("countersFromQueueRow : `bytes` d'abord (ordre upload/download)", () => {
  const row = { bytes: "100/500", "total-bytes": 600 };
  const r = countersFromQueueRow(row);
  assert.deepEqual(r, { bytesIn: 500, bytesOut: 100, available: true });
});

test("countersFromQueueRow : repli sur total-bytes quand `bytes` est absent", () => {
  assert.deepEqual(countersFromQueueRow({ "total-bytes": 900 }), {
    bytesIn: 900,
    bytesOut: 0,
    available: true,
  });
});

test("countersFromQueueRow : une direction + total déduit l'autre (jamais doublé)", () => {
  const r = countersFromQueueRow({ "total-bytes": 900, "bytes-out": 100 });
  assert.equal(r.bytesIn, 800);
  assert.equal(r.bytesOut, 100);
  assert.equal(r.available, true);
});

test("countersFromQueueRow : AUCUN compteur => available=false (pas de 0 inventé)", () => {
  // C'est le cas qui rendait le quota figé SANS AUCUN SIGNAL :
  // l'agent croyait mesurer un trafic nul.
  const r = countersFromQueueRow({ name: "bojo-10.0.0.5", target: "10.0.0.5/32" });
  assert.deepEqual(r, { bytesIn: 0, bytesOut: 0, available: false });
});

test("countersFromQueueRow : total inférieur à une direction => jamais négatif", () => {
  const r = countersFromQueueRow({ "total-bytes": 10, "bytes-out": 100 });
  assert.equal(r.bytesIn, 0, "borne à 0, jamais négatif");
  assert.equal(r.bytesOut, 100);
});

// ---- Cibles RouterOS 7 imbriquées

test("queueTargetStrings : chaîne (ROS 6), liste et objet imbriqué (ROS 7)", () => {
  assert.deepEqual(queueTargetStrings({ target: "10.0.0.5/32" }), ["10.0.0.5/32"]);
  assert.deepEqual(queueTargetStrings({ target: "10.0.0.5,10.0.0.6" }), ["10.0.0.5,10.0.0.6"]);
  assert.deepEqual(
    queueTargetStrings({ target: { "target-address": { "ip-address": "10.0.0.5/32" } } }),
    ["10.0.0.5/32"]
  );
  // sans target exploitable => liste vide, jamais une cible inventée
  assert.deepEqual(queueTargetStrings({}), []);
  assert.deepEqual(queueTargetStrings({ target: null }), []);
});

test("rowTargetsAddress : cible imbriquée reconnue, voisine non confondu", () => {
  const ros7 = { target: { "target-address": { "ip-address": "10.0.0.5/32" } } };
  assert.equal(rowTargetsAddress(ros7, "10.0.0.5"), true);
  assert.equal(rowTargetsAddress(ros7, "10.0.0.50"), false);
  // cycle imbriqué infini : ne doit pas exploser
  const deep = {};
  deep.target = deep;
  assert.equal(rowTargetsAddress(deep, "10.0.0.5"), false);
});

// --- Résolution d'adresse observée sur le routeur -------------------------
// Ces cas couvrent le blocage qui rendait le test MikroTik impossible :
// l'app n'envoie pas d'adresse, l'agent doit la lire sur les baux DHCP.

test("resolveClientAddress : l'IP déclarée a la priorité (chemin historique)", () => {
  const r = resolveClientAddress({
    wantedIp: "10.0.0.9",
    leases: [{ address: "10.0.0.42", activeAddress: "10.0.0.42" }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.address, "10.0.0.9");
  assert.equal(r.how, "declared");
});

test("resolveClientAddress : un MAC sans bail correspondant REFUSE", () => {
  const r = resolveClientAddress({
    wantedMac: "AA:BB:CC:DD:EE:FF",
    leases: [{ address: "10.0.0.42", activeAddress: "10.0.0.42" }],
  });
  assert.equal(r.ok, false);
  assert.equal(r.address, null);
  assert.equal(r.how, "mac");
  // Le refus doit dire POURQUOI et COMBIEN de candidats vus, sinon le
  // déploiement tourne en rond sans piste.
  assert.match(r.reason, /MAC/);
  assert.equal(r.candidates, 1);
});

test("resolveClientAddress : sépare un client actif d'une plage statique", () => {
  const r = resolveClientAddress({
    leases: [
      { address: "10.0.0.42", activeAddress: "10.0.0.42" },
      { address: "10.0.0.100-10.0.0.200", dynamic: "false" }, // plage statique
      { address: "10.0.0.77", activeAddress: "10.0.0.77", blocked: "true" }, // bloqué
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.address, "10.0.0.42");
  assert.equal(r.how, "sole_client");
});

test("resolveClientAddress : à plusieurs clients, REFUSE de deviner", () => {
  // C'est le point de sécurité central : sans MAC, choisir une adresse
  // parmi deux reviendrait à autoriser le Wi-Fi du mauvais client, et
  // l'erreur est invisible depuis l'interface.
  const r = resolveClientAddress({
    leases: [
      { address: "10.0.0.42", activeAddress: "10.0.0.42" },
      { address: "10.0.0.43", activeAddress: "10.0.0.43" },
    ],
  });
  assert.equal(r.ok, false);
  assert.equal(r.address, null);
  assert.equal(r.how, "ambiguous");
  assert.equal(r.candidates, 2);
  assert.match(r.reason, /2 clients actifs/);
});

test("resolveClientAddress : aucun bail actif REFUSE (banc non associé)", () => {
  const r = resolveClientAddress({ leases: [] });
  assert.equal(r.ok, false);
  assert.equal(r.how, "none");
  assert.match(r.reason, /associé/);
});

test("resolveClientAddress : la MAC Prime sur le compte de clients", () => {
  // 3 clients actifs, mais une MAC identifie le bon : on n'ambiguïse pas.
  const r = resolveClientAddress({
    wantedMac: "AA-BB-CC-DD-EE-03", // séparateurs différents : normalisés
    leases: [
      { address: "10.0.0.41", activeAddress: "10.0.0.41", macAddress: "AA:BB:CC:DD:EE:01" },
      { address: "10.0.0.42", activeAddress: "10.0.0.42", macAddress: "AA:BB:CC:DD:EE:02" },
      { address: "10.0.0.43", activeAddress: "10.0.0.43", macAddress: "aabbccddee03" },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.address, "10.0.0.43");
  assert.equal(r.how, "mac");
});
