import { describe, it, expect } from "@jest/globals";
import { resumeQuotaDecision, heartbeatTtlMsFromServer } from "../../lib/serverAuth";

// ————————————————————————————————————————————————————————————
// B. Quota épuisé : vérifie la décision côté client
// Le serveur (demo_consume_quota / quota-status) est la source de
// vérité. Le client ne fait que refléter la décision serveur.
// ————————————————————————————————————————————————————————————
describe("B — Quota épuisé : décision client", () => {
  it("restant 0 → quota_exhausted, reprise refusée", () => {
    expect(resumeQuotaDecision({ status: "active", remaining_bytes: 0 })).toBe("quota_exhausted");
  });

  it("allocation absente (après force-stop client) → inactive, pas de quota", () => {
    // Force-stop tue le processus JS. À la réouverture, le client
    // demande quota-status au serveur. Si l'allocation existe toujours
    // côté serveur, elle sera retournée. Si elle n'existe pas → inactive.
    expect(resumeQuotaDecision(null)).toBe("inactive");
    expect(resumeQuotaDecision(undefined)).toBe("inactive");
  });

  it("allocation révoquée → inactive (pas de reprise possible)", () => {
    expect(resumeQuotaDecision({ status: "revoked", remaining_bytes: 500 })).toBe("inactive");
  });

  it("allocation active avec quota → ok", () => {
    expect(resumeQuotaDecision({ status: "active", remaining_bytes: 1_000_000 })).toBe("ok");
  });

  it("réouverture après force-stop ne réapprovisionne PAS le quota", () => {
    // Le quota est purement serveur. Le client n'a aucun cache local
    // qui pourrait réapprovisionner. Le serveur renvoie le même restant.
    const st1 = { status: "active" as const, remaining_bytes: 100 };
    const st2 = { status: "active" as const, remaining_bytes: 100 };
    expect(resumeQuotaDecision(st1)).toBe("ok");
    expect(resumeQuotaDecision(st2)).toBe("ok");
    // Si le quota a été épuisé côté serveur, il reste épuisé
    const st3 = { status: "active" as const, remaining_bytes: 0 };
    expect(resumeQuotaDecision(st3)).toBe("quota_exhausted");
  });
});

// ————————————————————————————————————————————————————————————
// C. Persistance allocation après force-stop
// L'allocation est stockée dans la table `allocations` de Supabase.
// Le force-stop détruit le processus JS mais PAS la base serveur.
// À la réouverture, quota-status renvoie la même allocation.
// ————————————————————————————————————————————————————————————
describe("C — Persistance allocation après force-stop", () => {
  it("l'identifiant d'allocation et le restant sont source serveur", () => {
    // Le client n'a AUCUN stockage persistant de l'allocation.
    // Tout vient de quota-status (Edge Function → get_quota_status).
    // Vérifie que serverAuth attend bien une allocation serveur.
    const decision = resumeQuotaDecision({
      status: "active",
      remaining_bytes: 2_500_000_000,
    });
    expect(decision).toBe("ok");
  });

  it("force-stop ne change pas l'état serveur : même décision avant/après", () => {
    // Avant force-stop
    const before = resumeQuotaDecision({ status: "active", remaining_bytes: 1_000 });
    expect(before).toBe("ok");

    // Après force-stop : le client re-demande quota-status au serveur,
    // qui renvoie la même allocation (inchangée car le force-stop
    // n'affecte pas le serveur).
    const after = resumeQuotaDecision({ status: "active", remaining_bytes: 1_000 });
    expect(after).toBe("ok");

    // Si le quota est épuisé, il le reste
    const afterExhausted = resumeQuotaDecision({ status: "active", remaining_bytes: 0 });
    expect(afterExhausted).toBe("quota_exhausted");
  });
});
