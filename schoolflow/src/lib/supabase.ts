import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && publishableKey);
export const isDemoMode = import.meta.env.VITE_DREEM_DEMO_MODE === "true";

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

if (import.meta.env.PROD && !isSupabaseConfigured && !isDemoMode) {
  console.error("DREEM production configuration is incomplete. Supabase credentials are required.");
}
