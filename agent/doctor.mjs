// ============================================================
// doctor.mjs — CONTRÔLE PRÉ-VOL de la chaîne MikroTik.
//
// À lancer la veille (ou le matin) du branchement du routeur :
//   node main.mjs --doctor
//
// Il ne modifie AUCUNE donnée métier : il se contente de
//   1. valider l'environnement de l'agent ;
//   2. vérifier que les Edge Functions répondent et que le token
//      de l'agent est reconnu (donc enregistré côté serveur) ;
//   3. se connecter au routeur et vérifier les DROITS réellement
//      necessaires : lire l'address-list, y écrire une entrée
//      provisoire, créer puis supprimer une file simple, lire les
//      compteurs ;
//   4. rappeler la configuration routeur attendue (liste, règles
//      firewall) que l'agent suppose exister.
//
// Les écritures sont systématiquement annulées (entrée et file
// porteuses du commentaire « wz:doctor ») : le routeur est laissé
// dans son état initial. Code de sortie 0 = prêt, 1 = bloqué.
// ============================================================

import { AgentHttpError, callFunction } from "./http.mjs";
import { functionsBaseUrl } from "./http.mjs";

const DOCTOR_TAG = "wz:doctor";
/**
 * Adresse de sonde. 192.0.2.0/24 est le réseau TEST-NET-1 de la RFC 5737 :
 * réservé à la documentation, JAMAIS routable sur Internet. `0.0.0.0`
 * aurait été le choix évident et il est refusé (ou pire, accepté) par
 * certaines versions de RouterOS comme cible de file.
 */
const PROBE_IP = "192.0.2.1";

