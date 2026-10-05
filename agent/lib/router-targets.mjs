// ============================================================
// lib/router-targets.mjs — Règles PURES partagées par les deux
// pilotes RouterOS (REST et API binaire).
//
// Pourquoi ce module existe :
//   1. une file simple MikroTik se cible par réseau ("10.0.0.5/32",
//      "10.0.0.5", éventuellement une liste) — la comparaison doit
//      être EXACTE. Un simple `startsWith` confondait 10.0.0.5 avec
//      10.0.0.50 et remontait le compteur d'un autre client ;
//   2. le nom de la file est dérivé de l'adresse + du commentaire de
//      session ("wz:ab12cd34") : il doit rester lisible dans Winbox
//      et stable entre deux rotations d'agent ;
//   3. les compteurs RouterOS arrivent en nombre OU en chaîne
//      ("1 234 567") selon le protocole : normalisation unique.
//
// Aucune dépendance, aucun accès réseau : testable sans matériel.
// ============================================================

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Adresse IPv4 valide, ou null. */
export function isIpv4(value) {
  const m = IPV4.exec(String(value ?? "").trim());
  if (!m) return false;
  return m.slice(1).every((part) => Number(part) >= 0 && Number(part) <= 255);
}

/**
 * Cible d'une file simple pour UN client : toujours /32.
 *
 * Un préfixe large est REFUSÉ : une file ciblant 10.0.0.0/24
 * compterait le trafic de tout le LAN dans le quota d'un seul
 * client (ou le débit de celui d'un voisin). Idem pour une adresse
 * invalide : mieux vaut une autorisation refusée qu'une file
 * fantôme.
 */
export function clientTarget(address) {
  const raw = String(address ?? "").trim();
  const [ip, prefix] = raw.split("/");
  if (!isIpv4(ip)) throw new Error(`Adresse client invalide : « ${raw} »`);
  if (prefix !== undefined && Number(prefix) !== 32) {
    throw new Error(
      `Cible réseau refusée (« ${raw} ») : l'agent ne gère qu'une file par client (/32)`
    );
  }
  return `${ip}/32`;
}

/**
 * La cible `target` d'une file simple correspond-elle EXACTEMENT au
 * client `address` ? Accepte "10.0.0.5", "10.0.0.5/32" et la forme
 * RouterOS "10.0.0.5,10.0.0.6" dont on ne retient que la première IP
 * (les files multi-cibles restent gérées par l'administrateur, pas
 * par l'agent). Ne confonds jamais 10.0.0.5 et 10.0.0.50.
 */
export function targetMatchesAddress(target, address) {
  const t = String(target ?? "").trim();
  const a = String(address ?? "").trim();
  if (!t || !a) return false;

  const first = t.split(",")[0].trim();
  const [ip, prefix] = first.split("/");
  if (ip !== a) return false;
  if (prefix === undefined) return true;
  const bits = Number(prefix);
  return Number.isFinite(bits) && (bits === 32 || bits === 0);
}

/** Nom de file lisible et déterministe : `bojo-10.0.0.5-wzab12cd34`. */
export function queueNameFor(address, comment) {
  const ip = String(address ?? "").trim().replace(/[^\d.]/g, "");
  const tag = String(comment ?? "")
    .replace(/^wz:/, "")
    .replace(/[^0-9a-zA-Z]/g, "")
    .slice(0, 8)
    .toLowerCase();
  const base = ip ? `bojo-${ip}` : "bojo-client";
  return tag ? `${base}-${tag}` : base;
}

