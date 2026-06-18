import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncSuperAdmin } from "@/lib/auth";
import { welcomeNewUser } from "@/app/auth/actions";

/** Only allow internal, single-slash paths — blocks open-redirect via `next`. */
function safeNext(raw: string | null): string {
  const next = raw ?? "/account";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/account";
  }
  return next;
}

/**
 * Landing endpoint for email links (verification + password reset). Supabase
 * sends the user here with a `code`; we exchange it for a session, run the
 * super-admin bootstrap, then redirect to a validated internal path.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

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
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=verify`);
}
