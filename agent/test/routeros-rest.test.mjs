// ============================================================
// test/routeros-rest.test.mjs — Pilote REST RouterOS avec un
// `fetch` simulé : aucun routeur requis.
//
// Le faux routeur respecte le CONTRAT HTTP RÉEL de RouterOS :
//   GET=print  PATCH=set  PUT=add(create)  DELETE=remove
//   POST = commande console (donc REFUSÉ sur un chemin de menu)
//   GET sur un menu ne renvoie PAS les statistiques ; il faut
//   `POST /queue/simple/print` avec `stats` pour obtenir les
//   compteurs, et ceux-ci s'appellent `bytes` ("upload/download").
//
// Ce double a une fonction précise : il doit REFUSER ce qu'un
// routeur refuserait. Une double qui accepte `POST` pour créer
// laisse passer un pilote qui n'aurait rien créé sur le matériel —
// et l'agent refusant toute autorisation sans file de comptage,
// l'échec n'aurait été visible qu'au moment de brancher le client.
// ============================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { RouterOSRest } from "../lib/routeros-rest.mjs";

/**
 * Routeur REST simulé fidèle au contrat MikroTik.
 *
 * @param {object} options
 * @param {boolean} options.statsAvailable  `false` = le routeur ne
 *   renvoie aucun compteur (droits de lecture insuffisants, ou
 *   statistiques indisponibles) : l'agent doit le détecter au lieu
 *   de remonter un « 0 octet » qui ferait croire à une mesure.
 */
function fakeRouterOS({ list = "wz-active", queues = [], entries = [], statsAvailable = true } = {}) {
  const state = { list, entries: [], queues: [], nextId: 1, calls: [] };
  const newId = () => `*${state.nextId++}`;
  state.entries = entries.map((e) => ({ ".id": newId(), ...e }));
  state.queues = queues.map((q) => ({ ".id": newId(), ...q }));

  /** Lignes telles que RouterOS les rend : compteurs inclus ou non.
   *  Fidèle au routeur : on n'injecte AUCUN compteur que le test n'a
   *  pas mis sur la ligne. */
  const withStats = (q) => {
    if (!statsAvailable) {
      const { bytes, ["total-bytes"]: totalBytes, ...rest } = q;
      void bytes;
      void totalBytes;
      return rest;
    }
    return q;
  };
  /** Simule du trafic écoulé depuis la création de la file. */
  state.addTraffic = (address, up, down) => {
    const q = state.queues.find((r) => String(r.target).startsWith(address));
    if (!q) throw new Error(`aucune file pour ${address}`);
    const [curUp, curDown] = String(q.bytes ?? "0/0").split("/").map(Number);
    q.bytes = `${curUp + up}/${curDown + down}`;
  };

  const json = (data, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  });
  /** Réponse d'un POST sur un chemin de menu : RouterOS s'attend à une
   *  commande console et répond « no such command ». */
  const notACommand = (path) =>
    json({ error: 400, message: "Bad Request", detail: `no such command or directory (${path})` }, 400);

  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace("/rest", "");
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    state.calls.push({ method, path, query: u.search, body, headers: init.headers });

    const seg = path.split("/").filter(Boolean);
    const item = method === "PATCH" || method === "DELETE";
    const resource = (item ? seg.slice(0, -1) : seg).join("/");
    const id = item ? seg[seg.length - 1] : null;

    if (resource === "system/resource") {
      if (method !== "GET") return notACommand(path);
      return json([{ uptime: "1h", version: "7.14.3", "board-name": "hAP ac2" }]);
    }

    if (resource === "ip/firewall/address-list") {
      if (method === "GET") {
        let rows = state.entries;
        if (u.searchParams.get("list")) rows = rows.filter((r) => r.list === u.searchParams.get("list"));
        if (u.searchParams.get("address")) rows = rows.filter((r) => r.address === u.searchParams.get("address"));
        return json(rows);
      }
      // POST sur un menu n'est PAS une création : c'est une commande
      // console. C'est ce refus qui avait produit « aucun octet ne
      // traverse » le jour J, sans que la suite ne le voie.
      if (method === "POST") return notACommand(path);
      if (method === "PUT") {
        const row = { ".id": newId(), list: body.list, address: body.address, comment: body.comment };
        state.entries.push(row);
        return json([row]);
      }
      if (method === "PATCH") {
        const row = state.entries.find((r) => r[".id"] === id);
        if (!row) return json({ message: "Not Found" }, 404);
        Object.assign(row, body);
        return json(row);
      }
      if (method === "DELETE") {
        state.entries = state.entries.filter((r) => r[".id"] !== id);
        return json([]);
      }
    }

    if (resource === "queue/simple") {
      if (method === "GET") {
        // GET = `print` SANS stats : pas de compteurs.
        return json(state.queues.map((q) => withStats(q)));
      }
      if (method === "PUT") {
        const row = { ".id": newId(), ...body, bytes: "0/0" };
        state.queues.push(row);
        return json([row]);
      }
      if (method === "POST") return notACommand(path);
      if (method === "PATCH") {
        const row = state.queues.find((r) => r[".id"] === id);
        if (!row) return json({ message: "Not Found" }, 404);
        Object.assign(row, body);
        return json(row);
      }
      if (method === "DELETE") {
        state.queues = state.queues.filter((r) => r[".id"] !== id);
        return json([]);
      }
    }

    if (resource === "queue/simple/print") {
      if (method !== "POST") return notACommand(path);
      // `print` avec `stats` : les compteurs sont là.
      return json(state.queues.map((q) => withStats(q)));
    }

    return json({ message: `chemin inconnu ${path}` }, 404);
  };
  return { state, fetchImpl };
}

