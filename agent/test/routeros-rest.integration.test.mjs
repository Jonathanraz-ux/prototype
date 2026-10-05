// ============================================================
// test/routeros-rest.integration.test.mjs — Répétition SANS
// routeur, mais sur un VRAI serveur HTTP (socket TCP).
//
// Pourquoi ce test existe en plus du double `fetch` : `fetch`
// simulé ne vérifie ni l'URL réellement construite, ni l'en-tête
// d'authentification envoyé, ni le routage HTTP par verbe.
// Or les trois se sont révélés être la cause des pannes du jour J
// (mauvais port, mauvais verbe, REST inexistant). Ici, Node lève un
// vrai serveur : si le pilote émet `POST` pour créer, le serveur
// répond 400 comme le ferait RouterOS, et le test échoue.
//
// Le serveur implémente le contrat documenté de l'API REST MikroTik :
//   GET=print  PATCH=set  PUT=add  DELETE=remove
//   POST       = commande console (refusée sur un chemin de menu)
// et `/queue/simple/print` avec `stats` pour obtenir les compteurs.
// ============================================================

import http from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import { RouterOSRest } from "../lib/routeros-rest.mjs";

const BASIC = `Basic ${Buffer.from("wifi:secret").toString("base64")}`;

/** Routeur REST simulé, servi sur un vrai socket. */
function startRouter() {
  const state = { entries: [], queues: [], nextId: 1, verbs: [] };
  const newId = () => `*${state.nextId++}`;

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? JSON.parse(raw) : null;
      const url = new URL(req.url, "http://127.0.0.1");
      const path = url.pathname.replace(/^\/rest/, "");
      state.verbs.push({ method: req.method, path, body });

      const send = (data, status = 200) => {
        const text = JSON.stringify(data);
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(text);
      };
      const noCommand = (p) =>
        send({ error: 400, message: "Bad Request", detail: `no such command or directory (${p})` }, 400);

      // Authentification : un agent sans bons identifiants ne doit pas
      // pouvoir piloter le routeur.
      if (req.headers.authorization !== BASIC) {
        send({ error: 401, message: "Unauthorized" }, 401);
        return;
      }

      const seg = path.split("/").filter(Boolean);
      const isItem = req.method === "PATCH" || req.method === "DELETE";
      const resource = (isItem ? seg.slice(0, -1) : seg).join("/");
      const id = isItem ? seg[seg.length - 1] : null;

      if (resource === "system/resource") {
        if (req.method !== "GET") return noCommand(path);
        return send([{ uptime: "3h", version: "7.14.3", "board-name": "hAP ac2" }]);
      }

      if (resource === "queue/simple/print") {
        if (req.method !== "POST") return noCommand(path);
        return send(state.queues);
      }

      if (resource === "ip/firewall/address-list") {
        if (req.method === "GET") {
          let rows = state.entries;
          const list = url.searchParams.get("list");
          const address = url.searchParams.get("address");
          if (list) rows = rows.filter((r) => r.list === list);
          if (address) rows = rows.filter((r) => r.address === address);
          return send(rows);
        }
        if (req.method === "POST") return noCommand(path);
        if (req.method === "PUT") {
          const row = { ".id": newId(), list: body.list, address: body.address, comment: body.comment };
          state.entries.push(row);
          return send(row);
        }
        if (req.method === "PATCH") {
          const row = state.entries.find((r) => r[".id"] === id);
          if (!row) return send({ message: "Not Found" }, 404);
          Object.assign(row, body);
          return send(row);
        }
        if (req.method === "DELETE") {
          state.entries = state.entries.filter((r) => r[".id"] !== id);
          return send({});
        }
      }

      if (resource === "queue/simple") {
        if (req.method === "GET") {
          // GET = print sans stats : aucun compteur.
          return send(state.queues.map(({ bytes, ...rest }) => rest));
        }
        if (req.method === "POST") return noCommand(path);
        if (req.method === "PUT") {
          const row = { ".id": newId(), ...body, bytes: "0/0" };
          state.queues.push(row);
          return send(row);
        }
        if (req.method === "PATCH") {
          const row = state.queues.find((r) => r[".id"] === id);
          if (!row) return send({ message: "Not Found" }, 404);
          Object.assign(row, body);
          return send(row);
        }
        if (req.method === "DELETE") {
          state.queues = state.queues.filter((r) => r[".id"] !== id);
          return send({});
        }
      }

      send({ message: `chemin inconnu ${path}` }, 404);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        state,
        port,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

test("chaîne complète sur vrai HTTP : autorisation → comptage → révocation", async (t) => {
  const fake = await startRouter();
  const router = new RouterOSRest({
    host: "127.0.0.1",
    username: "wifi",
    password: "secret",
    // port dynamique du serveur de test
    portRest: fake.port,
    tls: false,
  });
  t.after(() => fake.close());

  // 1. Le pilote se connecte et identifie le routeur
  assert.equal(await router.connect(), true);

  // 2. Autorisation : entrée de liste + file de comptage
  await router.authorize({ address: "10.0.0.5", comment: "wz:8f4ac6e2" });
  const queue = await router.ensureQueue({ address: "10.0.0.5", comment: "wz:8f4ac6e2" });
  assert.equal(queue.created, true);
  assert.equal(queue.target, "10.0.0.5/32");

  // 3. Les créations sont bien des PUT (POST y serait refusé)
  const creations = fake.state.verbs.filter((v) => v.method === "PUT");
  assert.equal(creations.length, 2, "entrée + file créées en PUT");
  assert.ok(
    fake.state.verbs.every((v) => v.method !== "POST" || v.path === "/queue/simple/print"),
    "aucun POST de création"
  );

  // 4. Une file neuve mesure 0/0 — mesurée, pas devinée
  const initial = await router.queueUsage("10.0.0.5");
  assert.deepEqual({ in: initial.bytesIn, out: initial.bytesOut }, { in: 0, out: 0 });

  // 5. Le trafic est décompté dans le bon sens (upload/download)
  const row = fake.state.queues[0];
  row.bytes = "1200/3400";
  const usage = await router.queueUsage("10.0.0.5");
  assert.equal(usage.bytesOut, 1200, "upload = 1re valeur de `bytes`");
  assert.equal(usage.bytesIn, 3400, "download = 2e valeur");

  // 6. Idempotence : rejouer l'autorisation ne duplique rien
  await router.authorize({ address: "10.0.0.5", comment: "wz:8f4ac6e2" });
  await router.ensureQueue({ address: "10.0.0.5", comment: "wz:8f4ac6e2" });
  assert.equal(fake.state.entries.length, 1);
  assert.equal(fake.state.queues.length, 1);

  // 7. Révocation : l'entrée ET la file disparaissent
  assert.equal(await router.deauthorize({ address: "10.0.0.5" }), true);
  assert.equal(await router.removeQueue({ address: "10.0.0.5" }), true);
  assert.equal(fake.state.entries.length, 0, "pas d'autorisation résiduelle");
  assert.equal(fake.state.queues.length, 0, "pas de file fantôme");
});

test("identifiants refusés : échec net, pas de socket en boucle", async (t) => {
  const fake = await startRouter();
  t.after(() => fake.close());

  const router = new RouterOSRest({
    host: "127.0.0.1",
    username: "wifi",
    password: "mauvais",
    portRest: fake.port,
    tls: false,
  });
  await assert.rejects(() => router.connect(), /401/);
  assert.equal(fake.state.entries.length, 0, "aucune écriture possible");
  assert.equal(fake.state.queues.length, 0);
});

test("routeur sans API REST (404) : message actionnable", async (t) => {
  // Simule un RouterOS 6.x : /rest n'existe pas.
  const server = http.createServer((req, res) => {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: 404, message: "Not Found" }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  t.after(() => new Promise((r) => server.close(r)));

  const router = new RouterOSRest({
    host: "127.0.0.1",
    username: "wifi",
    password: "secret",
    portRest: port,
    tls: false,
  });
  // Le message doit nommer la parade, sinon on cherche une panne réseau.
  await assert.rejects(() => router.connect(), /7\.1|www-ssl|AGENT_ROUTER_PROTOCOL=api/);
});