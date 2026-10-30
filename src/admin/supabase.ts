import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: Promise<SupabaseClient> | null = null;

/**
 * The admin page's Supabase client, made with the project URL and the public
 * anon key the Worker serves at /api/config. Signing in is all it is used
 * for; every analytics read and delete goes through the Worker.
 */
export function getSupabase(): Promise<SupabaseClient> {
  client ??= fetch("/api/config")
    .then((response) => {
      if (!response.ok) throw new Error("Could not load the sign-in settings");
      return response.json() as Promise<{ supabaseUrl?: string; supabaseAnonKey?: string }>;
    })
    .then(({ supabaseUrl, supabaseAnonKey }) => {
      if (!supabaseUrl || !supabaseAnonKey) throw new Error("Sign-in is not configured");
      return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "implicit",
          storageKey: "hp-admin-auth",
        },
      });
    })
    .catch((error: unknown) => {
      client = null;
      throw error;
    });
  return client;
}
