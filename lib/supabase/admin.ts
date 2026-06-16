import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * SERVER-ONLY Supabase client using the service-role key. Bypasses Row Level
 * Security, so it must NEVER be imported into a Client Component. Use it only
 * inside server actions / route handlers for privileged operations:
 * changing a user's role, deleting a user, etc.
 */
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
