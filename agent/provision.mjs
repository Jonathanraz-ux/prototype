// ============================================================
// provision.mjs — Provisionnement AUTO-VERIFIE du routeur MikroTik.
//
// Objectif : poser la configuration complete sans intervention
// manuelle, la rendre REVERSIBLE, et permettre a un tiers de la
// verifier SEUL (lecture seule) avant de l'activer.
//
//   node provision.mjs            pose tout, DESARME (par defaut)
//   node provision.mjs --arm      active la regle de blocage
//   node provision.mjs --verify   controle seul, n'ecrit rien
//   node provision.mjs --undo     ne retire que nos objets (wz:)
//
// Le blocage est pose DESACTIVE par defaut : tant que personne n'a
// verifie, une regle erronee ne peut pas couper Internet.
// ============================================================

import { RouterOSApi } from "./lib/routeros-api.mjs";
import { loadAgentEnv } from "./config.mjs";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const WZ_LIST = "wz-active";
const WZ_IFACE_LIST = "wz-clients";
const WZ_USER = "wifi-agent";
const DOCTOR_TAG = "wz:doctor";
const PROBE_IP = "192.0.2.1";
const RESERVE = "192.0.2.1/32";
const DEFAULT_NET = "192.168.88.0/24";
const DEFAULT_DNS = "1.1.1.1,8.8.8.8";
const PASS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

const log = {
  info: (...p) => console.log(...p),
  warn: (...p) => console.warn("[WARN]", ...p),
  error: (...p) => console.error("[ERR]", ...p),
};

function getArg(args, key) {
  const i = args.indexOf(key);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith("--")) return args[i + 1];
  return null;
}

function parseArgs(argv) {
  return {
    mock: argv.includes("--mock"),
    verify: argv.includes("--verify") || argv.includes("--check"),
    undo: argv.includes("--undo"),
    arm: argv.includes("--arm"),
    backup: !argv.includes("--no-backup"),
    lan: getArg(argv, "--lan"),
    ipAgent: getArg(argv, "--ip-agent"),
    user: getArg(argv, "--user") || WZ_USER,
    output: getArg(argv, "--output") || "provision-rapport.txt",
  };
}

function randomPass(n = 16) {
  let s = "";
  for (let i = 0; i < n; i++) s += PASS_ALPHABET[(Math.random() * PASS_ALPHABET.length) | 0];
  return s;
}

/** IP du PC executant ce script : sert a exempter l'agent du pare-feu. */
function localAgentIp() {
  try {
    const out = execSync("ipconfig", { encoding: "utf8" });
    const ips = [
      ...out.matchAll(/\b(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)\b/g),
    ].map((m) => m[1]);
    return ips[0] ?? "";
  } catch {
    return "";
  }
}

function reportLine(x) {
  return `[${x.ok ? "OK " : "KO "}] ${x.label}${x.detail ? " - " + x.detail : ""}`;
}

function writeReport(path, report, meta) {
  const header = [
    "# RAPPORT DE PROVISIONNEMENT WiFi Zone",
    `Date      : ${new Date().toISOString()}`,
    `Routeur   : ${meta.host ?? "(inconnu)"}`,
    `Interface : ${meta.iface ?? "-"}`,
    `Reseau    : ${meta.net ?? "-"}`,
    `PC agent  : ${meta.ipAgent || "(NON RENSEIGNE)"}`,
    `Blocage   : ${meta.armed ? "ARME" : "DESARME"}`,
    "",
  ];
  const body = report.map(reportLine);
  const ko = report.filter((x) => !x.ok);
  const tail = ko.length ? ["", `${ko.length} point(s) en échec :`, ...ko.map(reportLine)] : ["", "TOUT EST OK"];
  try {
    writeFileSync(path, [...header, ...body, ...tail].join("\n") + "\n", "utf8");
  } catch (e) {
    log.warn("rapport non écrit :", e?.message ?? e);
  }
}

/**
 * Interface portant le réseau de gestion (celle que le pare-feu voit).
 * On privilégie le LAN 192.168.88.x des hAP d'usine, sinon la première
 * adresse privée hors WAN. Ne jamais deviner un nom d'interface WiFi.
 */
