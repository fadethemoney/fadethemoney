import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * SERVER-ONLY Supabase client using the service-role key. Bypasses Row Level
 * Security, so it must NEVER be imported into a Client Component. Use it only
 * inside server actions / route handlers for privileged operations:
 * changing a user's role, deleting a user, etc.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    // Surfaced to the caller (server actions catch this and show it in the UI)
    // instead of the cryptic "supabaseKey is required" the SDK would throw.
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Server is missing required Supabase env var(s): ${missing}. ` +
        `Set them in the Vercel project settings (Production) and redeploy.`,
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
