import { describe, it, expect } from "@jest/globals";
import {
  canTransition,
  CONNECTION_ACTIONS,
} from "../connectionMachine";

const A = CONNECTION_ACTIONS;
const ACTIONS = Object.values(A);

/**
 * Contrat multi-fenêtres / perte de focus de la machine de connexion,
 * fondé sur le CODE RÉEL (aucune simulation Android favorable).
 *
 * Contexte (Android, RN 0.74.5) : en écran partagé, lorsque l'utilisateur
 * touche l'autre fenêtre (Chrome), MainActivity.onPause() est appelé même si
 * l'activité reste visible → AppState passe à "background" →
 * ConnectionContext.tsx (l.429-440) exécute blockNow() + invalidateGeneration()
 * + PAUSE. Le seul signal de multi-fenêtres distribué à la machine est donc
 * PAUSE. Il n'existe Aucune règle « perte de focus → accès maintenu ».
 *
 * Ces tests vérifient uniquement les règles réelles de la machine ; ils ne
 * prétendent PAS valider l'écran partagé (validation réelle exigée sur device).
 */

describe("contrat multi-fenêtres — perte de focus depuis wifi_active", () => {
  it("PAUSE est le seul chemin wifi_active → paused (la perte de focus BLOQUE)", () => {
    expect(canTransition("wifi_active", A.PAUSE)).toBe("paused");
  });

  it("depuis wifi_active, la seule transition qui MAINTIENT l'accès est HB_OK (heartbeat serveur, sans rapport avec le focus)", () => {
    const selfLoops = ACTIONS.filter((a) => canTransition("wifi_active", a) === "wifi_active");
    expect(selfLoops.sort()).toEqual([A.HB_OK]);
  });

  it("RESUME n'existe que depuis paused : il n'y a pas de « reprise » avant une pause", () => {
    expect(canTransition("wifi_active", A.RESUME)).toBeNull();
    expect(canTransition("paused", A.RESUME)).toBe("wifi_active");
  });

  it("aucune action ne combine perte de focus et maintien de wifi_active (machine sans règle favorable)", () => {
    const nonPauseTargets = ACTIONS.filter(
      (a) => a !== A.PAUSE && canTransition("wifi_active", a) === "paused"
    );
    expect(nonPauseTargets).toEqual([]);
  });
});

describe("contrat multi-fenêtres — depuis paused", () => {
  it("paused ne revient à wifi_active que via RESUME ou HB_OK (rattrapage heartbeat, non dispatché)", () => {
    const toActive = ACTIONS.filter((a) => canTransition("paused", a) === "wifi_active");
    expect(toActive.sort()).toEqual([A.HB_OK, A.RESUME]);
  });

  it("paused → quota_exhausted si le quota est épuisé (tyrannie du serveur, pas du focus)", () => {
    expect(canTransition("paused", A.QUOTA_EXHAUSTED)).toBe("quota_exhausted");
  });

  it("CONNECT est déclaré depuis paused par la machine mais intercepté par resumeFromPaused dans ConnectionContext (jamais atteint au runtime)", () => {
    // Note : cette règle existe dans TRANSITIONS mais connect() (l.653-655)
    // retourne résumeFromPaused() avant tout transition(CONNECT) depuis paused.
    expect(canTransition("paused", A.CONNECT)).toBe("ad_loading");
  });
});

describe("transitions multi-fenêtres pertinentes", () => {
  it("HB_OK depuis wifi_active maintient l'accès (renouvellement heartbeat serveur)", () => {
    expect(canTransition("wifi_active", A.HB_OK)).toBe("wifi_active");
  });

  it("DISCONNECT depuis wifi_active et paused → disconnecting, raison USER_PAUSED_AD", () => {
    expect(canTransition("wifi_active", A.DISCONNECT)).toBe("disconnecting");
    expect(canTransition("paused", A.DISCONNECT)).toBe("disconnecting");
  });
});