function makeRouter(fetcher, opts = {}) {
  return new RouterOSRest({
    host: "192.168.88.1",
    username: "wifi",
    password: "secret",
    fetchImpl: fetcher,
    ...opts,
  });
}

// On injecte fetch via l'agent global : le pilote utilise fetch natif.
async function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("port REST : 80 sans TLS, 443 avec TLS", async () => {
  const a = new RouterOSRest({ host: "h", username: "u", password: "p" });
  const b = new RouterOSRest({ host: "h", username: "u", password: "p", tls: true });
  assert.equal(a.port, 80, "REST HTTP ne peut pas être sur 443");
  assert.equal(b.port, 443);
  assert.equal(new RouterOSRest({ host: "h", username: "u", password: "p", portRest: 8080 }).port, 8080);
});

test("authorize crée l'entrée de liste, une seule fois", async () => {
  const fake = fakeRouterOS();
  const router = makeRouter(fake.fetchImpl, { fetchImpl: fake.fetchImpl });
  await withFetch(fake.fetchImpl, async () => {
    await router.authorize({ address: "10.0.0.5", comment: "wz:abc" });
    await router.authorize({ address: "10.0.0.5", comment: "wz:abc" });
    assert.equal(fake.state.entries.length, 1, "pas de doublon");
    assert.equal(fake.state.entries[0].address, "10.0.0.5");
    assert.equal(fake.state.entries[0].list, "wz-active");
  });
});

test("ensureQueue crée une file /32 max-limit 0/0 puis est idempotente", async () => {
  const fake = fakeRouterOS();
  const router = new RouterOSRest({
    host: "192.168.88.1",
    username: "wifi",
    password: "secret",
  });
  await withFetch(fake.fetchImpl, async () => {
    const first = await router.ensureQueue({ address: "10.0.0.5", comment: "wz:abc" });
    assert.equal(first.created, true);
    assert.equal(first.target, "10.0.0.5/32", "cible /32, jamais un réseau");
    assert.equal(fake.state.queues.length, 1);
    assert.equal(fake.state.queues[0]["max-limit"], "0/0", "la file ne bride pas, elle compte");

    const second = await router.ensureQueue({ address: "10.0.0.5", comment: "wz:abc" });
    assert.equal(second.created, false);
    assert.equal(fake.state.queues.length, 1, "toujours une seule file");
  });
});