async function detectLan(router) {
  const res = await router.exec("/ip/address/print");
  if (!res.ok) return { iface: "", net: DEFAULT_NET, detail: res.message };
  const rows = res.rows;
  const wan = await router.exec("/ip/route/print", { "dst-address": "0.0.0.0/0" });
  const wanIfaces = new Set((wan.ok ? wan.rows : []).map((r) => String(r.interface || "").replace(/\d+$/, "")));
  const lan = rows.find((r) => String(r.address || "").startsWith("192.168.88."));
  if (lan) {
    return { iface: String(lan.interface || ""), net: DEFAULT_NET, detail: String(lan.address) };
  }
  const priv = rows.find(
    (r) =>
      String(r.disabled || "false") !== "true" &&
      !wanIfaces.has(String(r.interface || "").replace(/\d+$/, "")) &&
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(String(r.address || ""))
  );
  if (priv) {
    const addr = String(priv.address || "");
    const net = addr.includes("/") ? addr.slice(0, addr.indexOf("/") + 1) + addr.split("/")[1] : DEFAULT_NET;
    return { iface: String(priv.interface || ""), net, detail: addr };
  }
  return { iface: "", net: DEFAULT_NET, detail: "aucune adresse privée trouvée" };
}

async function ensureInterfaceList(router, iface) {
  const report = [];
  const list = await router.exec("/interface/list/print");
  if (!list.ok) {
    report.push({ label: "lecture /interface/list", ok: false, detail: list.message });
    return report;
  }
  if (!list.rows.some((x) => String(x.name || "") === WZ_IFACE_LIST)) {
    const add = await router.exec("/interface/list/add", {
      name: WZ_IFACE_LIST,
      comment: "WiFi Zone (detecte automatiquement)",
    });
    report.push({ label: `creation liste ${WZ_IFACE_LIST}`, ok: add.ok, detail: add.message || "OK" });
  } else {
    report.push({ label: `liste ${WZ_IFACE_LIST}`, ok: true, detail: "déjà présente" });
  }
  const members = await router.exec("/interface/list/member/print", { list: WZ_IFACE_LIST });
  if (!members.ok) {
    report.push({ label: "lecture membres interface", ok: false, detail: members.message });
    return report;
  }
  if (!iface) {
    report.push({
      label: `membre ${WZ_IFACE_LIST}`,
      ok: false,
      detail: "interface réseau non détectée : regle à poser manuellement",
    });
    return report;
  }
  if (!members.rows.some((m) => String(m.interface || "") === iface)) {
    const add = await router.exec("/interface/list/member/add", { list: WZ_IFACE_LIST, interface: iface });
    report.push({ label: `membre ${WZ_IFACE_LIST}`, ok: add.ok, detail: add.message || `+ ${iface}` });
  } else {
    report.push({ label: `membre ${WZ_IFACE_LIST}`, ok: true, detail: `${iface} déjà membre` });
  }
  return report;
}

async function ensureAddressList(router) {
  const report = [];
  const p = await router.exec("/ip/firewall/address-list/print", { list: WZ_LIST });
  if (!p.ok) {
    report.push({ label: `lecture liste ${WZ_LIST}`, ok: false, detail: p.message });
    return report;
  }
  if (!p.rows.some((r) => String(r.address || "").startsWith(PROBE_IP))) {
    const add = await router.exec("/ip/firewall/address-list/add", {
      list: WZ_LIST,
      address: RESERVE,
      comment: "wz: reserve (RFC 5737, jamais un client)",
      disabled: true,
    });
    report.push({ label: `liste ${WZ_LIST}`, ok: add.ok, detail: add.message || "créée + réserve" });
  } else {
    report.push({ label: `liste ${WZ_LIST}`, ok: true, detail: "existante" });
  }
  return report;
}

/**
 * Les cinq regles `forward`, posees dans l'ordre et idempotentes.
 *
 * `place-before` est indispensable : sur un hAP d'usine la chaine
 * `forward` contient deja un `accept fasttrack-connection` qui laisse
 * passer TOUT. Une regle ajoutee en fin de chaine ne s'execute jamais,
 * et une regle qui ne s'execute jamais ne leve AUCUNE erreur.
 *
 * La regle de blocage est DESACTIVEE tant que --arm n'est pas passe :
 * une erreur de configuration ne peut donc pas couper Internet.
 */
