import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncSuperAdmin } from "@/lib/auth";
import { welcomeNewUser } from "@/app/auth/actions";
import { postVerifyPath, safeInternalPath } from "@/lib/landing";
import { getMemberAccess } from "@/lib/subscription";

// The OTP types Supabase puts in the `type` query param of an email link.
type EmailOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

/**
 * Email-link landing endpoint using the `token_hash` + verifyOtp flow.
 *
 * This replaces the PKCE `?code=` exchange (see ./callback) for links that are
 * opened in a different browser/app than the one that started the flow — e.g.
 * a webmail tab, the Gmail app, or an email link-scanner. verifyOtp validates
 * the one-time token directly and does NOT need the PKCE code-verifier cookie,
 * so the link works no matter where it's opened.
 *
 * Supabase's email templates send the user here as:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=...&next=...
 */
/**
 * Where the freshly-verified visitor goes.
 *
 * An explicit `next` wins — that's the /pricing round-trip and the
 * password-reset link. Recovery links are pinned to /reset-password even if
 * the email template drops `next`, so a forgotten password can never be
 * answered with a pricing page. Everyone else gets the role/membership
 * default, which sends a new free account to /pricing to pay.
 */
async function destination(next: string | null, type: EmailOtpType): Promise<string> {
  if (next) return next;
  if (type === "recovery") return "/reset-password";
  const access = await getMemberAccess();
  return postVerifyPath({ isStaff: access.reason === "staff", isMember: access.isMember });
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeInternalPath(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // Same post-verify bootstrap as the code path: elevate an allowlisted
      // super_admin and send the one-time welcome email. Both are best-effort
      // and must never block the redirect.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        try {
          await syncSuperAdmin(user.id, user.email);
        } catch {
          /* ignore — bootstrap is best-effort */
        }
        await welcomeNewUser();
      }
      return NextResponse.redirect(`${origin}${await destination(next, type)}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=verify`);
}
