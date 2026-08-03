import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/unsub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * One-click unsubscribe from streak alerts.
 *
 * Clearing alert_leagues is what stops the emails — the membership itself is
 * untouched, so someone who unsubscribes keeps the dashboard they paid for.
 * They can switch leagues back on any time from /account.
 *
 * POST exists for RFC 8058 (List-Unsubscribe-Post), which mail clients call
 * without ever showing the page; GET is what a human clicking the link hits.
 */
async function unsubscribe(token: string | null): Promise<boolean> {
  const userId = verifyUnsubscribeToken(token);
  if (!userId) return false;
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ alert_leagues: [] })
    .eq("id", userId);
  if (error) {
    console.error("[unsubscribe] update failed:", error.message);
    return false;
  }
  return true;
}

function page(title: string, body: string, status: number) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Fade The Money</title></head>
<body style="margin:0;background:#0A0A0B;color:#F3F2EE;font-family:-apple-system,Segoe UI,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:64px 24px">
    <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#807F79">Streak alerts</div>
    <h1 style="font-size:26px;margin:10px 0 14px">${title}</h1>
    <p style="font-size:15px;line-height:1.6;color:#AEADA6">${body}</p>
    <a href="/account" style="display:inline-block;margin-top:22px;background:#D2A549;color:#14130D;text-decoration:none;font-weight:500;padding:12px 22px;border-radius:5px">Manage alert preferences</a>
  </div>
</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("u");
  const ok = await unsubscribe(token);
  return ok
    ? page(
        "You're unsubscribed",
        "You won't get any more streak alert emails. Your membership and dashboard access are unchanged — turn leagues back on whenever you like.",
        200,
      )
    : page(
        "That link didn't work",
        "It may have expired or been altered. You can turn streak alerts off directly on your account page.",
        400,
      );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("u");
  if (!token) {
    // Some clients POST the token as a form field instead.
    try {
      const form = await request.formData();
      const field = form.get("u");
      if (typeof field === "string") token = field;
    } catch {
      /* no body — fall through to the failure below */
    }
  }
  const ok = await unsubscribe(token);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