async function ensureFilter(router, ipAgent, armed) {
  const report = [];
  const cur = await router.exec("/ip/firewall/filter/print");
  if (!cur.ok) {
    report.push({ label: "lecture /ip/firewall/filter", ok: false, detail: cur.message });
    return report;
  }
  const have = new Map(cur.rows.map((r) => [String(r.comment || ""), r]));
  // NOMS DE PROPRIÉTÉS EXACTS de RouterOS, tirets compris.
  // `inInterfaceList` serait IGNORÉ SILENCIEUSEMENT : RouterOS ne refuse
  // pas une propriété inconnue, il ne la conserve pas. Le symptôme est
  // une règle qui ne matche jamais, donc un routeur qui laisse passer
  // TOUT — sans la moindre erreur. C'est le piège que ce kit existe
  // pour rendre impossible.
  const wanted = [
    {
      comment: "wz: etat",
      order: 0,
      // `src-address-list` N'EST PAS COSMETIQUE ici. Sans lui, cette
      // règle accepte les connexions établies de N'IMPORTE QUELLE
      // adresse client : à la révocation d'une session, l'agent retire
      // l'adresse de la liste, mais le tunnel EST déjà établi et
      // continuerait de passer jusqu'à sa fermeture. Le quota ne
      // serait respecté qu'en apparence. En liant l'état établi à la
      // liste, la révocation coupe réellement le flux.
      attrs: {
        chain: "forward",
        action: "accept",
        "in-interface-list": WZ_IFACE_LIST,
        "src-address-list": WZ_LIST,
        "connection-state": "established,related,untracked",
      },
    },
    {
      comment: "wz: agent",
      order: 1,
      attrs: { chain: "forward", action: "accept", "in-interface-list": WZ_IFACE_LIST, "src-address": ipAgent },
    },
    {
      comment: "wz: session",
      order: 2,
      attrs: { chain: "forward", action: "accept", "in-interface-list": WZ_IFACE_LIST, "src-address-list": WZ_LIST },
    },
    {
      comment: "wz: ipv6",
      order: 3,
      attrs: { chain: "forward", action: "drop", "in-interface-list": WZ_IFACE_LIST, protocol: "ipv6" },
    },
    {
      comment: "wz: blocage",
      order: 4,
      attrs: { chain: "forward", action: "drop", "in-interface-list": WZ_IFACE_LIST, disabled: armed ? "false" : "true" },
    },
  ];

  for (const rule of wanted) {
    const existing = have.get(rule.comment);
    if (!existing) {
      if (rule.attrs["src-address"] !== undefined && !ipAgent) {
        report.push({
          label: `regle ${rule.comment}`,
          ok: false,
          detail: "IP du PC agent inconnue : passer --ip-agent <IP>, sinon l'agent perd l'acces",
        });
        continue;
      }
      const res = await router.exec("/ip/firewall/filter/add", {
        ...rule.attrs,
        comment: rule.comment,
        "place-before": String(rule.order),
      });
      report.push({
        label: `regle ${rule.comment}`,
        ok: res.ok,
        detail: res.message || (rule.comment === "wz: blocage" ? (armed ? "posée ARMÉE" : "posée DÉSARMÉE") : "posée"),
      });
    } else if (rule.comment === "wz: blocage") {
      const wantDisabled = armed ? "false" : "true";
      if (String(existing.disabled || "false") !== wantDisabled) {
        const res = await router.exec("/ip/firewall/filter/set", { ".id": existing[".id"], disabled: wantDisabled });
        report.push({
          label: "regle wz: blocage",
          ok: res.ok,
          detail: res.message || (armed ? "ARMÉE" : "DÉSARMÉE"),
        });
      } else {
        report.push({ label: "regle wz: blocage", ok: true, detail: armed ? "déjà armée" : "déjà désarmée" });
      }
    } else {
      report.push({ label: `regle ${rule.comment}`, ok: true, detail: "déjà présente" });
    }
  }
  return report;
}