test("ensureQueue corrige un nom de file qui a dérivé (convergent)", async () => {
  const fake = fakeRouterOS({
    queues: [{ ".id": "*7", name: "bojo-ancien", target: "10.0.0.5/32", comment: "wz:abc" }],
  });
  const router = new RouterOSRest({ host: "h", username: "u", password: "p" });
  await withFetch(fake.fetchImpl, async () => {
    const res = await router.ensureQueue({ address: "10.0.0.5", comment: "wz:abc" });
    assert.equal(res.created, false);
    assert.equal(fake.state.queues.length, 1, "pas de seconde file");
    assert.equal(fake.state.queues[0].name, "bojo-10.0.0.5-abc", "nom corrigé");
  });
});

test("ensureQueue refuse un préfixe réseau (compterait tout le LAN)", async () => {
  const fake = fakeRouterOS();
  const router = new RouterOSRest({ host: "h", username: "u", password: "p" });
  await withFetch(fake.fetchImpl, async () => {
    await assert.rejects(() => router.ensureQueue({ address: "10.0.0.0/24" }), /réseau refusée/i);
    assert.equal(fake.state.queues.length, 0, "aucune file créée");
  });
});

test("queueUsage lit le composite `bytes` (upload/download) — la VRAIE propriété RouterOS", async () => {
  const fake = fakeRouterOS({
    queues: [{ ".id": "*1", name: "q", target: "10.0.0.5/32", bytes: "100/500" }],
  });
  const router = new RouterOSRest({ host: "h", username: "u", password: "p" });
  await withFetch(fake.fetchImpl, async () => {
    const usage = await router.queueUsage("10.0.0.5");
    // `bytes` est ordonné upload/download : le DOWNLOAD du client
    // (bytes-in) est donc la SECONDE valeur.
    assert.equal(usage.bytesOut, 100, "upload");
    assert.equal(usage.bytesIn, 500, "download");
  });
});

test("queueUsage : aucun compteur lu => null (jamais un 0 inventé)", async () => {
  // Routeur qui ne renvoie pas de statistiques : c'est exactement le
  // cas qui rendait le quota figé sans aucun signal. Un compteur à
  // zéro aurait laissé croire à une mesure fonctionnelle.
  const fake = fakeRouterOS({ statsAvailable: false });
  const router = new RouterOSRest({ host: "h", username: "u", password: "p" });
  await withFetch(fake.fetchImpl, async () => {
    await router.ensureQueue({ address: "10.0.0.5", comment: "wz:abc" });
    assert.equal(await router.queueUsage("10.0.0.5"), null);
  });
});

test("queueUsage suit le trafic croissant (le quota se décompte)", async () => {
  const fake = fakeRouterOS();
  const router = new RouterOSRest({ host: "h", username: "u", password: "p" });
  await withFetch(fake.fetchImpl, async () => {
    await router.ensureQueue({ address: "10.0.0.5", comment: "wz:abc" });
    assert.deepEqual(
      (({ bytesIn, bytesOut }) => ({ bytesIn, bytesOut }))(await router.queueUsage("10.0.0.5")),
      { bytesIn: 0, bytesOut: 0 },
      "file neuve : 0/0"
    );
    fake.state.addTraffic("10.0.0.5", 1000, 9000);
    const usage = await router.queueUsage("10.0.0.5");
    assert.equal(usage.bytesOut, 1000);
    assert.equal(usage.bytesIn, 9000);
  });
});

test("queueUsage : total seul → tout compté en download (jamais doublé)", async () => {
  const fake = fakeRouterOS({
    queues: [{ ".id": "*1", name: "q", target: "10.0.0.5/32", "total-bytes": 900 }],
  });
  const router = new RouterOSRest({ host: "h", username: "u", password: "p" });
  await withFetch(fake.fetchImpl, async () => {
    const usage = await router.queueUsage("10.0.0.5");
    assert.equal(usage.bytesIn, 900, "le total est le seul chiffre disponible");
    assert.equal(usage.bytesOut, 0);
  });
});

test("queueUsage : une direction + total → l'autre se déduit", async () => {
  const fake = fakeRouterOS({
    queues: [{ ".id": "*1", name: "q", target: "10.0.0.5/32", "total-bytes": 900, "bytes-out": 100 }],
  });
  const router = new RouterOSRest({ host: "h", username: "u", password: "p" });
  await withFetch(fake.fetchImpl, async () => {
    const usage = await router.queueUsage("10.0.0.5");
    assert.equal(usage.bytesOut, 100);
    assert.equal(usage.bytesIn, 800, "total - upload");
  });
});

