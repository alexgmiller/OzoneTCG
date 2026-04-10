import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS.
 * ONLY use this in server components / server actions. Never import in client code.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL env var");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
