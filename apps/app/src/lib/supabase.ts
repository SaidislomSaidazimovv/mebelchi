// Supabase client — the single connection point. Reads the project URL + anon key
// from Vite env (.env.local, gitignored). If they're absent the client is `null` and
// the app keeps working entirely on localStorage, so nothing breaks before Supabase
// is set up. The anon key is safe in the client bundle: Row-Level Security (schema.sql)
// is what actually protects the data.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True once both env vars are present — gate cloud features on this. */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
