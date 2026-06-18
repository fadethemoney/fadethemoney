"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncSuperAdmin } from "@/lib/auth";
import { sendWelcomeEmail, type NotifyResult } from "@/lib/mailer";

// Cap how long the welcome send may hold the request, so a slow/hung Resend can
// never block the post-signup redirect (the account already exists by then).
const WELCOME_SEND_TIMEOUT_MS = 4000;

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

/**
 * Send the welcome email to the currently signed-in user. Called after a
 * successful signup (register page, auto-confirm path) and from the auth
 * callback (email-confirmation path) — whichever runs first wins.
 *
 * Reads the recipient from the authenticated session (never from client input),
 * so it can only ever email the signed-in user's own address — it can't be
 * aimed at an arbitrary recipient. Idempotent: an atomic claim on
 * profiles.welcomed_at means it sends at most once per user, so repeated calls
 * (or a malicious loop) can't duplicate the email or burn the Resend quota.
 * Best-effort: bounded by a timeout and never throws into the UI.
 */
export async function welcomeNewUser() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return;

    // Atomically claim the one-time send: only the first call flips welcomed_at
    // from null, so it can't be looped or double-sent. Uses the service-role
    // client because welcomed_at isn't a client-writable column.
    const admin = createSupabaseAdminClient();
    const claim = await admin
      .from("profiles")
      .update({ welcomed_at: new Date().toISOString() })
      .eq("id", user.id)
      .is("welcomed_at", null)
      .select("name")
      .maybeSingle();

    let name: string | null | undefined;
    if (claim.error) {
      // Most likely the welcomed_at column isn't migrated yet (0002). Degrade to
      // a best-effort single send rather than dropping the welcome entirely.
      console.warn("[welcome] dedup claim failed (run migration 0002?):", claim.error.message);
      const { data } = await supabase.from("profiles").select("name").eq("id", user.id).single();
      name = data?.name;
    } else {
      if (!claim.data) return; // already welcomed → skip
      name = claim.data.name;
    }

    const timeout = new Promise<NotifyResult>((resolve) =>
      setTimeout(() => resolve({ ok: false, skipped: true, error: "timeout" }), WELCOME_SEND_TIMEOUT_MS),
    );
    const res = await Promise.race([sendWelcomeEmail(user.email, name ?? undefined), timeout]);
    if (!res.ok && !res.skipped) console.error("[welcome] send failed:", res.error);
  } catch {
    /* ignore — welcome email is best-effort, must not block signup */
  }
}