function ok(log, label, detail = "") {
  log.info(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
}

function ko(log, label, detail = "") {
  log.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

function warn(log, label, detail = "") {
  log.warn(`  ! ${label}${detail ? ` — ${detail}` : ""}`);
}

function step(log, title) {
  log.info(`\n── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`);
}

/**
 * @returns {Promise<{ ok: boolean, failures: string[], warnings: string[] }>}
 */
export async function runDoctor({ env, router, log = console }) {
  const failures = [];
  const warnings = [];
  const fail = (msg) => {
    failures.push(msg);
    ko(log, "ÉCHEC", msg);
  };
  const softWarn = (msg) => {
    warnings.push(msg);
    warn(log, "AVERTISSEMENT", msg);
  };

  const isMock = env.NETWORK_ADAPTER_TYPE === "mock";

  // 1. Environnement -------------------------------------------------
  step(log, "1. Configuration de l'agent");
  if (isMock) {
    warn(log, "Mode simulateur", "aucun routeur ne sera contacté (NETWORK_ADAPTER_TYPE=mock)");
  }
  log.info(`  endpoint serveur : ${env.SUPABASE_URL || "(absent)"}`);
  log.info(`  adaptateur       : ${env.NETWORK_ADAPTER_TYPE}`);
  if (!isMock) {
    log.info(`  routeur          : ${env.MIKROTIK_HOST} (${env.AGENT_ROUTER_PROTOCOL})`);
  }
  log.info(`  liste            : ${env.WIFI_LIST_NAME}`);
  // Le protocole est le premier piège du jour J : REST n'existe pas
  // partout. On affiche la règle AVANT de tenter la connexion, pour
  // qu'un échec puisse être attribué immédiatement à la version de
  // RouterOS et non au réseau.
  if (!isMock && env.AGENT_ROUTER_PROTOCOL === "rest" && !env.bool("MIKROTIK_TLS")) {
    softWarn(
      "API REST en HTTP clair (port 80) : exige RouterOS 7.9+ et le service `www` activé " +
        "(IP > Services). Sur 7.1–7.8, utilisez MIKROTIK_TLS=true (HTTPS 443, service `www-ssl`)."
    );
  }
  const hmac = env.NETWORK_HMAC_SECRET;
  if (hmac && hmac !== "changez-moi") {
    ok(log, "secret HMAC présent", `longueur ${hmac.length}`);
  } else {
    softWarn("NETWORK_HMAC_SECRET absent : les commandes seront acceptées SANS vérification");
  }
  // hAP ac² d'usine : mot de passe vide. L'agent démarre, mais il faut
  // le signaler car c'est une configuration qui laisse l'administration
  // du routeur ouverte à tout le LAN.
  if (!isMock && !env.MIKROTIK_PASSWORD) {
    softWarn(
      "MIKROTIK_PASSWORD vide : c'est l'état d'usine des hAP (mot de passe sur l'étiquette). " +
        "OK pour la recette, à changer avant un déploiement réel."
    );
  }
  // Le hAP ac² sort d'usine en 6.42 : l'API REST n'y existe pas du
  // tout (introduite en 7.1). Beaucoup de hAP sont dans ce cas, et le
  // symptôme — 404 silencieux — ressemble à un routeur éteint.
  if (!isMock && env.AGENT_ROUTER_PROTOCOL === "rest") {
    softWarn(
      "protocole REST sélectionné : il EXIGE RouterOS 7.1+ (service www/www-ssl). " +
        "Un hAP ac² d'usine est en 6.4x, où ce protocole n'existe pas : " +
        "passez AGENT_ROUTER_PROTOCOL=api (port 8728, disponible partout)."
    );
  }

  // 2. Serveur (Edge Functions + enregistrement de l'agent) ----------
  step(log, "2. Serveur Supabase (Edge Functions)");
  if (!env.SUPABASE_URL) {
    fail("SUPABASE_URL absent : impossible de joindre le serveur");
  } else {
    const baseUrl = functionsBaseUrl(env.SUPABASE_URL);
    try {
      const res = await callFunction({
        baseUrl,
        token: env.AGENT_TOKEN,
        name: "agent-ping",
        body: { router_ok: false },
        timeoutMs: 12000,
      });
      // `ok()` renvoie le corps du RPC tel quel : on n'exige aucun
      // champ en particulier, seulement une réponse 2xx sans
      // `error` — c'est la preuve que le token est reconnu.
      const agentId = res?.agent_id ?? res?.agent?.id ?? null;
      ok(log, "agent reconnu", agentId ? `agent_id=${agentId}` : `statut=${res?.status ?? "online"}`);
    } catch (err) {
      const detail =
        err instanceof AgentHttpError && err.status === 401
          ? "token refusé (401) : l'agent n'est pas enregistré, ou AGENT_TOKEN diffère"
          : (err?.message ?? String(err));
      fail(`Edge Functions injoignables ou agent non enregistré — ${detail}`);
    }
  }

  // 3. Routeur : connexion + droits ----------------------------------
  // Les contrôles routeur dépendent UNIQUEMENT de la connexion au
  // routeur : un serveur Supabase injoignable ne doit pas masquer une
  // panne routeur (ni l'inverse) lors du diagnostic d'avant-branchement.
  step(log, "3. Routeur MikroTik");
  let routerReachable = false;
  let listEntryCreated = false;
  let queueCreated = false;
  if (isMock) {
    ok(log, "routeur simulé", "droits non vérifiables (matériel absent)");
  } else {
    try {
      const connected = await router.connect();
      if (connected === false) {
        warn(log, "connexion", "le routeur a répondu sans donnée exploitable");
      } else {
        ok(log, "connexion + identifiants", `${router.name}`);
      }
      routerReachable = true;
    } catch (err) {
      fail(`connexion routeur impossible — ${err?.message ?? err}`);
    }

    // 3a. Lecture de la liste pilotée
    if (routerReachable) {
      try {
        const before = await router.clients();
        ok(log, "lecture address-list", `${before.length} entrée(s) dans « ${env.WIFI_LIST_NAME} »`);
      } catch (err) {
        fail(`lecture /ip/firewall/address-list refusée — ${err?.message ?? err}`);
        routerReachable = false;
      }
    }

    // 3b. Écriture dans la liste (puis retrait immédiat)
    if (routerReachable) {
      try {
        await router.authorize({ address: PROBE_IP, comment: DOCTOR_TAG });
        listEntryCreated = true;
        ok(log, "écriture address-list", "entrée provisoire ajoutée");
      } catch (err) {
        fail(`écriture /ip/firewall/address-list refusée — ${err?.message ?? err}`);
      }
    }

    // 3c. Cycle de vie de la file de comptage (le cœur du quota)
    if (routerReachable) {
      try {
        const created = await router.ensureQueue({ address: PROBE_IP, comment: DOCTOR_TAG });
        queueCreated = true;
        ok(log, "création file simple", `${created.name} (${created.target})`);
        const usage = await router.queueUsage(PROBE_IP);
        if (usage) {
          // Un compteur lisible mais à zéro est le résultat NORMAL sur
          // une file neuve : ce qui compte, c'est que la valeur ait été
          // LUE, pas qu'elle soit non nulle. Une file morte se
          // distingue ici par un retour null, pas par des zéros.
          ok(
            log,
            "lecture des compteurs",
            `in=${usage.bytesIn} out=${usage.bytesOut} (valeurs neuves = 0, le QUOTIA sera bien mesuré)`
          );
        } else {
          fail(
            "file créée mais AUCUN compteur renvoyé par le routeur : le quota ne peut pas être décompté. " +
              "Vérifiez les droits de lecture sur /queue/simple (l'agent demande déjà les statistiques)."
          );
        }
      } catch (err) {
        fail(
          `cycle de vie /queue/simple refusé — ${err?.message ?? err} ` +
            "(l'agent refuse d'accorder un accès non mesuré : ce point est bloquant)"
        );
      }
    }

    // 3d. Retrait inconditionnel : même en cas d'échec en cours de
    // route, le routeur doit être rendu à son état initial. Une file
    // laissée en place continuerait de tourner pour une adresse
    // inexistante (bruit CPU inutile) et FAQINERait le prochain pré-vol.
    if (queueCreated && typeof router.removeQueue === "function") {
      try {
        if (await router.removeQueue({ address: PROBE_IP })) {
          ok(log, "suppression file simple", "routeur revenu à l'état initial");
        } else {
          softWarn("file de test non supprimée : à retirer dans Winbox (/queue simple)");
        }
      } catch (err) {
        softWarn(`file de test non supprimée (${err?.message ?? err}) : à retirer dans Winbox`);
      }
    }
    if (listEntryCreated) {
      try {
        if (await router.deauthorize({ address: PROBE_IP, comment: DOCTOR_TAG })) {
          ok(log, "retrait address-list", "routeur revenu à l'état initial");
        } else {
          softWarn("l'entrée de test n'a pas pu être retirée : à supprimer dans Winbox");
        }
      } catch (err) {
        softWarn(`entrée de test non retirée (${err?.message ?? err}) : à supprimer dans Winbox`);
      }
    }
  }

  // 4. Ce que l'agent SUPPOSE de la configuration du routeur ---------
  step(log, "4. Configuration routeur attendue (à poser sur le routeur)");
  log.info(`  /ip/firewall/address-list  list=${env.WIFI_LIST_NAME}   (l'agent y écrit)`);
  log.info("  /ip/firewall/filter        chain=forward : accepter src-address-list=<liste>");
  log.info("  /ip/firewall/filter        chain=forward : refuser le reste sur le SSID Bôjô");
  log.info("  /ip/firewall/nat           masquerade pour le réseau des clients");
  log.info("  /ip/dns                    serveurs DNS joignables par les clients");
  log.info("  /ipv6                      à désactiver ou filtrer (l'agent ne gère qu'IPv4)");
  if (isMock) {
    log.info("  (mode simulateur : rien à poser pour l'instant)");
  }

  // 5. Le tableau de bord ne doit pas hériter d'un « routeur hors ligne »
  //    laissé par le ping d'enregistrement du début de contrôle.
  if (!isMock && env.SUPABASE_URL) {
    try {
      await callFunction({
        baseUrl: functionsBaseUrl(env.SUPABASE_URL),
        token: env.AGENT_TOKEN,
        name: "agent-ping",
        body: { router_ok: routerReachable },
        timeoutMs: 12000,
      });
      ok(log, "état routeur publié", routerReachable ? "routeur joignable" : "routeur injoignable");
    } catch {
      // Sans importance : le contrôle a déjà fait son travail.
    }
  }

  // Verdict ----------------------------------------------------------
  step(log, "Verdict");
  if (failures.length === 0) {
    log.info(`  PRÊT POUR LE ROUTEUR${warnings.length ? ` (${warnings.length} avertissement(s))` : ""}`);
  } else {
    log.error(`  ${failures.length} point(s) bloquant(s) :`);
    for (const f of failures) log.error(`   - ${f}`);
  }
  for (const w of warnings) log.warn(`   avertissement : ${w}`);

  return { ok: failures.length === 0, failures, warnings };
}
