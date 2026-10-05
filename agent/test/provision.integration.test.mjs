// ============================================================
// test/provision.integration.test.mjs — provision.mjs face à un
// VRAI petit serveur RouterOS sur TCP.
//
// Ce test existe parce que le provisionnement touche exactement ce
// qui ne se teste pas autrement : l'ordre des règles, le `disabled`
// de la règle de blocage, l'idempotence, et le fait qu'un `--undo`
// ne touche QUE nos objets.
//
// Le double reproduit les trois pièges qui font échouer un hAP
// d'usine sans lever la moindre erreur :
//   • la chaîne `forward` contient un `accept fasttrack-connection`
//     AVANT nos règles si elles sont posées sans `place-before` ;
//   • `add` sur un filtre NE REMPLACE PAS la liste existante ;
//   • une règle `disabled=true` est silencieusement inactive.
// ============================================================

import net from "node:net";
import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const PROVISION = fileURLToPath(new URL("../provision.mjs", import.meta.url));

function encodeWord(word) {
  const data = Buffer.from(String(word), "latin1");
  const len = data.length;
  let header;
  if (len < 0x80) header = Buffer.from([len]);
  else if (len < 0x4000) header = Buffer.from([(len >> 8) | 0x80, len & 0xff]);
  else {
    header = Buffer.alloc(5);
    header[0] = 0xc0;
    header.writeUInt32BE(len, 1);
  }
  return Buffer.concat([header, data]);
}

const sentence = (words) => Buffer.concat([...words.map(encodeWord), Buffer.from([0])]);
const replySentences = (rows) =>
  Buffer.concat([...rows.map((w) => sentence(w)), sentence(["!done"])]);

function decodeSentences(buffer) {
  const out = [];
  let offset = 0;
  for (;;) {
    const words = [];
    let complete = false;
    for (;;) {
      if (offset >= buffer.length) return { out, rest: buffer.subarray(offset) };
      const b0 = buffer[offset];
      let len;
      if ((b0 & 0x80) === 0) {
        len = b0;
        offset += 1;
      } else if ((b0 & 0xc0) === 0x80) {
        if (offset + 2 > buffer.length) return { out, rest: buffer.subarray(offset) };
        len = ((b0 & 0x3f) << 8) | buffer[offset + 1];
        offset += 2;
      } else {
        if (offset + 5 > buffer.length) return { out, rest: buffer.subarray(offset) };
        len = buffer.readUInt32BE(offset + 1);
        offset += 5;
      }
      if (len === 0) {
        complete = true;
        break;
      }
      if (offset + len > buffer.length) return { out, rest: buffer.subarray(offset) };
      words.push(buffer.toString("latin1", offset, offset + len));
      offset += len;
    }
    if (complete) out.push(words);
  }
}

/** État d'un hAP d'usine : fasttrack en tête de `forward`, WAN en ether1. */
function factoryState() {
  return {
    nextId: 1,
    filters: [
      { chain: "forward", action: "fasttrack-connection", comment: "defconf: fasttrack" },
      { chain: "forward", action: "accept", comment: "defconf: established" },
    ],
    nats: [],
    addresses: [
      { address: "192.168.88.1/24", interface: "bridge", network: "192.168.88.0/24" },
      { address: "10.0.0.1/24", interface: "ether1", network: "10.0.0.0/24" },
    ],
    routes: [{ dstAddress: "0.0.0.0/0", gateway: "10.0.0.2", interface: "ether1" }],
    interfaceLists: [{ name: "none" }],
    interfaceListMembers: [],
    addressList: [],
    queues: [],
    users: [{ name: "admin", group: "full" }],
    services: [
      { name: "api", port: 8728, disabled: "false" },
      { name: "winbox", port: 8291, disabled: "false" },
    ],
    dns: { servers: "8.8.8.8/8.8.8.8", "allow-remote-requests": "no" },
    backups: [],
  };
}

