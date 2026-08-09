import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncSuperAdmin } from "@/lib/auth";
import { welcomeNewUser } from "@/app/auth/actions";
import { postVerifyPath, safeInternalPath } from "@/lib/landing";
import { getMemberAccess } from "@/lib/subscription";

/**
 * Landing endpoint for email links (verification + password reset). Supabase
 * sends the user here with a `code`; we exchange it for a session, run the
 * super-admin bootstrap, then redirect to a validated internal path.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // No `next` means a plain sign-up confirmation: a new free account is sent to
  // /pricing to pay, rather than dead-ending on /account. The password-reset
  // link always carries next=/reset-password, so it is unaffected.
  const next = safeInternalPath(searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Bootstrap an env-allowlisted email to super_admin (idempotent). Never
      // let this block sign-in.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        try {
          await syncSuperAdmin(user.id, user.email);
        } catch {
          /* ignore — bootstrap is best-effort */
        }
        // Welcome email for the email-confirmation path. Idempotent via the
        // welcomed_at claim, so it won't duplicate the auto-confirm send.
        await welcomeNewUser();
      }
      if (next) return NextResponse.redirect(`${origin}${next}`);
      const access = await getMemberAccess();
      const dest = postVerifyPath({
        isStaff: access.reason === "staff",
        isMember: access.isMember,
      });
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=verify`);
}
