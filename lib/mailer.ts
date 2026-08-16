import { Resend } from "resend";
import { getAlertRecipients } from "@/lib/alert-recipients";
import { unsubscribeUrl } from "@/lib/unsub";
import type { League } from "@/lib/types";

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
         Automated system alert from Fade The Money, sent only to the ADMIN_EMAIL
         addresses. No subscriber receives this. To change who is paged, edit
         ADMIN_EMAIL in the Vercel project settings.
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
 * Send a streak alert to every entitled member for a league.
 *
 * Phase 3 replacement for the hardcoded ADMIN_EMAIL blast. Differences that
 * matter:
 *   - recipients come from lib/alert-recipients.ts (paid + comp + staff,
 *     filtered by each member's league choices), never from env alone
 *   - one email per person via Resend's batch API, so nobody sees another
 *     subscriber's address
 *   - every member copy carries a personal one-click unsubscribe link and
 *     the matching List-Unsubscribe headers
 *
 * Returns ok:false when nothing could be delivered, which is what tells the
 * refresh pipeline to keep the milestone in its notify window and retry
 * rather than marking it sent.
 */
export async function sendStreakAlert(opts: {
  league: League;
  subject: string;
  text: string;
}): Promise<NotifyResult & { sent?: number }> {
  const { RESEND_API_KEY, ALERT_FROM, NEXT_PUBLIC_SITE_URL } = process.env;
  if (!RESEND_API_KEY) {
    console.warn("[mailer] Resend not configured — skipping:", opts.subject);
    return { ok: false, skipped: true, error: "missing RESEND_API_KEY" };
  }

  const recipients = await getAlertRecipients(opts.league);
  if (recipients.length === 0) {
    console.warn("[mailer] no recipients for", opts.league, "—", opts.subject);
    return { ok: false, skipped: true, error: "no recipients" };
  }

  const resend = new Resend(RESEND_API_KEY);
  const from = ALERT_FROM ?? "Fade The Money <onboarding@resend.dev>";
  const site = (NEXT_PUBLIC_SITE_URL ?? "https://fadethemoney.com").replace(/\/$/, "");
  const bodyHtml = escapeHtml(opts.text).replace(/\n/g, "<br>");

  const messages = recipients.map((r) => {
    // Owner copies (no profile row) get the account link but no token.
    const unsub = r.userId ? unsubscribeUrl(r.userId, site) : `${site}/account`;
    return {
      from,
      to: r.email,
      subject: opts.subject,
      text: `${opts.text}\n\n—\nManage which leagues alert you: ${site}/account\nUnsubscribe from all streak alerts: ${unsub}`,
      html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:540px">
         <p>${bodyHtml}</p>
         <p><a href="${site}" style="color:#1B45D9">Open the dashboard →</a></p>
         <hr style="border:0;border-top:1px solid #ddd;margin:24px 0">
         <p style="font-size:12px;color:#888;line-height:1.5">
           You're getting this because a betting trend streak hit a notify threshold
           in ${opts.league.toUpperCase()}. Spreads use favorite = Public, dog = Vegas.
           Totals track the side of the total that won (OVER or UNDER) plus which side
           was favored by the juice.<br>
           <a href="${site}/account" style="color:#888">Choose your leagues</a> ·
           <a href="${unsub}" style="color:#888">Unsubscribe from all alerts</a><br>
           For entertainment only · 21+. Gambling problem? Call 1-800-GAMBLER.
         </p>
       </div>`,
      headers: r.userId
        ? {
            "List-Unsubscribe": `<${unsub}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined,
    };
  });

  // Resend caps a batch at 100 messages.
  let sent = 0;
  let lastError: string | undefined;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await resend.batch.send(chunk);
      if (res.error) {
        lastError = JSON.stringify(res.error);
        console.error("[mailer] batch error:", res.error);
        continue;
      }
      sent += chunk.length;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error("[mailer] batch exception:", lastError);
    }
  }

  if (sent === 0) return { ok: false, error: lastError ?? "no emails sent" };
  console.log(`[mailer] streak alert sent to ${sent}/${messages.length} (${opts.league})`);
  return { ok: true, sent };
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
    `We track where the public goes wrong: live public-vs-Vegas streaks across the NFL, NBA, WNBA, MLB, NHL and ranked college football & basketball.\n\n` +
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
          public-vs-Vegas streaks across the NFL, NBA, WNBA, MLB, NHL and
          ranked college football &amp; basketball.
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