async function ensureNat(router, net) {
  const p = await router.exec("/ip/firewall/nat/print");
  if (!p.ok) return [{ label: "lecture /ip/firewall/nat", ok: false, detail: p.message }];
  if (p.rows.some((x) => String(x.comment || "").includes("wz: masquerade"))) {
    return [{ label: "masquerade", ok: true, detail: "existante" }];
  }
  const res = await router.exec("/ip/firewall/nat/add", {
    chain: "srcnat",
    action: "masquerade",
    "src-address": net,
    // PAS de `out-interface-list=!wz-clients` : la négation d'une liste
    // n'a pas la même écriture en API binaire et en console, et le pire
    // cas est une règle qui s'applique là où on ne l'attend pas. La
    // restriction par `src-address` suffit : le réseau des clients ne
    // doit être NATé que vers l'extérieur.
    comment: "wz: masquerade",
  });
  return [{ label: "masquerade", ok: res.ok, detail: res.message || `créée pour ${net}` }];
}

async function ensureDns(router) {
  // `dynamic-servers` est en lecture seule : l'ecrire echoue sur 7.x.
  const res = await router.exec("/ip/dns/set", { servers: DEFAULT_DNS, "allow-remote-requests": "yes" });
  return [{ label: "DNS clients", ok: res.ok, detail: res.message || DEFAULT_DNS }];
}

async function ensureApiService(router) {
  const p = await router.exec("/ip/service/print");
  if (!p.ok) return [{ label: "lecture /ip/service", ok: false, detail: p.message }];
  const api = p.rows.find((x) => String(x.name || "") === "api");
  if (!api) return [{ label: "service API (8728)", ok: false, detail: "service `api` introuvable" }];
  if (String(api.disabled || "false") === "true") {
    const res = await router.exec("/ip/service/set", { ".id": api[".id"], disabled: "no", address: "" });
    return [{ label: "service API (8728)", ok: res.ok, detail: res.message || "activé" }];
  }
  return [{ label: "service API (8728)", ok: true, detail: "actif" }];
}

/**
 * Compte dedie a l'agent, groupe `read` : c'est notre garde-fou — un
 * `admin` complet fonctionnerait mais ne doit pas rester la cible. Le
 * mot de passe est genere et affiche UNE seule fois.
 */
async function ensureUser(router, user) {
  const p = await router.exec("/user/print");
  if (!p.ok) return [{ label: "lecture /user", ok: false, detail: p.message }];
  if (p.rows.some((x) => String(x.name || "") === user)) {
    return [{ label: `utilisateur ${user}`, ok: true, detail: "existe déjà (droits non modifiés)" }];
  }
  const password = randomPass();
  const res = await router.exec("/user/add", { name: user, group: "read", password, comment: "WiFi Zone agent" });
  if (!res.ok) return [{ label: `utilisateur ${user}`, ok: false, detail: res.message }];
  return [
    { label: `utilisateur ${user}`, ok: true, detail: "créé (groupe read)" },
    { label: "mot de passe agent", ok: true, detail: password },
  ];
}

/** Retire les sondes laisses par un `--doctor` interrompu. */
async function cleanProbes(router) {
  const report = [];
  const q = await router.exec("/queue/simple/print");
  if (q.ok) {
    const stale = q.rows.filter((x) => String(x.comment || "") === DOCTOR_TAG);
    for (const row of stale) await router.exec("/queue/simple/remove", { ".id": row[".id"] });
    report.push({ label: "sondes de file", ok: true, detail: stale.length ? `${stale.length} retirée(s)` : "aucune" });
  }
  const al = await router.exec("/ip/firewall/address-list/print", { list: WZ_LIST });
  if (al.ok) {
    const stale = al.rows.filter((x) => String(x.comment || "") === DOCTOR_TAG);
    for (const row of stale) await router.exec("/ip/firewall/address-list/remove", { ".id": row[".id"] });
    report.push({ label: "sondes d'adresse", ok: true, detail: stale.length ? `${stale.length} retirée(s)` : "aucune" });
  }
  return report;
}

async function saveBackup(router) {
  const name = `bojo-avant-provision-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}`;
  try {
    const res = await router.exec("/system/backup/save", { name });
    return { label: "sauvegarde système", ok: res.ok, detail: res.message || name };
  } catch (e) {
    return { label: "sauvegarde système", ok: false, detail: String(e?.message ?? e) };
  }
}

