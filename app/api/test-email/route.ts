import { NextResponse } from "next/server";
import { notifyAdmin } from "@/lib/mailer";

export const dynamic = "force-dynamic";

function authorize(req: Request): NextResponse | null {
  const token = process.env.REFRESH_TOKEN;
  if (!token) return null;
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${token}`) return null;
  const url = new URL(req.url);
  if (url.searchParams.get("token") === token) return null;
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;

  const hasKey = !!process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_EMAIL ?? null;

  const res = await notifyAdmin({
    subject: "Fade The Money — test email",
    text:
      "This is a test alert from /api/test-email.\n\n" +
      "If you're reading this, Resend + ADMIN_EMAIL are wired up correctly.",
  });

  return NextResponse.json({
    ok: res.ok,
    sentTo: to,
    resendConfigured: hasKey,
    result: res,
  });
}
