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
 *   ADMIN_EMAIL     — recipient(s); comma-separated for multiple
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
  const recipients = ADMIN_EMAIL.split(",").map((e) => e.trim()).filter(Boolean);
  const html =
    opts.html ??
    `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:540px">
       <p>${escapeHtml(opts.text).replace(/\n/g, "<br>")}</p>
       <hr style="border:0;border-top:1px solid #ddd;margin:24px 0">
       <p style="font-size:12px;color:#888">
         You're getting this because a betting trend streak hit a notify threshold.
         Spreads use favorite = Public, dog = Vegas. Totals track the side of the
         total that won (OVER or UNDER) plus which side was favored by the juice.
         Reply STOP to unsubscribe (admin alert — automated).
       </p>
     </div>`;

  try {
    const res = await resend.emails.send({
      from,
      to: recipients,
      subject: opts.subject,
      text: opts.text,
      html,
    });
    if (res.error) {
      console.error("[mailer] Resend error:", res.error);
      return { ok: false, error: JSON.stringify(res.error) };
    }
    console.log("[mailer] sent:", res.data?.id, "→", recipients.join(", "));
    return { ok: true, id: res.data?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[mailer] exception:", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Send a branded welcome email to a newly registered user via Resend.
 *
 * Required env:
 *   RESEND_API_KEY — from https://resend.com/api-keys
 * Optional env:
 *   WELCOME_FROM     — sender; MUST be on a Resend-verified domain because this
 *                      goes to arbitrary new users (Resend's onboarding@resend.dev
 *                      only delivers to your own inbox). Defaults to the verified
 *                      fadethemoney.com sender.
 *   NEXT_PUBLIC_SITE_URL — base URL for the dashboard link.
 */
export async function sendWelcomeEmail(to: string, name?: string): Promise<NotifyResult> {
  const { RESEND_API_KEY, WELCOME_FROM, NEXT_PUBLIC_SITE_URL } = process.env;
  const recipient = (to ?? "").trim();
  if (!RESEND_API_KEY) {
    console.warn("[mailer] Resend not configured — skipping welcome email");
    return { ok: false, skipped: true, error: "missing RESEND_API_KEY" };
  }
  if (!recipient) return { ok: false, skipped: true, error: "no recipient" };

  const resend = new Resend(RESEND_API_KEY);
  const from = WELCOME_FROM ?? "Fade The Money <noreply@fadethemoney.com>";
  const site = (NEXT_PUBLIC_SITE_URL ?? "https://fadethemoney.com").replace(/\/$/, "");
  const first = (name ?? "").trim().split(/\s+/)[0] || "there";

  const subject = "Welcome to Fade The Money";
  const text =
    `Hi ${first},\n\n` +
    `Welcome to Fade The Money — you're in.\n\n` +
    `We track where the public goes wrong: live public-vs-Vegas streaks across the NFL, NBA, WNBA, MLB and NHL.\n\n` +
    `Open your dashboard: ${site}\n\n` +
    `For entertainment only · 21+. If you or someone you know has a gambling problem, call 1-800-GAMBLER.`;

  const safeFirst = escapeHtml(first);
  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;background:#FAFAF7;padding:24px;margin:0">
    <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E3DC;border-radius:12px;overflow:hidden">
      <div style="background:#1B45D9;padding:18px 24px">
        <span style="color:#FFFFFF;font-size:18px;font-weight:600;letter-spacing:-0.02em">Fade The Money</span>
      </div>
      <div style="padding:24px">
        <h1 style="font-size:20px;color:#1A1A1A;margin:0 0 12px">Welcome, ${safeFirst} 👋</h1>
        <p style="font-size:15px;line-height:1.55;color:#3A3A38;margin:0 0 16px">
          You're in. Fade The Money tracks where the public goes wrong — live
          public-vs-Vegas streaks across the NFL, NBA, WNBA, MLB and NHL.
        </p>
        <a href="${site}" style="display:inline-block;background:#1B45D9;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:15px;padding:11px 20px;border-radius:6px">
          Open your dashboard →
        </a>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #E5E3DC">
        <p style="font-size:12px;color:#888780;margin:0;line-height:1.5">
          For entertainment only · 21+. If you or someone you know has a gambling
          problem, call <strong>1-800-GAMBLER</strong>.
        </p>
      </div>
    </div>
  </div>`;

  try {
    const res = await resend.emails.send({ from, to: recipient, subject, text, html });
    if (res.error) {
      console.error("[mailer] welcome email error:", res.error);
      return { ok: false, error: JSON.stringify(res.error) };
    }
    console.log("[mailer] welcome sent:", res.data?.id, "→", recipient);
    return { ok: true, id: res.data?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[mailer] welcome exception:", msg);
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
