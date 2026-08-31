// ============================================================
// Types de la base de données Supabase
// Reflète le schéma défini dans supabase/migrations.
// ============================================================

import type { Database as DB } from "../../supabase/database.types";

export type Database = DB;

export type Tables<T extends keyof DB["public"]["Tables"]> =
  DB["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof DB["public"]["Tables"]> =
  DB["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof DB["public"]["Tables"]> =
  DB["public"]["Tables"][T]["Update"];
