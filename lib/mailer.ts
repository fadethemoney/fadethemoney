import { Resend } from "resend";

export interface NotifyOptions {
  subject: string;
  text: string;
  html?: string;
}

export interface NotifyResult {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * Send an admin alert via Resend.
 *
 * Required env vars:
 *   RESEND_API_KEY  — from https://resend.com/api-keys
 *   ADMIN_EMAIL     — recipient
 *
 * Optional:
 *   ALERT_FROM      — sender (defaults to "Fade The Money <onboarding@resend.dev>",
 *                     which works on free tier without domain verification)
 */
export async function notifyAdmin(opts: NotifyOptions): Promise<NotifyResult> {
  const { RESEND_API_KEY, ADMIN_EMAIL, ALERT_FROM } = process.env;
  if (!RESEND_API_KEY || !ADMIN_EMAIL) {
    console.warn("[mailer] Resend not configured — skipping:", opts.subject);
    return { ok: false, skipped: true, error: "missing RESEND_API_KEY or ADMIN_EMAIL" };
  }

  const resend = new Resend(RESEND_API_KEY);
  const from = ALERT_FROM ?? "Fade The Money <onboarding@resend.dev>";
  const html =
    opts.html ??
    `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:540px">
       <p>${escapeHtml(opts.text).replace(/\n/g, "<br>")}</p>
       <hr style="border:0;border-top:1px solid #ddd;margin:24px 0">
       <p style="font-size:12px;color:#888">
         You're getting this because a Public/Vegas betting trend streak hit a notify threshold.
         Spreads use favorite = Public, dog = Vegas. Totals use Over = Public, Under = Vegas.
         Reply STOP to unsubscribe (admin alert — automated).
       </p>
     </div>`;

  try {
    const res = await resend.emails.send({
      from,
      to: ADMIN_EMAIL,
      subject: opts.subject,
      text: opts.text,
      html,
    });
    if (res.error) {
      console.error("[mailer] Resend error:", res.error);
      return { ok: false, error: JSON.stringify(res.error) };
    }
    console.log("[mailer] sent:", res.data?.id, "→", ADMIN_EMAIL);
    return { ok: true, id: res.data?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[mailer] exception:", msg);
    return { ok: false, error: msg };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" :
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === '"' ? "&quot;" : "&#39;"
  );
}