/**
 * Membership welcome — sent by the Stripe webhook once checkout completes.
 *
 * Deliberately different from sendWelcomeEmail (which greets a new free
 * account): this one confirms what they just bought and points at the two
 * things a new member should do first. Billing receipts are Stripe's job,
 * so there are no amounts or invoice details here.
 */
export async function sendMembershipWelcomeEmail(
  to: string,
  name?: string | null,
): Promise<NotifyResult> {
  const { RESEND_API_KEY, WELCOME_FROM, NEXT_PUBLIC_SITE_URL } = process.env;
  const recipient = (to ?? "").trim();
  if (!RESEND_API_KEY) {
    console.warn("[mailer] Resend not configured — skipping membership welcome");
    return { ok: false, skipped: true, error: "missing RESEND_API_KEY" };
  }
  if (!recipient) return { ok: false, skipped: true, error: "no recipient" };

  const resend = new Resend(RESEND_API_KEY);
  const from = WELCOME_FROM ?? "Fade The Money <noreply@fadethemoney.com>";
  const site = (NEXT_PUBLIC_SITE_URL ?? "https://fadethemoney.com").replace(/\/$/, "");
  const first = (name ?? "").trim().split(/\s+/)[0] || "there";

  const subject = "Your Fade The Money membership is live";
  const text =
    `Hi ${first},\n\n` +
    `Your membership is active — every pick is unlocked.\n\n` +
    `What you now have:\n` +
    `• Spread, total and moneyline picks across all 7 leagues\n` +
    `• Live favorite-vs-underdog streaks as they form\n` +
    `• Streak alert emails for the leagues you choose\n\n` +
    `Dashboard: ${site}\n` +
    `Choose your alert leagues or manage billing: ${site}/account\n\n` +
    `For entertainment only · 21+. If you or someone you know has a gambling problem, call 1-800-GAMBLER.`;

  const safeFirst = escapeHtml(first);
  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;background:#FAFAF7;padding:24px;margin:0">
    <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E3DC;border-radius:12px;overflow:hidden">
      <div style="background:#1B45D9;padding:18px 24px">
        <span style="color:#FFFFFF;font-size:18px;font-weight:600;letter-spacing:-0.02em">Fade The Money</span>
      </div>
      <div style="padding:24px">
        <h1 style="font-size:20px;color:#1A1A1A;margin:0 0 12px">You're in, ${safeFirst}</h1>
        <p style="font-size:15px;line-height:1.55;color:#3A3A38;margin:0 0 16px">
          Your membership is active and every pick is unlocked:
        </p>
        <ul style="font-size:15px;line-height:1.6;color:#3A3A38;margin:0 0 20px;padding-left:20px">
          <li>Spread, total and moneyline picks across all 7 leagues</li>
          <li>Live favorite-vs-underdog streaks as they form</li>
          <li>Streak alert emails for the leagues you choose</li>
        </ul>
        <a href="${site}" style="display:inline-block;background:#1B45D9;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:15px;padding:11px 20px;border-radius:6px">
          Open the dashboard →
        </a>
        <p style="font-size:13px;line-height:1.55;color:#66655F;margin:18px 0 0">
          Pick your alert leagues or manage billing on your
          <a href="${site}/account" style="color:#1B45D9">account page</a>.
        </p>
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
      console.error("[mailer] membership welcome error:", res.error);
      return { ok: false, error: JSON.stringify(res.error) };
    }
    console.log("[mailer] membership welcome sent:", res.data?.id, "→", recipient);
    return { ok: true, id: res.data?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[mailer] membership welcome exception:", msg);
    return { ok: false, error: msg };
  }
}

export interface TipEmailContent {
  title: string;
  teamPick: string;
  message?: string;
  /** Public image URL (Vercel Blob) shown as a banner at the top of the email. */
  imageUrl?: string;
}

export interface TipBlastResult {
  ok: boolean;
  sent: number;
  failed: number;
  skipped?: boolean;
  error?: string;
}

const BATCH_SIZE = 100; // Resend's per-call cap for batch sends.

/**
 * Email an active tip to a list of opted-in subscribers via Resend.
 *
 * One message per recipient (never a shared To/CC), so addresses never leak
 * between users. Sends are chunked through Resend's batch API. Uses the verified
 * fadethemoney.com sender because these go to arbitrary users (the
 * onboarding@resend.dev default only delivers to your own inbox).
 *
 * Pure send helper: it does NOT decide who gets the email or guard against
 * double-sends — the calling server action owns the recipient query and the
 * one-time claim. Best-effort and never throws.
 */
