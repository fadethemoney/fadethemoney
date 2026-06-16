"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncSuperAdmin } from "@/lib/auth";

/**
 * Runs the env-pinned super_admin bootstrap for the currently signed-in user.
 * Called from the client right after a successful sign-in (the session cookie
 * is already set, so the server can read the user and elevate the role with the
 * service-role client). Best-effort — never throws into the UI.
 */
export async function bootstrapSuperAdmin() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email) {
      await syncSuperAdmin(user.id, user.email);
    }
  } catch {
    /* ignore — bootstrap is best-effort */
  }
}