async function applyAll(router, args) {
  const report = [];
  if (args.backup) report.push(await saveBackup(router));

  const lan = await detectLan(router);
  const net = args.lan || lan.net;
  const ipAgent = args.ipAgent || localAgentIp();
  log.info(`Interface détectée : ${lan.iface || "(aucune)"} — réseau ${net}`);
  if (!ipAgent) {
    report.push({
      label: "IP du PC agent",
      ok: false,
      detail: "non détectée : exécuter avec --ip-agent <IP> (ipconfig)",
    });
  }
  if (!lan.iface && !args.lan) {
    report.push({
      label: "détection réseau",
      ok: false,
      detail: `aucune adresse privée trouvée (${lan.detail})`,
    });
  }

  report.push(...(await ensureInterfaceList(router, lan.iface)));
  report.push(...(await ensureAddressList(router)));
  report.push(...(await ensureFilter(router, ipAgent, args.arm)));
  report.push(...(await ensureNat(router, net)));
  report.push(...(await ensureDns(router)));
  report.push(...(await ensureApiService(router)));
  report.push(...(await ensureUser(router, args.user)));
  report.push(...(await cleanProbes(router)));

  return { report, meta: { host: router.host, iface: lan.iface, net, ipAgent, armed: args.arm } };
}

/**
 * Verification STRICTE de l'etat attendu, sans ecrire quoi que ce soit.
 * Volontairement plus severe que la pose : c'est elle qui decide si
 * l'on peut armer. Tout ce que la pose Declarait « presente » est relu ici.
 */