export async function sendTipEmail(
  recipients: string[],
  tip: TipEmailContent,
): Promise<TipBlastResult> {
  const { RESEND_API_KEY, TIP_FROM, WELCOME_FROM, NEXT_PUBLIC_SITE_URL } = process.env;
  if (!RESEND_API_KEY) {
    console.warn("[mailer] Resend not configured — skipping tip email");
    return { ok: false, sent: 0, failed: 0, skipped: true, error: "missing RESEND_API_KEY" };
  }
  const to = recipients.map((e) => (e ?? "").trim()).filter(Boolean);
  if (to.length === 0) return { ok: true, sent: 0, failed: 0, skipped: true, error: "no recipients" };

  const resend = new Resend(RESEND_API_KEY);
  const from = TIP_FROM ?? WELCOME_FROM ?? "Fade The Money <noreply@fadethemoney.com>";
  const site = (NEXT_PUBLIC_SITE_URL ?? "https://fadethemoney.com").replace(/\/$/, "");

  const subject = `New pick: ${tip.title}`;
  const safeTitle = escapeHtml(tip.title);
  const safePick = escapeHtml(tip.teamPick);
  const safeMessage = tip.message ? escapeHtml(tip.message).replace(/\n/g, "<br>") : "";
  const image = safeImageUrl(tip.imageUrl);
  const text =
    `${tip.title}\n\n` +
    `Pick: ${tip.teamPick}\n` +
    (tip.message ? `\n${tip.message}\n` : "") +
    `\nOpen your dashboard: ${site}\n\n` +
    `For entertainment only · 21+. If you or someone you know has a gambling problem, call 1-800-GAMBLER.`;

  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;background:#FAFAF7;padding:24px;margin:0">
    <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E3DC;border-radius:12px;overflow:hidden">
      <div style="background:#1B45D9;padding:18px 24px">
        <span style="color:#FFFFFF;font-size:18px;font-weight:600;letter-spacing:-0.02em">Fade The Money</span>
      </div>
      ${image ? `<img src="${image}" alt="${safeTitle}" width="518" style="display:block;width:100%;max-width:518px;height:auto;border:0;border-bottom:1px solid #E5E3DC">` : ""}
      <div style="padding:24px">
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.08em;color:#1B45D9;text-transform:uppercase;margin:0 0 6px">New pick</div>
        <h1 style="font-size:20px;color:#1A1A1A;margin:0 0 8px">${safeTitle}</h1>
        <p style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#1B45D9;margin:0 0 16px">${safePick}</p>
        ${safeMessage ? `<p style="font-size:15px;line-height:1.55;color:#3A3A38;margin:0 0 16px">${safeMessage}</p>` : ""}
        <a href="${site}" style="display:inline-block;background:#1B45D9;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:15px;padding:11px 20px;border-radius:6px">
          See it on your dashboard →
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

  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;

  for (let i = 0; i < to.length; i += BATCH_SIZE) {
    const chunk = to.slice(i, i + BATCH_SIZE);
    try {
      const res = await resend.batch.send(
        chunk.map((recipient) => ({ from, to: recipient, subject, text, html })),
      );
      if (res.error) {
        failed += chunk.length;
        lastError = JSON.stringify(res.error);
        console.error("[mailer] tip batch error:", res.error);
      } else {
        sent += chunk.length;
      }
    } catch (e) {
      failed += chunk.length;
      lastError = e instanceof Error ? e.message : String(e);
      console.error("[mailer] tip batch exception:", lastError);
    }
  }

  console.log(`[mailer] tip "${tip.title}" → sent ${sent}, failed ${failed}`);
  return { ok: failed === 0 && sent > 0, sent, failed, error: lastError };
}

/**
 * Only allow a plain https URL into an email `src` attribute. Guards the raw
 * interpolation (no quotes/angle brackets can break out of the tag) and matches
 * what mail clients will actually render — http images are blocked by most of
 * them anyway. Anything else is dropped and the email sends without a picture.
 */
function safeImageUrl(url?: string): string | undefined {
  const u = (url ?? "").trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : undefined;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" :
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === '"' ? "&quot;" : "&#39;"
  );
}