const CHALLENGE = "00112233445566778899aabbccddeeff";

function legacyResponse(password, challengeHex = CHALLENGE) {
  const digest = createHash("md5")
    .update(
      Buffer.concat([Buffer.from([0]), Buffer.from(password, "latin1"), Buffer.from(challengeHex, "hex")])
    )
    .digest("hex");
  return "00" + digest;
}

function toRow(row) {
  return ["!re", ...Object.entries(row).map(([k, v]) => `=${k}=${v}`)];
}

/**
 * Attribue un `.id` STABLE à chaque ligne et le conserve dans l'objet :
 * sans cela `set` / `remove` par `.id` ne trouveraient jamais leur
 * cible et le test passerait à côté du vrai contrat RouterOS.
 */
let idSeq = 1;
function stamp(row) {
  row.__id = row.__id ?? `*${idSeq++}`;
  row[".id"] = row.__id;
  return row;
}

function rowsOf(list) {
  return list.map((row) => toRow(stamp(row)));
}

function withDisabled(list) {
  for (const row of list) if (row.disabled === undefined) row.disabled = "false";
  return rowsOf(list);
}

async function startConfigRouterOS({ user = "admin", password = "secret", legacy = true } = {}) {
  const state = factoryState();


  const server = net.createServer((socket) => {
    let authenticated = false;
    let buffer = Buffer.alloc(0);
    socket.on("error", () => {});
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { out, rest } = decodeSentences(buffer);
      buffer = rest;
      for (const words of out) handle(words);
    });

    function handle(words) {
      const command = words[0];
      const attrs = {};
      for (const w of words.slice(1)) {
        if (!w.startsWith("=")) continue;
        const eq = w.indexOf("=", 1);
        attrs[w.slice(1, eq)] = w.slice(eq + 1);
      }

      if (command === "/login") {
        if (attrs.name !== undefined && attrs.password !== undefined) {
          if (legacy) return void socket.write(sentence(["!done", "=ret=" + CHALLENGE]));
          authenticated = attrs.name === user && attrs.password === password;
          return void socket.write(authenticated ? sentence(["!done"]) : replySentences([["!trap", "=message=cannot log in"]]));
        }
        if (attrs.name !== undefined && attrs.response !== undefined) {
          authenticated = attrs.name === user && attrs.response === legacyResponse(password);
          return void socket.write(authenticated ? sentence(["!done"]) : replySentences([["!trap", "=message=cannot log in"]]));
        }
        return void socket.write(sentence(["!done", "=ret=" + CHALLENGE]));
      }

      if (!authenticated) return void socket.write(replySentences([["!trap", "=message=not logged in"]]));
      respond(command, attrs, socket);
    }

    function respond(command, attrs, socket) {
      const trap = (m) => void socket.write(replySentences([["!trap", `=message=${m}`]]));
      const done = () => void socket.write(sentence(["!done"]));

      switch (command) {
        case "/system/resource/print":
          return void socket.write(replySentences([["!re", "=version=6.42.3", "=board-name=hAP ac²"]]));
        case "/system/backup/save":
          state.backups.push(attrs.name);
          return done();
        case "/ip/address/print":
          return void socket.write(replySentences(withDisabled(state.addresses)));
        case "/ip/route/print":
          return void socket.write(replySentences(rowsOf(state.routes)));
        case "/ip/service/print":
          return void socket.write(replySentences(rowsOf(state.services)));
        case "/ip/service/set": {
          const row = state.services.find((s) => s.__id === attrs[".id"]) ?? state.services.find((s) => s.__current);
          void row;
          const target = state.services.find((s) => s.__id === attrs[".id"]);
          if (!target) return trap("no such item");
          if (attrs.disabled) target.disabled = attrs.disabled;
          if (attrs.address !== undefined) target.address = attrs.address;
          return done();
        }
        case "/user/print":
          return void socket.write(replySentences(withDisabled(state.users)));
        case "/user/add": {
          if (!attrs.name || !attrs.password) return trap("missing name or password");
          if (state.users.some((u) => u.name === attrs.name)) return trap("already have such entry");
          state.users.push({ name: attrs.name, group: attrs.group ?? "read" });
          return done();
        }
        case "/user/remove": {
          const before = state.users.length;
          state.users = state.users.filter((u) => u.__id !== attrs[".id"]);
          if (state.users.length === before) return trap("no such item");
          return done();
        }
        case "/ip/dns/print":
          state.dns.__id = state.dns.__id ?? `*${idSeq++}`;
          return void socket.write(replySentences([toRow({ ".id": state.dns.__id, ...state.dns })]));
        case "/ip/dns/set":
          if (attrs.servers) state.dns.servers = attrs.servers;
          if (attrs["allow-remote-requests"]) state.dns["allow-remote-requests"] = attrs["allow-remote-requests"];
          return done();
        case "/interface/list/print":
          return void socket.write(replySentences(rowsOf(state.interfaceLists)));
        case "/interface/list/add": {
          if (!attrs.name) return trap("missing name");
          state.interfaceLists.push({ name: attrs.name, comment: attrs.comment ?? "" });
          return done();
        }
        case "/interface/list/remove": {
          const before = state.interfaceLists.length;
          state.interfaceLists = state.interfaceLists.filter((l) => l.__id !== attrs[".id"]);
          if (state.interfaceLists.length === before) return trap("no such item");
          return done();
        }
        case "/interface/list/member/print": {
          const rows = state.interfaceListMembers.filter((m) => !attrs.list || m.list === attrs.list);
          return void socket.write(replySentences(rowsOf(rows)));
        }
        case "/interface/list/member/add":
          state.interfaceListMembers.push({ list: attrs.list, interface: attrs.interface });
          return done();
        case "/interface/list/member/remove":
          state.interfaceListMembers = state.interfaceListMembers.filter((m) => m.__id !== attrs[".id"]);
          return done();
        default:
          break;
      }
      firewall(command, attrs, socket, state, trap, done);
    }

    function firewall(command, attrs, socket, state, trap, done) {
      switch (command) {
        case "/ip/firewall/filter/print":
          return void socket.write(replySentences(rowsOf(state.filters)));
        case "/ip/firewall/filter/add": {
          const row = {
            chain: attrs.chain ?? "input",
            action: attrs.action ?? "accept",
            comment: attrs.comment ?? "",
            disabled: attrs.disabled ?? "false",
          };
          // Seules lespropriétés RouterOS EXACTES sont retenues. Un
          // double tolérant aux noms approximatifs laisserait passer
          // `inInterfaceList` alors qu'un vrai routeur IGNORE
          // silencieusement la propriété : règle inerte, clients en
          // accès libre, aucune erreur. C'est exactement le défaut que
          // ce test doit rendre impossible.
          for (const k of [
            "connection-state",
            "in-interface-list",
            "src-address",
            "src-address-list",
            "protocol",
          ]) {
            if (attrs[k] !== undefined) row[k] = attrs[k];
          }
          // `place-before` est la SEULE chose qui distingue une
          // configuration fonctionnelle d'une configuration inerte sur
          // un hAP d'usine : sans lui, la règle atterrit APRÈS le
          // `accept fasttrack-connection` et ne s'exécute jamais.
          const at = Number(attrs["place-before"]);
          if (Number.isInteger(at) && at >= 0 && at <= state.filters.length) {
            state.filters.splice(at, 0, stamp(row));
          } else {
            state.filters.push(stamp(row));
          }
          return done();
        }
        case "/ip/firewall/filter/set": {
          const row = state.filters.find((f) => f.__id === attrs[".id"]);
          if (!row) return trap("no such item");
          if (attrs.disabled !== undefined) row.disabled = attrs.disabled;
          return done();
        }
        case "/ip/firewall/filter/remove":
          state.filters = state.filters.filter((f) => f.__id !== attrs[".id"]);
          return done();
        case "/ip/firewall/nat/print":
          return void socket.write(replySentences(rowsOf(state.nats)));
        case "/ip/firewall/nat/add":
          state.nats.push({
            chain: attrs.chain,
            action: attrs.action,
            comment: attrs.comment ?? "",
            "src-address": attrs["src-address"] ?? "",
          });
          return done();
        case "/ip/firewall/nat/remove":
          state.nats = state.nats.filter((n) => n.__id !== attrs[".id"]);
          return done();
        case "/ip/firewall/address-list/print": {
          const rows = state.addressList.filter((e) => !attrs.list || e.list === attrs.list);
          return void socket.write(replySentences(withDisabled(rows)));
        }
        case "/ip/firewall/address-list/add":
          state.addressList.push({
            list: attrs.list,
            address: attrs.address,
            comment: attrs.comment ?? "",
            disabled: attrs.disabled ?? "false",
          });
          return done();
        case "/ip/firewall/address-list/remove":
          state.addressList = state.addressList.filter((e) => e.__id !== attrs[".id"]);
          return done();
        case "/queue/simple/print":
          return void socket.write(replySentences(rowsOf(state.queues)));
        case "/queue/simple/remove":
          state.queues = state.queues.filter((q) => q.__id !== attrs[".id"]);
          return done();
        default:
          return trap("no such command");
      }
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    state,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/**
 * Lance provision.mjs en VRAI process contre le faux routeur : c'est le
 * seul moyen de couvrir l'orchestrateur complet (détection, idempotence,
 * armement, undo) sans routeur. Les secrets sont injectés par variable
 * d'environnement : aucun fichier .env n'est écrit, aucun n'est lu.
 */
async function provision(fake, args = []) {
  const env = {
    ...process.env,
    NETWORK_ADAPTER_TYPE: "mikrotik",
    AGENT_ROUTER_PROTOCOL: "api",
    MIKROTIK_HOST: "127.0.0.1",
    MIKROTIK_PORT_API: String(fake.port),
    MIKROTIK_USERNAME: "admin",
    MIKROTIK_PASSWORD: "secret",
    WIFI_LIST_NAME: "wz-active",
  };
  const { stdout } = await execFileAsync(process.execPath, [PROVISION, ...args], { env });
  return stdout;
}

const wzRules = (state) => state.filters.filter((f) => String(f.comment || "").startsWith("wz:"));
const ruleByComment = (state, c) => state.filters.find((f) => f.comment === c);

test("provision : pose tout, DÉSARMÉ par défaut (aucun Internet coupé par erreur)", async () => {
  const fake = await startConfigRouterOS();
  try {
    const out = await provision(fake, ["--ip-agent", "192.168.88.10", "--output", "ignored.txt"]);

    const wz = wzRules(fake.state);
    assert.equal(wz.length, 5, `5 règles wz: attendues, obtenu ${wz.length}\n${out}`);
    const bloc = ruleByComment(fake.state, "wz: blocage");
    assert.equal(bloc.disabled, "true", "wz: blocage doit être DÉSARMÉE tant que --arm n'est pas passé");

    // Le point de sécurité : nos règles doivent précéder le
    // `fasttrack-connection` d'usine, sinon rien ne s'exécute.
    const firstWz = fake.state.filters.findIndex((f) => String(f.comment || "").startsWith("wz:"));
    assert.equal(firstWz, 0, "les règles wz: doivent être en tête de la chaîne forward");
    assert.equal(fake.state.filters[0].comment, "wz: etat", "wz: etat doit être la première");

    assert.equal(ruleByComment(fake.state, "wz: session")["src-address-list"], "wz-active");
    assert.equal(ruleByComment(fake.state, "wz: session")["in-interface-list"], "wz-clients");
    assert.equal(ruleByComment(fake.state, "wz: agent")["src-address"], "192.168.88.10");

    // Non-régression : l'état ÉTABLI est filtré par la liste, sinon la
    // révocation d'une session ne couperait rien (le tunnel reste
    // « established ») et le quota ne serait respecté qu'en apparence.
    assert.equal(
      ruleByComment(fake.state, "wz: etat")["src-address-list"],
      "wz-active",
      "wz: etat doit exiger src-address-list, sinon la révocation est inopérante",
    );
    assert.equal(fake.state.filters.filter((f) => f.comment === "wz: agent").length, 1);

    // Interface réseau : la 192.168.88.x, jamais la WAN 10.0.0.1.
    const mem = fake.state.interfaceListMembers.find((m) => m.list === "wz-clients");
    assert.equal(mem.interface, "bridge");

    assert.equal(fake.state.nats.length, 1);
    assert.equal(fake.state.nats[0]["src-address"], "192.168.88.0/24");
    assert.equal(fake.state.dns.servers, "1.1.1.1,8.8.8.8");
    assert.equal(fake.state.dns["allow-remote-requests"], "yes");
    assert.ok(fake.state.users.some((u) => u.name === "wifi-agent"), "l'agent dédié doit être créé");
    assert.equal(fake.state.users.find((u) => u.name === "wifi-agent").group, "read");
    assert.equal(fake.state.backups.length, 1, "une sauvegarde doit précéder toute écriture");
  } finally {
    await fake.close();
  }
});

test("provision est IDEMPOTENT : rejouer ne duplique rien", async () => {
  const fake = await startConfigRouterOS();
  try {
    await provision(fake, ["--ip-agent", "192.168.88.10", "--output", "ignored.txt"]);
    const after1 = JSON.parse(JSON.stringify(fake.state.filters));

    await provision(fake, ["--ip-agent", "192.168.88.10", "--output", "ignored.txt"]);

    const comments = fake.state.filters.map((f) => f.comment);
    assert.equal(comments.filter((c) => c === "wz: etat").length, 1, "wz: etat dupliquée");
    assert.equal(comments.filter((c) => c === "wz: agent").length, 1, "wz: agent dupliquée");
    assert.equal(comments.filter((c) => c === "wz: session").length, 1, "wz: session dupliquée");
    assert.equal(comments.filter((c) => c === "wz: ipv6").length, 1, "wz: ipv6 dupliquée");
    assert.equal(comments.filter((c) => c === "wz: blocage").length, 1, "wz: blocage dupliquée");
    assert.equal(wzRules(fake.state).length, 5);
    assert.equal(fake.state.nats.length, 1, "masquerade dupliquée");
    assert.equal(fake.state.users.filter((u) => u.name === "wifi-agent").length, 1, "utilisateur dupliqué");
    assert.equal(fake.state.interfaceListMembers.length, 1, "membre d'interface dupliqué");
    assert.equal(fake.state.addressList.length, 1, "entrée de réserve dupliquée");
    assert.deepEqual(fake.state.filters, after1, "l'état des règles doit être inchangé");
  } finally {
    await fake.close();
  }
});

test("--arm active la règle de blocage, --verify seul n'écrit rien", async () => {
  const fake = await startConfigRouterOS();
  try {
    await provision(fake, ["--ip-agent", "192.168.88.10", "--output", "ignored.txt"]);
    assert.equal(ruleByComment(fake.state, "wz: blocage").disabled, "true");

    await provision(fake, ["--ip-agent", "192.168.88.10", "--arm", "--output", "ignored.txt"]);
    assert.equal(ruleByComment(fake.state, "wz: blocage").disabled, "false", "--arm doit activer");

    // Un --verify n'écrit RIEN : c'est la garantie qu'une simple
    // relecture ne peut pas couper l'Internet du client.
    await provision(fake, ["--ip-agent", "192.168.88.10", "--verify", "--output", "ignored.txt"]);
    assert.equal(ruleByComment(fake.state, "wz: blocage").disabled, "false", "--verify n'écrit rien");
  } finally {
    await fake.close();
  }
});

test("--verify constate l'état d'armement sans le juger ; --verify --arm exige", async () => {
  const fake = await startConfigRouterOS();
  try {
    await provision(fake, ["--ip-agent", "192.168.88.10", "--output", "ignored.txt"]);

    // Désarmé, `--verify` seul est un SUCCÈS : il constate, il ne
    // reproche rien. Sans cela, impossible de contrôler un routeur
    // avant la recette.
    const out = await provision(fake, ["--ip-agent", "192.168.88.10", "--verify", "--output", "ignored.txt"]);
    assert.match(out, /wz: blocage - désarmée/);

    // `--verify --arm` AFFIRME l'attendu : là, l'échec est correct.
    await assert.rejects(
      () => provision(fake, ["--ip-agent", "192.168.88.10", "--verify", "--arm", "--output", "ignored.txt"]),
      (e) => e.code === 1,
    );
    assert.equal(ruleByComment(fake.state, "wz: blocage").disabled, "true", "--verify --arm n'écrit rien");
  } finally {
    await fake.close();
  }
});

test("--undo ne touche QUE nos objets (les règles d'usine restent)", async () => {
  const fake = await startConfigRouterOS();
  try {
    const defBefore = fake.state.filters.filter((f) => String(f.comment || "").startsWith("defconf"));
    assert.equal(defBefore.length, 2);

    await provision(fake, ["--ip-agent", "192.168.88.10", "--output", "ignored.txt"]);
    await provision(fake, ["--ip-agent", "192.168.88.10", "--undo", "--output", "ignored.txt"]);

    assert.equal(wzRules(fake.state).length, 0, "plus aucune règle wz:");
    assert.equal(fake.state.nats.length, 0, "masquerade retirée");
    assert.equal(fake.state.addressList.length, 0, "entrées d'adresse retirées");
    assert.equal(fake.state.interfaceListMembers.length, 0, "membres retirés");
    assert.ok(!fake.state.interfaceLists.some((l) => l.name === "wz-clients"), "liste wz-clients retirée");
    assert.ok(!fake.state.users.some((u) => u.name === "wifi-agent"), "utilisateur retiré");

    const defAfter = fake.state.filters.filter((f) => String(f.comment || "").startsWith("defconf"));
    assert.equal(defAfter.length, 2, "les règles d'usine du client doivent SURVIVRE au --undo");
    assert.deepEqual(defAfter, defBefore, "elles doivent être inchangées");
  } finally {
    await fake.close();
  }
});

test("IP du PC agent absente : la règle wz: agent est refusée, pas posée à vide", async () => {
  const fake = await startConfigRouterOS();
  try {
    // PATH vidé : `ipconfig` devient introuvable, donc l'auto-détection
    // échoue comme sur un poste où l'IP n'est pas devinable. Le test
    // reste ainsi déterministe sur n'importe quelle machine.
    const env = {
      ...process.env,
      PATH: "",
      NETWORK_ADAPTER_TYPE: "mikrotik",
      AGENT_ROUTER_PROTOCOL: "api",
      MIKROTIK_HOST: "127.0.0.1",
      MIKROTIK_PORT_API: String(fake.port),
      MIKROTIK_USERNAME: "admin",
      MIKROTIK_PASSWORD: "secret",
      WIFI_LIST_NAME: "wz-active",
    };
    await assert.rejects(
      () => execFileAsync(process.execPath, [PROVISION, "--output", "ignored.txt"], { env }),
      (e) => e.code === 1,
    );
    // Le point qui compte : aucune exemption vide n'est posée. Une règle
    // sans `src-address` n'exempte personne, et l'agent se coupe alors de
    // Supabase sans le moindre message.
    assert.equal(ruleByComment(fake.state, "wz: agent"), undefined, "wz: agent ne doit pas être posée sans IP");
  } finally {
    await fake.close();
  }
});