async function verifyAll(router, args) {
  const report = [];
  const ipAgent = args.ipAgent || localAgentIp();

  const f = await router.exec("/ip/firewall/filter/print");
  if (!f.ok) {
    report.push({ label: "lecture /ip/firewall/filter", ok: false, detail: f.message });
    return { report, meta: { host: router.host } };
  }
  const byComment = new Map(f.rows.map((r) => [String(r.comment || ""), r]));
  for (const c of ["wz: etat", "wz: agent", "wz: session", "wz: ipv6", "wz: blocage"]) {
    const row = byComment.get(c);
    if (!row) {
      report.push({ label: `regle ${c}`, ok: false, detail: "ABSENTE" });
      continue;
    }
    if (c === "wz: agent") {
      const src = String(row["src-address"] || "").replace(/\/\d+$/, "");
      report.push({
        label: "regle wz: agent",
        ok: src !== "" && (!ipAgent || src === ipAgent),
        detail: src === "" ? "EXEMPTION VIDE : l'agent se coupe de Supabase" : `src-address=${src}`,
      });
    } else if (c === "wz: session") {
      report.push({
        label: "regle wz: session",
        ok: String(row["src-address-list"] || "") === WZ_LIST,
        detail: `src-address-list=${row["src-address-list"] || "(vide)"}`,
      });
    } else if (c === "wz: ipv6") {
      report.push({
        label: "regle wz: ipv6",
        ok: String(row.protocol || "") === "ipv6",
        detail: `protocol=${row.protocol || "(vide)"}`,
      });
    } else if (c === "wz: blocage") {
      const dis = String(row.disabled || "false") === "true";
      // Constat, pas jugement : un `--verify` sur un routeur désarmé
      // n'a rien à reprocher à personne. C'est seulement `--verify
      // --arm`, qui AFFIRME l'attendu, qui peut échouer.
      if (args.arm) {
        report.push({
          label: "regle wz: blocage",
          ok: !dis,
          detail: dis ? "DÉSARMÉE alors que --arm est demandé" : "ARMÉE",
        });
      } else {
        report.push({ label: "regle wz: blocage", ok: true, detail: dis ? "désarmée (attendu avant --arm)" : "ARMÉE" });
      }
    } else {
      report.push({ label: `regle ${c}`, ok: true, detail: "présente" });
    }
  }

  const blocking = byComment.get("wz: blocage");
  const session = byComment.get("wz: session");
  if (blocking && session) {
    const order = f.rows.indexOf(blocking) - f.rows.indexOf(session);
    report.push({
      label: "ordre session < blocage",
      ok: order > 0,
      detail: order > 0 ? "correct" : "INVERSÉ : tout est bloqué, sessions comprises",
    });
  }

  const il = await router.exec("/interface/list/print");
  const hasList = il.ok && il.rows.some((x) => String(x.name || "") === WZ_IFACE_LIST);
  report.push({ label: `liste d'interfaces ${WZ_IFACE_LIST}`, ok: hasList, detail: hasList ? "présente" : "ABSENTE" });
  if (hasList) {
    const mem = await router.exec("/interface/list/member/print", { list: WZ_IFACE_LIST });
    const members = mem.ok ? mem.rows.map((x) => String(x.interface || "")) : [];
    report.push({
      label: `membres ${WZ_IFACE_LIST}`,
      ok: members.length > 0,
      detail: members.length ? members.join(", ") : "VIDE : aucune règle ne peut matcher",
    });
  }

  const al = await router.exec("/ip/firewall/address-list/print", { list: WZ_LIST });
  report.push({
    label: `liste d'adresses ${WZ_LIST}`,
    ok: al.ok && al.rows.length > 0,
    detail: al.ok ? `${al.rows.length} entrée(s)` : (al.message ?? ""),
  });

  const nat = await router.exec("/ip/firewall/nat/print");
  report.push({
    label: "masquerade",
    ok: nat.ok && nat.rows.some((x) => String(x.comment || "").includes("wz: masquerade")),
    detail: nat.ok ? (nat.rows.some((x) => String(x.comment || "").includes("wz: masquerade")) ? "présente" : "ABSENTE : pas d'Internet") : nat.message,
  });

  const svc = await router.exec("/ip/service/print");
  const api = svc.ok ? svc.rows.find((x) => String(x.name || "") === "api") : null;
  report.push({
    label: "service API (8728)",
    ok: Boolean(api) && String(api.disabled || "false") !== "true",
    detail: api ? (String(api.disabled || "false") === "true" ? "DÉSACTIVÉ" : "actif") : "service introuvable",
  });

  const usr = await router.exec("/user/print");
  const agent = usr.ok ? usr.rows.find((x) => String(x.name || "") === args.user) : null;
  report.push({
    label: `utilisateur ${args.user}`,
    ok: Boolean(agent),
    detail: agent ? `groupe ${agent.group}` : "ABSENT : l'agent tourne avec admin",
  });

  const q = await router.exec("/queue/simple/print");
  const leftover = q.ok ? q.rows.filter((x) => String(x.comment || "").startsWith("wz:")) : [];
  report.push({
    label: "files de comptage",
    ok: true,
    detail: leftover.length ? `${leftover.length} entrée(s) wz: présente(s)` : "vide (normal)",
  });

  return { report, meta: { host: router.host, armed: args.arm, ipAgent } };
}