/** Compteur RouterOS (nombre ou chaîne formatée) → entier ≥ 0. */
export function parseCounter(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  if (typeof value === "string") {
    const n = Number(value.replace(/[\s,]/g, "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  return 0;
}

/**
 * Compteur composé RouterOS `upload/download` → les deux directions.
 *
 * `/queue/simple` expose la propriété `bytes` sous la forme
 * `"16515474/129310087"` (montant / descendant). Le nom exact et cet
 * ordre sont ceux du manuel RouterOS : `bytes | composite {upload, download}`.
 *
 * Renvoie `null` si la valeur n'est pas un couple — jamais `0/0`, qui
 * serait indiscernable d'une file réellement inutilisée et ferait
 * croire à un compteur qui fonctionne alors qu'il n'a rien lu.
 */
export function parseDirectionCounter(value) {
  if (typeof value === "number") return { up: parseCounter(value), down: 0 };
  if (typeof value !== "string") return null;
  const parts = value.split("/");
  if (parts.length !== 2) return null;
  if (!parts.every((p) => /\d/.test(p))) return null;
  return { up: parseCounter(parts[0]), down: parseCounter(parts[1]) };
}

/**
 * Cibles d'une file simple, sous TOUTES les formes que renvoie RouterOS.
 *
 * RouterOS 6 (et REST jusqu'à 7.13) expose `target` en chaîne :
 *   "192.168.88.10/32"  ou  "192.168.88.10,192.168.88.11"
 *
 * RouterOS 7 recent l'expose en OBJET imbriqué :
 *   { "target": { "target-address": { "ip-address": "192.168.88.10/32" } } }
 *
 * Sans cette normalisation, `findQueue` ne reconnaîtrait jamais sa
 * propre file : l'agent la recréerait à chaque collecte (fuite de files
 * simples) et ne remonterait AUCUN octet — le quota resterait figé.
 */
export function queueTargetStrings(row) {
  const out = [];
  const seen = new Set();
  const push = (v) => {
    if (typeof v !== "string") return;
    const s = v.trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  const walk = (value, depth) => {
    if (depth > 4 || value === null || value === undefined) return;
    if (typeof value === "string" || typeof value === "number") {
      push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (typeof value === "object") {
      for (const item of Object.values(value)) walk(item, depth + 1);
    }
  };
  walk(row?.target ?? row?.["target-address"] ?? row?.targets, 0);
  return out;
}

/** La file dont la cible correspond EXACTEMENT à `address` ? */
export function rowTargetsAddress(row, address) {
  return queueTargetStrings(row).some((t) => targetMatchesAddress(t, address));
}

/**
 * Compteurs d'une file simple ROBUSTE, quel que soit RouterOS.
 *
 * Ordre de préférence (du plus fiable au moins fiable) :
 *   1. `bytes` → composite `"upload/download"` (propriété du manuel) ;
 *   2. `bytes-in` / `bytes-out` puis `rx-bytes` / `tx-bytes`
 *      (noms explicites, rencontrés sur certaines versions) ;
 *   3. `total-bytes` seul → tout compté en download.
 *
 * `available: false` signifie qu'aucun compteur n'a été lu. C'est la
 * information la plus importante du module : sans elle, un routeur qui
 * ne renvoie aucun compteur passerait pour un compteur à zéro, et
 * l'agent accorderait un accès qu'il ne mesure pas. Le contrôle pré-vol
 * s'appuie dessus pour BLOQUER le jour J plutôt que de laisser courir.
 *
 * Sens des directions : `bytes-in` est le trafic entrant dans la cible,
 * c'est-à-dire le DOWNLOAD du client. `bytes="upload/download"` place
 * donc l'upload en premier.
 */
export function countersFromQueueRow(row) {
  const composite = parseDirectionCounter(row?.bytes);
  if (composite) {
    return { bytesIn: composite.down, bytesOut: composite.up, available: true };
  }
  const inRaw = row?.["bytes-in"] ?? row?.["rx-bytes"];
  const outRaw = row?.["bytes-out"] ?? row?.["tx-bytes"];
  const totalRaw = row?.["total-bytes"];
  const hasIn = inRaw !== undefined;
  const hasOut = outRaw !== undefined;
  const hasTotal = totalRaw !== undefined;

  if (hasIn || hasOut) {
    const known = parseCounter(hasIn ? inRaw : outRaw);
    // Une seule direction + le total : l'autre direction se déduit.
    // On ne retombe JAMAIS sur le total pour les deux (le download
    // serait alors compté comme de l'upload et facturé deux fois).
    if (hasTotal && !(hasIn && hasOut)) {
      const other = Math.max(parseCounter(totalRaw) - known, 0);
      return hasIn
        ? { bytesIn: known, bytesOut: other, available: true }
        : { bytesIn: other, bytesOut: known, available: true };
    }
    return {
      bytesIn: hasIn ? parseCounter(inRaw) : 0,
      bytesOut: hasOut ? parseCounter(outRaw) : 0,
      available: true,
    };
  }
  if (hasTotal) {
    return { bytesIn: parseCounter(totalRaw), bytesOut: 0, available: true };
  }
  return { bytesIn: 0, bytesOut: 0, available: false };
}
