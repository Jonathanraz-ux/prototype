import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getConfig } from "./config";
import type { Database } from "../../supabase/database.types";

let _supabase: SupabaseClient<Database> | null = null;

export function getSupabase() {
  if (_supabase) return _supabase;

  const config = getConfig();

  _supabase = createClient<Database>(
    config.EXPO_PUBLIC_SUPABASE_URL,
    config.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 2,
        },
      },
    }
  );

  return _supabase;
}