/** Ne retire QUE nos objets. Aucune règle du client n'est touchée. */
async function undoAll(router, args) {
  const report = [];
  const f = await router.exec("/ip/firewall/filter/print");
  if (f.ok) {
    for (const row of f.rows.filter((x) => String(x.comment || "").startsWith("wz:"))) {
      const res = await router.exec("/ip/firewall/filter/remove", { ".id": row[".id"] });
      report.push({ label: `règle ${row.comment} retirée`, ok: res.ok, detail: res.message || "" });
    }
  }
  const nat = await router.exec("/ip/firewall/nat/print");
  if (nat.ok) {
    for (const row of nat.rows.filter((x) => String(x.comment || "").includes("wz: masquerade"))) {
      const res = await router.exec("/ip/firewall/nat/remove", { ".id": row[".id"] });
      report.push({ label: "masquerade retirée", ok: res.ok, detail: res.message || "" });
    }
  }
  const mem = await router.exec("/interface/list/member/print", { list: WZ_IFACE_LIST });
  if (mem.ok) {
    for (const row of mem.rows) {
      await router.exec("/interface/list/member/remove", { ".id": row[".id"] });
    }
    if (mem.rows.length) report.push({ label: "membres d'interfaces retirés", ok: true, detail: `${mem.rows.length}` });
  }
  const il = await router.exec("/interface/list/print");
  if (il.ok) {
    const row = il.rows.find((x) => String(x.name || "") === WZ_IFACE_LIST);
    if (row) {
      const res = await router.exec("/interface/list/remove", { ".id": row[".id"] });
      report.push({ label: `liste ${WZ_IFACE_LIST} retirée`, ok: res.ok, detail: res.message || "" });
    }
  }
  const q = await router.exec("/queue/simple/print");
  if (q.ok) {
    for (const row of q.rows.filter((x) => String(x.comment || "").startsWith("wz:"))) {
      await router.exec("/queue/simple/remove", { ".id": row[".id"] });
    }
  }
  const al = await router.exec("/ip/firewall/address-list/print", { list: WZ_LIST });
  if (al.ok) {
    for (const row of al.rows.filter((x) => String(x.comment || "").startsWith("wz:"))) {
      await router.exec("/ip/firewall/address-list/remove", { ".id": row[".id"] });
      report.push({ label: `adresse ${row.address} retirée`, ok: true, detail: "" });
    }
  }
  const usr = await router.exec("/user/print");
  if (usr.ok) {
    const row = usr.rows.find((x) => String(x.name || "") === args.user);
    if (row) {
      const res = await router.exec("/user/remove", { ".id": row[".id"] });
      report.push({ label: `utilisateur ${args.user} retiré`, ok: res.ok, detail: res.message || "" });
    }
  }
  if (!report.length) report.push({ label: "rien à retirer", ok: true, detail: "aucun objet wz: présent" });
  return { report, meta: { host: router.host } };
}

async function connectRouter(args, env) {
  if (args.mock) {
    const { MockRouter } = await import("./lib/mock-router.mjs");
    return new MockRouter({ listName: WZ_LIST, bytesPerSec: 120000 });
  }
  const router = new RouterOSApi({
    host: env.MIKROTIK_HOST,
    username: env.MIKROTIK_USERNAME,
    password: env.MIKROTIK_PASSWORD,
    tlsEnabled: env.bool("MIKROTIK_TLS"),
    portApi: env.apiPort(),
    listName: WZ_LIST,
    maxLimit: env.MIKROTIK_MAX_LIMIT,
    log,
  });
  await router.connect();
  return router;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadAgentEnv(args.mock ? { NETWORK_ADAPTER_TYPE: "mock" } : {});

  if (!args.mock) {
    if (!env.MIKROTIK_HOST) {
      log.error("MIKROTIK_HOST absent : renseigner agent/.env (voir .env.example.agent)");
      process.exit(1);
    }
    if (!env.MIKROTIK_PASSWORD || env.MIKROTIK_PASSWORD === "changez-moi") {
      log.error("MIKROTIK_PASSWORD absent ou « changez-moi » dans agent/.env");
      process.exit(1);
    }
    if (env.AGENT_ROUTER_PROTOCOL !== "api") {
      log.warn(
        `AGENT_ROUTER_PROTOCOL=${env.AGENT_ROUTER_PROTOCOL} : le provisionnement passe par ` +
          "l'API binaire (8728), seul protocole disponible sur un hAP d'usine 6.42."
      );
    }
  }

  let router;
  try {
    router = await connectRouter(args, env);
  } catch (e) {
    log.error("connexion routeur impossible :", e?.message ?? e);
    process.exit(1);
  }

  const { report, meta } = args.undo
    ? await undoAll(router, args)
    : args.verify || args.check
      ? await verifyAll(router, args)
      : await applyAll(router, args);

  for (const x of report) log.info(reportLine(x));
  const ko = report.filter((x) => !x.ok);
  writeReport(args.output, report, { ...meta, mode: args.undo ? "undo" : args.verify ? "verify" : "apply" });
  log.info(`\nRapport : ${args.output}`);
  if (ko.length) {
    log.error(`${ko.length} point(s) en échec — NE PAS armer tant qu'ils subsistent.`);
  } else {
    log.info("Tous les points sont au vert.");
  }
  if (typeof router.close === "function") await router.close();
  process.exitCode = ko.length ? 1 : 0;
}

run().catch((e) => {
  log.error(e);
  process.exit(1);
});
