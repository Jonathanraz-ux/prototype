// ============================================================
// test/routeros-api.test.mjs — Pilote API BINAIRE face à un vrai
// petit serveur RouterOS simulé sur TCP (protocole de mots).
//
// C'est le test le plus utile de l'agent : le protocole binaire est
// sensible au framing (longueur des mots, `!re`/`!done`) et à
// l'authentification par challenge. Une erreur ici ne se voit QUE
// sur le matériel — typiquement le jour J.
// ============================================================

import net from "node:net";
import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { RouterOSApi, parseAddressListRows, parseQueueRows, legacyLoginResponse } from "../lib/routeros-api.mjs";

const CHALLENGE = "00112233445566778899aabbccddeeff";

// ---- Protocole RouterOS (encodeur du côté serveur) --------------

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

/**
 * Reply RouterOS conforme au framing réel : UNE phrase par
 * enregistrement, chacune close par un mot vide, puis `!done` dans sa
 * PROPRE phrase.
 *
 * C'est le détail qui a masqué le bug de désynchronisation : un double
 * qui écrit `!re … !re … !done` d'un seul bloc passe avec un pilote
 * qui lit une seule phrase, alors qu'un routeur réel n'envoie jamais
 * cela. Les lignes écrites ici sont volontairement SCINDÉES, sans quoi
 * le test ne prouverait rien.
 */
const replySentences = (rows) =>
  Buffer.concat([...rows.map((words) => sentence(words)), sentence(["!done"])]);

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

/**
 * Réponse au défi telle que le routeur l'attend.
 * Recalculée ici, et non importée du code testé : une fonction testée
 * qui réutilise l'implémentation ne prouve rien. Si le pilote change de
 * formule, ce double doit changer AVEC lui et faire échouer le test.
 */
function expectedLegacyResponse(password, challengeHex = CHALLENGE) {
  const digest = createHash("md5")
    .update(
      Buffer.concat([
        Buffer.from([0]),
        Buffer.from(password, "latin1"),
        Buffer.from(challengeHex, "hex"),
      ])
    )
    .digest("hex");
  return "00" + digest;
}

/**
 * Serveur RouterOS simulé : address-list + /queue/simple en mémoire.
 *
 * `legacy: true` reproduit un routeur **antérieur à 6.43** — c'est le
 * hAP ac² d'usine (6.42.3), le matériel du jour J. Ce mode est le
 * SEUL qui reproduit fidèlement :
 *   • l'authentification par défi MD5 (le routeur ignore le mot de
 *     passe en clair et renvoie `=ret=`) ;
 *   • le refus de `=stats=` sur `/queue/simple/print`.
 *
 * Une version antérieure de ce double acceptait le SHA1 et le `=stats=`
 * sans broncher : les tests passaient alors que la liaison aurait échoué
 * sur le routeur réel, pour la raison inverse de celle qu'ils vérifiaient.
 */