test("queueUsage ne confond pas deux clients voisins", async () => {
  const fake = fakeRouterOS({
    queues: [
      { ".id": "*1", name: "a", target: "10.0.0.5/32", bytes: "1/111" },
      { ".id": "*2", name: "b", target: "10.0.0.50/32", bytes: "2/222" },
    ],
  });
  const router = new RouterOSRest({ host: "h", username: "u", password: "p" });
  await withFetch(fake.fetchImpl, async () => {
    assert.equal((await router.queueUsage("10.0.0.5")).bytesIn, 111);
    assert.equal((await router.queueUsage("10.0.0.50")).bytesIn, 222);
  });
});

test("cible RouterOS 7 imbriquée (target-address/ip-address) reconnue", async () => {
  // RouterOS 7 recent rend `target` comme un OBJET. Sans
  // normalisation, l'agent ne reconnaîtrait jamais sa propre file :
  // il la recréerait à chaque collecte (fuite) et ne compterait rien.
  const fake = fakeRouterOS({
    queues: [
      {
        ".id": "*1",
        name: "a",
        target: { "target-address": { "ip-address": "10.0.0.5/32" } },
        bytes: "1/111",
      },
    ],
  });
  const router = new RouterOSRest({ host: "h", username: "u", password: "p" });
  await withFetch(fake.fetchImpl, async () => {
    assert.equal((await router.queueUsage("10.0.0.5")).bytesIn, 111);
    const res = await router.ensureQueue({ address: "10.0.0.5", comment: "wz:abc" });
    assert.equal(res.created, false, "file existante reconnue, pas de doublon");
    assert.equal(fake.state.queues.length, 1);
  });
});

// ---- Contrat HTTP RouterOS (non-régression) --------------------

test("CRÉATION par PUT — POST sur un menu de création serait refusé", async () => {
  // Verrou de non-régression principal : le pilote créait ses objets
  // avec POST, que RouterOS interprète comme une commande console
  // (« no such command »). L'agent refusant toute autorisation sans
  // file de comptage, aucun client n'aurait jamais eu Internet.
  const fake = fakeRouterOS();
  const router = new RouterOSRest({ host: "h", username: "u", password: "p" });
  await withFetch(fake.fetchImpl, async () => {
    await router.authorize({ address: "10.0.0.5", comment: "wz:abc" });
    await router.ensureQueue({ address: "10.0.0.5", comment: "wz:abc" });

    const creations = fake.state.calls.filter((c) => c.method === "PUT");
    assert.equal(creations.length, 2, "deux créations, en PUT");
    assert.ok(
      fake.state.calls.every((c) => c.method !== "POST" || c.path === "/queue/simple/print"),
      "POST réservé à la commande console `print`"
    );
    assert.equal(fake.state.entries.length, 1);
    assert.equal(fake.state.queues.length, 1);
  });
});

test("lecture des compteurs : `print` avec stats, pas le GET de la collection", async () => {
  const fake = fakeRouterOS();
  const router = new RouterOSRest({ host: "h", username: "u", password: "p" });
  await withFetch(fake.fetchImpl, async () => {
    await router.queueUsage("10.0.0.5");
    const print = fake.state.calls.find((c) => c.method === "POST");
    assert.ok(print, "le pilote interroge print via POST");
    assert.equal(print.path, "/queue/simple/print");
    assert.equal(print.body.stats, "", "`stats` demandé (sinon aucun compteur)");
  });
});

test("connect() diagnostique l'absence d'API REST (404) au lieu d'un échec muet", async () => {
  // RouterOS 6.x n'a pas d'API REST du tout. Le message doit nommer la
  // cause et la parade, sinon l'exploitant cherche un panne réseau.
  const fetchImpl = async () => ({
    ok: false,
    status: 404,
    text: async () => JSON.stringify({ error: 404, message: "Not Found" }),
  });
  const router = new RouterOSRest({ host: "192.168.88.1", username: "u", password: "p" });
  await withFetch(fetchImpl, async () => {
    await assert.rejects(() => router.connect(), /7\.1[\s\S]*AGENT_ROUTER_PROTOCOL=api/);
  });
});

