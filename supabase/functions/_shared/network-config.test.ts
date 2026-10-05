// Tests Deno — _shared/network-config.ts
//
// Verrou d'honnêteté réseau : une configuration MikroTik pilotée par un
// agent de test doit être signalée SIMULÉE, et jamais présentée comme un
// routeur réel. C'est la garantie que l'agent de recette ne peut pas faire
// croire à un contrôle matériel inexistant.

import {
  isMikrotikHardwareReal,
  isMikrotikSimulated,
  matchesAdapter,
  newSessionReference,
  resolveNetworkConfig,
} from "./network-config.ts";

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
}

const KEYS = [
  "NETWORK_ADAPTER_TYPE",
  "MIKROTIK_MOCK",
  "MIKROTIK_REAL",
  "MIKROTIK_HOST",
  "RADIUS_HOST",
  "RADIUS_SECRET",
];

function clear() {
  setEnv(Object.fromEntries(KEYS.map((k) => [k, undefined])));
}

Deno.test("resolveNetworkConfig — aucun adaptateur : non configuré, jamais simulé", () => {
  clear();
  const cfg = resolveNetworkConfig();
  if (cfg.adapterType !== null) throw new Error("adapterType doit valoir null");
  if (cfg.configured) throw new Error("rien n'est configuré");
  if (cfg.health !== "NOT_CONFIGURED") throw new Error(`health inattendu: ${cfg.health}`);
  // Un mode inconnu ne prétend à aucune simulation.
  if (cfg.simulated) throw new Error("un adaptateur absent ne peut pas être 'simulé'");
});

Deno.test("resolveNetworkConfig — MikroTik sans hôte : NOT_CONFIGURED (pas de faux READY)", () => {
  clear();
  setEnv({ NETWORK_ADAPTER_TYPE: "mikrotik" });
  const cfg = resolveNetworkConfig();
  if (cfg.adapterType !== "mikrotik") throw new Error("adapterType attendu: mikrotik");
  if (cfg.configured) throw new Error("sans MIKROTIK_HOST la config n'est pas prête");
  if (cfg.health !== "NOT_CONFIGURED") throw new Error(`health attendu: ${cfg.health}`);
  if (cfg.simulated) throw new Error("pas de pilote ⇒ pas de simulation");
});

Deno.test("resolveNetworkConfig — MikroTik avec hôte : READY mais SIMULÉ par prudence", () => {
  clear();
  setEnv({ NETWORK_ADAPTER_TYPE: "mikrotik", MIKROTIK_HOST: "10.0.0.1" });
  const cfg = resolveNetworkConfig();
  if (!cfg.configured) throw new Error("config prête");
  if (cfg.health !== "READY") throw new Error(`health attendu: READY, obtenu ${cfg.health}`);
  // FAIL CLOSED : le serveur ne voit pas l'argument `--mock` de l'agent et
  // n'a donc AUCUNE preuve que du matériel existe derrière cette adresse.
  if (!cfg.simulated) {
    throw new Error("sans MIKROTIK_REAL, le routeur ne peut pas être présenté comme réel");
  }
});

Deno.test("MIKROTIK_REAL=1 est la SEULE preuve acceptée pour lever la simulation", () => {
  clear();
  for (const raw of ["1", "true", "TRUE", "True", "yes", "YES", "on", "ON", " 1 "]) {
    Deno.env.set("MIKROTIK_REAL", raw);
    if (!isMikrotikHardwareReal()) {
      throw new Error(`MIKROTIK_REAL=« ${raw} » doit valider le matériel réel`);
    }
    if (isMikrotikSimulated()) {
      throw new Error(`MIKROTIK_REAL=« ${raw} » ne doit plus signaler de simulation`);
    }
  }
});

Deno.test("MIKROTIK_MOCK prime sur MIKROTIK_REAL en cas de contradiction", () => {
  clear();
  setEnv({ MIKROTIK_REAL: "1", MIKROTIK_MOCK: "1" });
  // Le risque n'est pas symétrique : annoncer « simulé » alors que le
  // routeur existe est réversible, l'inverse peut faire facturer de la
  // publicité à un accès inexistant.
  if (!isMikrotikSimulated()) {
    throw new Error("en cas de contradiction, la simulation doit l'emporter");
  }
  if (isMikrotikHardwareReal()) {
    throw new Error("en cas de contradiction, le matériel n'est pas confirmé");
  }
});

