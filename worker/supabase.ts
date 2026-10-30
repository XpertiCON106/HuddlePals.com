import { createClient } from "@supabase/supabase-js";

/** Service-role client. It bypasses row level security, so it never leaves the Worker. */
export function adminDb(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