test("removeQueue supprime la file du bon client", async () => {
  const fake = fakeRouterOS({
    queues: [
      { ".id": "*1", name: "a", target: "10.0.0.5/32" },
      { ".id": "*2", name: "b", target: "10.0.0.50/32" },
    ],
  });
  const router = new RouterOSRest({ host: "h", username: "u", password: "p" });
  await withFetch(fake.fetchImpl, async () => {
    assert.equal(await router.removeQueue({ address: "10.0.0.5" }), true);
    assert.equal(fake.state.queues.length, 1);
    assert.equal(fake.state.queues[0].target, "10.0.0.50/32");
  });
});

test("clients() ne liste que NOTRE liste", async () => {
  const fake = fakeRouterOS({
    entries: [
      { ".id": "*1", list: "wz-active", address: "10.0.0.5", comment: "wz:abc" },
      { ".id": "*2", list: "admin-statique", address: "10.0.0.9", comment: "nat" },
    ],
  });
  const router = new RouterOSRest({ host: "h", username: "u", password: "p" });
  await withFetch(fake.fetchImpl, async () => {
    const clients = await router.clients();
    assert.equal(clients.length, 1);
    assert.equal(clients[0].address, "10.0.0.5");
  });
});

test("deauthorize retire l'entrée même si le commentaire a dérivé", async () => {
  const fake = fakeRouterOS({
    entries: [{ ".id": "*1", list: "wz-active", address: "10.0.0.5", comment: "wz:ancien" }],
  });
  const router = new RouterOSRest({ host: "h", username: "u", password: "p" });
  await withFetch(fake.fetchImpl, async () => {
    assert.equal(await router.deauthorize({ address: "10.0.0.5", comment: "wz:nouveau" }), true);
    assert.equal(fake.state.entries.length, 0, "l'autorisation résiduelle doit disparaître");
  });
});

test("erreur HTTP RouterOS remontée avec le message", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 403,
    text: async () => JSON.stringify([{ message: "not allowed" }]),
  });
  const router = new RouterOSRest({ host: "h", username: "u", password: "p" });
  await withFetch(fetchImpl, async () => {
    await assert.rejects(() => router.authorize({ address: "10.0.0.5" }), /403.*not allowed/);
  });
});

// ---- Transport HTTPS (certificat auto-signé) --------------------

test("TLS : la requête passe par node:https et tolère l'auto-signé", async () => {
  // Ce test verrouille le câblage : le `fetch` natif de Node ignore
  // l'option `agent`, donc sur un routeur réel (certificat auto-signé)
  // une connexion HTTPS avec `rejectUnauthorized` non appliqué échoue
  // toujours. On vérifie que l'option est bien transmise ET que le
  // pilote n'essaie pas d'utiliser fetch.
  const calls = [];
  const fakeHttps = (url, options, onResponse) => {
    calls.push({ url, options });
    const listeners = {};
    const req = {
      write: (body) => calls[calls.length - 1].body = body,
      end: () => {
        queueMicrotask(() => {
          const res = {
            statusCode: 200,
            setEncoding: () => {},
            on: (ev, fn) => {
              if (ev === "data") queueMicrotask(() => fn("[]"));
              if (ev === "end") queueMicrotask(fn);
            },
          };
          onResponse(res);
        });
      },
      on: (ev, fn) => {
        listeners[ev] = fn;
      },
      destroy: () => {},
    };
    return req;
  };

  const router = new RouterOSRest({
    host: "192.168.88.1",
    username: "admin",
    password: "secret",
    tls: true,
    httpsRequestImpl: fakeHttps,
  });

  let fetchUsed = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    fetchUsed = true;
    throw new Error("fetch ne doit pas etre utilise en TLS");
  };
  try {
    const clients = await router.clients();
    assert.equal(fetchUsed, false, "en HTTPS, node:https est utilisé");
    assert.deepEqual(clients, []);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.rejectUnauthorized, false, "auto-signé toléré");
    assert.equal(calls[0].options.timeout, 12000, "délai d'attente posé sur la requête");
    assert.match(calls[0].url, /^https:\/\/192\.168\.88\.1:443\/rest/);
    assert.match(calls[0].options.headers.Authorization, /^Basic /);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