Deno.test("MIKROTIK_MOCK lève le drapeau de simulation (toutes les écritures)", () => {
  clear();
  for (const raw of ["1", "true", "TRUE", "True", "yes", "YES", "on", "ON", " true "]) {
    Deno.env.set("MIKROTIK_MOCK", raw);
    if (!isMikrotikSimulated()) {
      throw new Error(`« ${raw} » doit être lu comme une simulation activée`);
    }
  }
});

Deno.test("valeur non affirmative ⇒ simulation maintenue (fail closed)", () => {
  clear();
  for (const raw of ["", "0", "false", "no", "off", "peut-etre", "2"]) {
    Deno.env.set("MIKROTIK_REAL", raw);
    if (isMikrotikHardwareReal()) {
      throw new Error(`MIKROTIK_REAL=« ${raw} » ne vaut pas une preuve de matériel`);
    }
  }
});

Deno.test("simulation + MikroTik prêt : READY MAIS simulated=true", () => {
  clear();
  setEnv({
    NETWORK_ADAPTER_TYPE: "mikrotik",
    MIKROTIK_HOST: "10.0.0.1",
    MIKROTIK_MOCK: "1",
  });
  const cfg = resolveNetworkConfig();
  // Point critique : prêt techniquement, mais JAMAIS présenté comme réel.
  if (cfg.health !== "READY") throw new Error("la simulation reste fonctionnelle");
  if (!cfg.simulated) {
    throw new Error("un agent de test ne doit JAMAIS être présenté comme un routeur réel");
  }
});

Deno.test("matériel réel AFFIRMÉ : READY et simulated=false", () => {
  clear();
  setEnv({
    NETWORK_ADAPTER_TYPE: "mikrotik",
    MIKROTIK_HOST: "10.0.0.1",
    MIKROTIK_REAL: "1",
  });
  const cfg = resolveNetworkConfig();
  if (cfg.health !== "READY") throw new Error("config prête");
  if (cfg.simulated) {
    throw new Error("l'opérateur a affirmé le matériel : ne pas afficher « simulé »");
  }
});

Deno.test("RADIUS : la simulation MikroTik ne fuit pas", () => {
  clear();
  setEnv({ NETWORK_ADAPTER_TYPE: "radius", RADIUS_HOST: "h", RADIUS_SECRET: "s" });
  if (resolveNetworkConfig().simulated) {
    throw new Error("le drapeau MikroTik ne doit pas marquage un adaptateur RADIUS");
  }
});

Deno.test("matchesAdapter — sans configuration, aucune correspondance", () => {
  clear();
  if (matchesAdapter("mikrotik")) throw new Error("rien n'est configuré");
  if (matchesAdapter()) throw new Error("sans adaptateur, aucune correspondance implicite");
});

Deno.test("matchesAdapter — correspondance exacte exigée", () => {
  clear();
  setEnv({ NETWORK_ADAPTER_TYPE: "mikrotik", MIKROTIK_HOST: "10.0.0.1" });
  if (!matchesAdapter()) throw new Error("sans argument, l'adaptateur courant correspond");
  if (!matchesAdapter("mikrotik")) throw new Error("mikrotik doit correspondre");
  if (matchesAdapter("radius")) throw new Error("radius ne doit pas correspondre");
});

Deno.test("newSessionReference — préfixe + UUID, jamais deux fois le même", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i += 1) {
    const ref = newSessionReference("sess");
    if (!ref.startsWith("sess-")) throw new Error(`préfixe perdu: ${ref}`);
    if (seen.has(ref)) throw new Error("référence dupliquée");
    seen.add(ref);
  }
});

Deno.test("newSessionReference — ne fuit aucun secret d'environnement", () => {
  clear();
  Deno.env.set("MIKROTIK_HOST", "10.0.0.1");
  Deno.env.set("RADIUS_SECRET", "super-secret");
  const ref = newSessionReference("sess");
  if (ref.includes("10.0.0.1") || ref.includes("super-secret")) {
    throw new Error("la référence de session ne doit jamais contenir un secret");
  }
});