async function startFakeRouterOS({
  user = "wifi",
  password = "secret",
  legacy = false,
  readOnlyWithoutStats = true,
} = {}) {
  const state = { entries: [], queues: [], nextId: 1, seen: [], connections: 0, sockets: new Set() };
  const newId = () => `*${state.nextId++}`;

  const server = net.createServer((socket) => {
    state.connections += 1;
    socket.__id = state.connections;
    state.sockets.add(socket);
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
      state.seen.push({ command, attrs, auth: authenticated, conn: socket.__id });
      if (process.env.WZ_TRACE) {
        console.error(`[serveur#${socket.__id}]`, JSON.stringify(words), "auth=" + authenticated);
      }

      // ---- Authentification : ordre du client de référence MikroTik.
      if (command === "/login") {
        // a) `name` + `password` en clair : c'est la PREMIÈRE phrase
        //    envoyée par le client officiel.
        if (attrs.name !== undefined && attrs.password !== undefined) {
          if (legacy) {
            // < 6.43 : le routeur IGNORE ces identifiants et exige un défi.
            socket.write(sentence(["!done", "=ret=" + CHALLENGE]));
            return;
          }
          if (attrs.name === user && attrs.password === password) {
            authenticated = true;
            socket.write(sentence(["!done"]));
          } else {
            socket.write(replySentences([["!trap", "=message=cannot log in"]]));
          }
          return;
        }
        // b) `name` + `response` : réponse au défi MD5.
        if (attrs.name !== undefined && attrs.response !== undefined) {
          if (attrs.name === user && attrs.response === expectedLegacyResponse(password)) {
            authenticated = true;
            socket.write(sentence(["!done"]));
          } else {
            socket.write(replySentences([["!trap", "=message=cannot log in"]]));
          }
          return;
        }
        // c) `/login` nu : le routeur propose son défi.
        socket.write(sentence(["!done", "=ret=" + CHALLENGE]));
        return;
      }

if (!authenticated) {
            socket.write(replySentences([["!trap", "=message=not logged in"]]));
            return;
          }

      switch (command) {
        case "/system/resource/print":
          socket.write(replySentences([["!re", "=uptime=1h"]]));
          return;
        case "/ip/firewall/address-list/print": {
          const rows = state.entries.filter((e) => (attrs.list ? e.list === attrs.list : true));
          socket.write(
            replySentences(
              rows.map((e) => [
                "!re",
                "=.id=" + e[".id"],
                "=list=" + e.list,
                "=address=" + e.address,
                "=comment=" + (e.comment ?? ""),
                "=disabled=false",
              ])
            )
          );
          return;
        }
        case "/ip/firewall/address-list/add": {
          state.entries.push({
            ".id": newId(),
            list: attrs.list,
            address: attrs.address,
            comment: attrs.comment ?? "",
          });
          socket.write(sentence(["!done"]));
          return;
        }
        case "/ip/firewall/address-list/set": {
          const row = state.entries.find((e) => e[".id"] === attrs[".id"]);
          if (row) Object.assign(row, { list: attrs.list ?? row.list, comment: attrs.comment ?? row.comment });
          socket.write(sentence(["!done"]));
          return;
        }
        case "/ip/firewall/address-list/remove":
          state.entries = state.entries.filter((e) => e[".id"] !== attrs[".id"]);
          socket.write(sentence(["!done"]));
          return;
        case "/queue/simple/print": {
          // Contrat réel : les propriétés en lecture seule (dont les
          // compteurs) ne sortent QUE si `print` reçoit `=stats=`.
          // Le simuleur respecte cette règle — sans elle, l'agent
          // lirait une file vide de mesures et le quota resterait
          // figé sans le moindre signal.
          //
          // Sur un routeur antérieur à 6.43, `=stats=` n'existe pas :
          // c'est un `!trap`. Le pilote doit le détecter et réessayer
          // sans le mot-clé.
          const wantsStats = "stats" in attrs;
          if (legacy && wantsStats) {
            socket.write(replySentences([["!trap", "=message=unknown parameter 'stats'"]]));
            return;
          }
          // `readOnlyWithoutStats` : un `print` SANS `=stats=` renvoie-t-il
          // encore les propriétés en lecture seule ? Sur 6.42.3 cela n'est
          // pas documenté, d'où les deux variantes de test. À `false`, le
          // pilote doit refuser la mesure au lieu d'inventer un « 0 ».
          const withStats = wantsStats || readOnlyWithoutStats;
          socket.write(
            replySentences(
              state.queues.map((q) => [
                "!re",
                "=.id=" + q[".id"],
                "=name=" + q.name,
                "=target=" + q.target,
                "=comment=" + (q.comment ?? ""),
                "=max-limit=" + (q["max-limit"] ?? "0/0"),
                // `bytes` est le composite "upload/download" documenté.
                ...(withStats
                  ? ["=bytes=" + (q.bytes ?? "0/0"), "=total-bytes=" + String(q["total-bytes"] ?? 0)]
                  : []),
              ])
            )
          );
          return;
        }
        case "/queue/simple/add": {
          state.queues.push({
            ".id": newId(),
            name: attrs.name,
            target: attrs.target,
            comment: attrs.comment ?? "",
            "max-limit": attrs["max-limit"] ?? "0/0",
            bytes: "0/0",
          });
          socket.write(sentence(["!done"]));
          return;
        }
        case "/queue/simple/set": {
          const row = state.queues.find((q) => q[".id"] === attrs[".id"]);
          if (row) {
            if (attrs.name) row.name = attrs.name;
            if (attrs.comment) row.comment = attrs.comment;
          }
          socket.write(sentence(["!done"]));
          return;
        }
        case "/queue/simple/remove":
          state.queues = state.queues.filter((q) => q[".id"] !== attrs[".id"]);
          socket.write(sentence(["!done"]));
          return;
        default:
          socket.write(replySentences([["!trap", "=message=no such command"]]));
      }
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    state,
    password,
    killConnections() {
      for (const s of state.sockets) s.destroy();
    },
    /** Fermeture propre (FIN) : ce que fait un routeur qui s'arrête. */
    closeConnections() {
      for (const s of state.sockets) s.end();
    },
    async close() {
      for (const s of state.sockets) s.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function makeClient(fake, opts = {}) {
  return new RouterOSApi({
    host: "127.0.0.1",
    portApi: fake.port,
    username: "wifi",
    password: "secret",
    ...opts,
  });
}

// ---- Parsers purs (sans réseau) ---------------------------------

test("parseAddressListRows filtre par liste et ignore les entrées désactivées", () => {
  const words = [
    "!re", "=.id=*1", "=list=wz-active", "=address=10.0.0.5", "=comment=wz:abc", "=disabled=false",
    "!re", "=.id=*2", "=list=autre-liste", "=address=10.0.0.9",
    "!re", "=.id=*3", "=list=wz-active", "=address=10.0.0.6", "=disabled=true",
    "!done",
  ];
  const rows = parseAddressListRows(words, "wz-active");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].address, "10.0.0.5");
  assert.equal(rows[0].id, "*1");
});

test("parseQueueRows : correspondance exacte + compteurs", () => {
  const words = [
    "!re", "=.id=*1", "=name=a", "=target=10.0.0.5/32", "=bytes-in=700", "=bytes-out=30",
    "!re", "=.id=*2", "=name=b", "=target=10.0.0.50/32", "=bytes-in=9000", "=bytes-out=0",
    "!done",
  ];
  const q = parseQueueRows(words, "10.0.0.5");
  assert.equal(q.id, "*1");
  assert.equal(q.bytesIn, 700);
  assert.equal(q.bytesOut, 30);
  assert.equal(parseQueueRows(words, "10.0.0.51"), null, "pas de correspondance approximative");
});

test("parseQueueRows : total seul → download déduit, jamais doublé", () => {
  const words = ["!re", "=.id=*1", "=target=10.0.0.5/32", "=total-bytes=1000", "=bytes-out=250", "!done"];
  const q = parseQueueRows(words, "10.0.0.5");
  assert.equal(q.bytesIn, 750);
  assert.equal(q.bytesOut, 250);
});

test("parseQueueRows : réponse d'erreur → null (aucune valeur inventée)", () => {
  assert.equal(parseQueueRows(["!trap", "=message=boom", "!done"], "10.0.0.5"), null);
});

// ---- Format du défi (le point le plus silencieux du jour J) ------

test("réponse au défi : \"00\" + md5(0x00 || mdp || défi), jamais du SHA1", () => {
  const got = legacyLoginResponse("secret", CHALLENGE);
  assert.equal(got, expectedLegacyResponse("secret"));
  assert.ok(got.startsWith("00"), "le préfixe littéral 00 est normatif");
  assert.equal(got.length, 34, "00 + 32 caractères hexadécimaux (MD5)");

  // Les deux erreurs qui ont fait échouer une liaison sur un vrai
  // routeur 6.42 : mauvais algorithme, et mot de passe placé APRÈS le
  // défi au lieu d'entre le 0x00 et le défi.
  const sha1 = createHash("sha1")
    .update(
      Buffer.concat([Buffer.from(CHALLENGE, "hex"), Buffer.from([0]), Buffer.from("secret", "latin1")])
    )
    .digest("hex");
  assert.notEqual(got, sha1, "ce n'est pas un SHA1");
  assert.notEqual(got, "00" + sha1, "ce n'est pas un SHA1 préfixé");

  const md5WrongOrder = createHash("md5")
    .update(
      Buffer.concat([Buffer.from(CHALLENGE, "hex"), Buffer.from([0]), Buffer.from("secret", "latin1")])
    )
    .digest("hex");
  assert.notEqual(got, "00" + md5WrongOrder, "l'ordre des octets est normatif");
});

test("réponse au défi : le mot de passe change bien le résultat", () => {
  assert.notEqual(legacyLoginResponse("a", CHALLENGE), legacyLoginResponse("b", CHALLENGE));
});

// ---- Routeur ANTÉRIEUR à 6.43 : le hAP ac² 6.42.3 du jour J ------

test("routeur 6.42.3 (défi MD5) : connexion et cycle de vie complet", async () => {
  const fake = await startFakeRouterOS({ legacy: true });
  const client = makeClient(fake);
  try {
    assert.equal(await client.connect(), true);

    // Le client officiel commence par `name` + `password` en clair ;
    // le routeur ancien exige ensuite un défi MD5.
    const logins = fake.state.seen.filter((s) => s.command === "/login");
    assert.equal(logins[0].attrs.password, "secret", "première phrase = identifiants en clair");
    assert.match(logins[1].attrs.response ?? "", /^00[0-9a-f]{32}$/, "seconde phrase = réponse MD5");

    await client.authorize({ address: "10.0.0.5", comment: "wz:abc" });
    assert.equal((await client.clients()).length, 1);

    const created = await client.ensureQueue({ address: "10.0.0.5", comment: "wz:abc" });
    assert.equal(created.created, true);

    fake.state.queues[0].bytes = "56/1234";
    const usage = await client.queueUsage("10.0.0.5");
    assert.equal(usage.bytesOut, 56);
    assert.equal(usage.bytesIn, 1234);
  } finally {
    await client.close();
    await fake.close();
  }
});

test("routeur 6.42.3 : `=stats=` refusé → réessai SANS le mot-clé", async () => {
  const fake = await startFakeRouterOS({ legacy: true });
  const client = makeClient(fake);
  try {
    await client.connect();
    await client.ensureQueue({ address: "10.0.0.5", comment: "wz:abc" });
    fake.state.queues[0].bytes = "10/20";

    const prints = fake.state.seen.filter((s) => s.command === "/queue/simple/print");
    assert.ok("stats" in prints[0].attrs, "le pilote tente d'abord =stats=");
    assert.ok(!("stats" in prints[1].attrs), "puis réessaie sans =stats= (repli 6.42)");

    const usage = await client.queueUsage("10.0.0.5");
    assert.equal(usage.bytesIn, 20, "compteurs lus malgré l'absence de =stats=");
  } finally {
    await client.close();
    await fake.close();
  }
});

test("routeur 6.42.3 sans aucune statistique : mesure REFUSÉE, jamais « 0 octet »", async () => {
  // Pire cas réel : ni `=stats=`, ni compteur en lecture seule. La file
  // est retrouvee mais vide de toute mesure.
  const fake = await startFakeRouterOS({ legacy: true, readOnlyWithoutStats: false });
  const client = makeClient(fake);
  try {
    await client.connect();
    await client.ensureQueue({ address: "10.0.0.5", comment: "wz:abc" });

    // On neutralise le compteur que le double exposerait.
    const original = fake.state.seen;
    assert.ok(original.length > 0);
    fake.state.queues[0].bytes = undefined;

    const usage = await client.queueUsage("10.0.0.5");
    assert.equal(usage, null, "aucune mesure exploitable => null, pas 0");

    // Et surtout : `findQueue` signale l'indisponibilité, ce qui rend le
    // point BLOQUANT pour --doctor.
    const row = await client.findQueue("10.0.0.5");
    assert.equal(row.available, false, "la file est signalée non mesurable");
  } finally {
    await client.close();
    await fake.close();
  }
});

test("routeur 6.42.3 : mauvais mot de passe → refus explicite, socket détruite", async () => {
  const fake = await startFakeRouterOS({ legacy: true });
  const client = makeClient(fake, { password: "mauvais" });
  try {
    await assert.rejects(() => client.connect(), /défi MD5\) refusée|refusée/);
    assert.equal(client.isConnected(), false, "socket détruite après refus du login");
  } finally {
    await client.close();
    await fake.close();
  }
});

// ---- Protocole complet (réseau local, aucun matériel) ----------

test("connexion + challenge + cycle de vie complet de la file", async () => {
  const fake = await startFakeRouterOS();
  const client = makeClient(fake);
  try {
    assert.equal(await client.connect(), true);

    await client.authorize({ address: "10.0.0.5", comment: "wz:abc" });
    const clients = await client.clients();
    assert.equal(clients.length, 1);
    assert.equal(clients[0].address, "10.0.0.5");

    const created = await client.ensureQueue({ address: "10.0.0.5", comment: "wz:abc" });
    assert.equal(created.created, true);
    assert.equal(created.target, "10.0.0.5/32");
    assert.equal(fake.state.queues.length, 1);
    assert.equal(fake.state.queues[0]["max-limit"], "0/0", "la file compte, elle ne bride pas");

    // Idempotence : deuxième appel, toujours une seule file
    const again = await client.ensureQueue({ address: "10.0.0.5", comment: "wz:abc" });
    assert.equal(again.created, false);
    assert.equal(fake.state.queues.length, 1);

    // Les lectures utilisent .proplist (charge CPU du routeur) ET
    // demandent `stats` : sans ce mot, RouterOS ne renvoie AUCUNE
    // propriété en lecture seule, donc aucun compteur.
    const print = fake.state.seen.find((s) => s.command === "/queue/simple/print");
    assert.match(print.attrs[".proplist"] ?? "", /(^|,)bytes(,|$)/, "`bytes` demandé");
    assert.ok("stats" in print.attrs, "`=stats=` demandé (sinon aucun compteur)");

    // Compteurs : `bytes` est le composite "upload/download".
    fake.state.queues[0].bytes = "56/1234";
    const usage = await client.queueUsage("10.0.0.5");
    assert.equal(usage.bytesOut, 56, "upload = 1re valeur");
    assert.equal(usage.bytesIn, 1234, "download = 2e valeur");

    // Déconnexion : file supprimée, entrée retirée
    assert.equal(await client.removeQueue({ address: "10.0.0.5" }), true);
    assert.equal(await client.deauthorize({ address: "10.0.0.5" }), true);
    assert.equal(fake.state.queues.length, 0);
    assert.equal((await client.clients()).length, 0);
  } finally {
    await client.close();
    await fake.close();
  }
});

test("requêtes concurrentes : sérialisées, aucune rejection « déjà en vol »", async () => {
  const fake = await startFakeRouterOS();
  const client = makeClient(fake);
  try {
    await client.connect();
    const results = await Promise.all([
      client.clients(),
      client.clients(),
      client.queueUsage("10.0.0.9"),
      client.clients(),
    ]);
    assert.equal(results.length, 4);
    assert.equal(results[2], null);
    // une seule connexion trotz 4 requêtes parallèles
    assert.equal(fake.state.connections, 1);
  } finally {
    await client.close();
    await fake.close();
  }
});

test("reconnexion automatique après perte de connexion (routeur redémarré)", async () => {
  const fake = await startFakeRouterOS();
  const client = makeClient(fake);
  try {
    await client.connect();
    await client.authorize({ address: "10.0.0.5", comment: "wz:abc" });
    const before = fake.state.connections;

    fake.killConnections();
    // Le socket est coupé : la requête suivante doit reconnecter.
    const clients = await client.clients();
    assert.equal(clients.length, 1, "l'état survit côté routeur");
    assert.equal(fake.state.connections, before + 1, "une reconnexion a eu lieu");
  } finally {
    await client.close();
    await fake.close();
  }
});

test("requête en attente rejetée à la fermeture (pas de boucle bloquée)", async () => {
  const fake = await startFakeRouterOS();
  const client = makeClient(fake);
  await client.connect();
  const pending = client.clients();
  await client.close();
  await assert.rejects(() => pending, /Agent arrêté|Connexion/);
  await fake.close();
});

test("fermeture propre (FIN) du routeur : la requête est rejouée", async () => {
  const fake = await startFakeRouterOS();
  const client = makeClient(fake);
  try {
    await client.connect();
    await client.authorize({ address: "10.0.0.5", comment: "wz:abc" });
    const before = fake.state.connections;

    // Un routeur arrêté proprement envoie un FIN, pas un RST : la
    // requête suivante doit malgré tout être rejouée sur une session
    // neuve au lieu d'être rejetée.
    fake.closeConnections();
    const clients = await client.clients();
    assert.equal(clients.length, 1);
    assert.equal(fake.state.connections, before + 1, "reconnexion après FIN");
  } finally {
    await client.close();
    await fake.close();
  }
});

// node:test n'applique AUCUN délai maximal par défaut : sans cette
// option, une régression sur le gel de lagent se traduirait par un
// blocage du runner plutôt que par un échec lisible.
test("routeur injoignable : la requête échoue au lieu de rester coincée", { timeout: 10000 }, async () => {
  const fake = await startFakeRouterOS();
  const client = makeClient(fake, { reconnectBaseDelayMs: 1 });
  try {
    await client.connect();
    // Plus aucun serveur : la reconnexion échoue à chaque tentative.
    await fake.close();

    // Avant correction, cette promesse ne se résolvait JAMAIS : le job
    // restait dans la file sans être rejoué ni rejeté, ce qui gelait
    // silencieusement l'agent (collecte et expiration des sessions).
    await assert.rejects(() => client.clients(), /ECONNREFUSED|Connexion|connexion/);
  } finally {
    await client.close();
  }
});

test("mauvais mot de passe → refus explicite", async () => {
  const fake = await startFakeRouterOS();
  const client = makeClient(fake, { password: "mauvais" });
  try {
    await assert.rejects(() => client.connect(), /Authentification.*refusée/);
    // Aucune socket « connectée mais non authentifiée » ne doit
    // survivre à l'échec : sinon les requêtes suivantes repartaient
    // en boucle sur « not logged in ».
    assert.equal(client.isConnected(), false, "socket détruite après refus du login");
  } finally {
    await client.close();
    await fake.close();
  }
});

test("ensureQueue refuse un préfixe réseau (protège le quota d'un client)", async () => {
  const fake = await startFakeRouterOS();
  const client = makeClient(fake);
  try {
    await client.connect();
    await assert.rejects(() => client.ensureQueue({ address: "10.0.0.0/24" }), /réseau refusée/i);
    assert.equal(fake.state.queues.length, 0);
  } finally {
    await client.close();
    await fake.close();
  }
});
