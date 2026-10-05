/**
 * Intégrité des migrations Supabase.
 *
 * Vérifications STATIQUES (aucune base requise) couvrant des erreurs qui ne
 * se voient qu'en production :
 *   - numérotation continue et sans doublon (sinon `db push` s'arrête) ;
 *   - nom de fichier sans point (sinon la version est mal lue) ;
 *   - fermeture des blocs `$$` des fonctions/triggers ;
 *   - pas de `drop table … cascade` sur une table applicative.
 *
 * Point de méthode : les commentaires `--` sont RETIRÉS avant toute analyse.
 * Les migrations documentent littéralement l'ancien défaut dans leurs
 * commentaires (c'est voulu) ; sans ce retrait, ces tests valideraient du
 * texte qui n'est jamais exécuté.
 */

const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "supabase", "migrations");

function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** Corps SQL exécutable : commentaires de ligne retirés. */
function sqlOf(file) {
  return fs
    .readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
}

describe("Migrations — nommage et numérotation", () => {
  const files = listMigrations();

  it("le dossier contient au moins une migration", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("toutes les migrations suivent NNNN_nom_sans_point.sql", () => {
    expect(files.filter((f) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(f))).toEqual([]);
  });

  it("la numérotation est continue, sans doublon ni trou", () => {
    const seqs = files.map((f) => Number(f.slice(0, 4)));
    expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, i) => i + 1));
  });

  it.each(listMigrations())("%s n'est pas vide", (f) => {
    expect(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8").trim().length).toBeGreaterThan(0);
  });
});

describe("Migrations — SQL bien formé", () => {
  it.each(listMigrations())("%s : dollar-quotes $$ appariés", (f) => {
    const opens = (sqlOf(f).match(/\$\$/g) ?? []).length;
    // Un nombre impair signifie un corps de fonction jamais refermé : le
    // fichier entier est alors refusé par Postgres.
    expect(opens % 2).toBe(0);
  });

  it.each(listMigrations())("%s : la dernière instruction est terminée", (f) => {
    expect(sqlOf(f).trim().endsWith(";")).toBe(true);
  });

  it.each(listMigrations())("%s : aucun drop table … cascade", (f) => {
    // Supprimer une table en cascade efface les données ET les policies RLS.
    expect(/drop\s+table[^;]*cascade/i.test(sqlOf(f))).toBe(false);
  });
});

describe("Migration 0016 — le correctif RLS devices", () => {
  const sql = sqlOf("0016_devices_rls_upsert_safe.sql");
  const policy = /create policy\s+"devices_self_update"[\s\S]*?;/i.exec(sql);

  it("la policy devices_self_update existe bien dans le code exécutable", () => {
    expect(policy).not.toBeNull();
  });

  it("plus de clause with check auto-référencente (cause du 500 register-device)", () => {
    // L'ancien `with check (… status = (select status from public.devices …))`
    // est interdit : c'est exactement l'upsert que l'application fait.
    expect(/select\s+status\s+from\s+public\.devices/i.test(policy[0])).toBe(false);
  });

  it("cantonne toujours l'utilisateur à SON appareil", () => {
    expect(/using\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i.test(policy[0])).toBe(true);
    expect(/with check\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i.test(policy[0])).toBe(true);
  });

  it("le déclencheur status autorise service_role ET les écritures en base directe", () => {
    expect(sql).toContain("auth.role() is distinct from 'service_role'");
    // Hors PostgREST (migrations, éditeur SQL), auth.role() vaut NULL : sans
    // cette branche, plus aucune ligne device ne serait corrigeable en base.
    expect(/current_user not in \('postgres'/.test(sql)).toBe(true);
  });

  it("le déclencheur ne fuit pas l'enveloppe de l'utilisateur", () => {
    const fn = /create or replace function public\.devices_guard_status_update\(\)[\s\S]*?\$\$;/i.exec(
      sql
    );
    expect(fn).not.toBeNull();
    expect(/set search_path\s*=\s*public/i.test(fn[0])).toBe(true);
    // Appel inter-schemas qualifié : pas de résolution via le search_path.
    expect(fn[0]).toContain("public.is_organization_admin()");
  });

  it("l'idempotence est vérifiable (drop avant create)", () => {
    expect(/drop trigger if exists devices_guard_status_update_trg/i.test(sql)).toBe(true);
    expect(/drop policy if exists "devices_self_update"/i.test(sql)).toBe(true);
  });
});

describe("Migration 0003 — le défaut historique reste traçable", () => {
  it("la policy devices_self_update d'origine est bien celle documentée", () => {
    // Ce test échoue si 0003 est réécrit : la cause racine du 500 de
    // register-device doit rester traçable, pas être effacée en silence.
    expect(/devices_self_update/i.test(sqlOf("0003_rls_and_security.sql"))).toBe(true);
  });
});
