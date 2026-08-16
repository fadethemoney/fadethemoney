"use server";

import { getProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendTipEmail } from "@/lib/mailer";

/**
 * Email an active pick to every entitled member.
 *
 * Runs server-side with the service-role client. The send is guarded two ways:
 *  - role re-check here (UI hiding the button is only UX), and
 *  - an ATOMIC one-time claim on notifications.emailed_at so a tip can never be
 *    blasted twice, even on a double click or repeated activate/draft toggles.
 * Degrades to a best-effort single send if migration 0003 (emailed_at) hasn't
 * been applied yet, so it never hard-fails on a half-migrated project.
 *
 * WHO GETS IT — client instruction 2026-08-16: "only 2 weeks trials and
 * members". Picks are the paid product, so a free sign-up must never receive
 * one by email; that would hand away the thing the paywall is selling. The
 * entitlement test below mirrors lib/subscription.ts and lib/alert-recipients.ts
 * exactly, so all three surfaces agree on who counts as a member.
 */

/** Statuses that still count as a member — same grace rule as the paywall. */
const PAID_STATUSES = ["trialing", "active", "past_due"];

type EmailResult =
  | { ok: true; sent: number; failed: number; recipients: number }
  | { ok: false; error: string };

async function requireAdminProfile(): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (me.role !== "admin" && me.role !== "super_admin") {
    return { ok: false, error: "Only an admin can do that." };
  }
  return { ok: true };
}

export async function emailTip(tipId: string): Promise<EmailResult> {
  const guard = await requireAdminProfile();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createSupabaseAdminClient();

  // Load the tip. NOTE: don't select emailed_at here — that column may not exist
  // yet on a project that hasn't run migration 0003; the atomic claim below
  // handles that case on its own.
  const { data: tip, error: tipErr } = await admin
    .from("notifications")
    .select("id, title, team_pick, message, status")
    .eq("id", tipId)
    .single();
  if (tipErr || !tip) return { ok: false, error: "Tip not found." };
  if (tip.status !== "active") {
    return { ok: false, error: "Activate the tip before emailing subscribers." };
  }

  // Atomically claim the one-time send: only the first caller flips emailed_at
  // from null. If the column is missing (pre-0003) we proceed best-effort.
  let weOwnClaim = false;
  const claim = await admin
    .from("notifications")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", tipId)
    .is("emailed_at", null)
    .select("id")
    .maybeSingle();
  if (claim.error) {
    console.warn("[emailTip] claim failed (run migration 0003?):", claim.error.message);
  } else if (!claim.data) {
    return { ok: false, error: "This tip has already been emailed to subscribers." };
  } else {
    weOwnClaim = true;
  }

  // Release the claim so the admin can retry — only safe when we actually set it.
  const release = async () => {
    if (weOwnClaim) {
      await admin.from("notifications").update({ emailed_at: null }).eq("id", tipId);
    }
  };

  // Recipients: opted-in profiles that are actually entitled — someone in the
  // free trial, a paying member (incl. the past_due grace window), a comped
  // account, or staff. Free sign-ups are deliberately excluded.
  const { data: subs, error: subsErr } = await admin
    .from("profiles")
    .select("email, is_comp, role, subscription_status")
    .eq("email_opt_in", true);
  if (subsErr) {
    // Most likely migration 0006 hasn't been run, so the subscription columns
    // are missing. Fail CLOSED: sending to everyone would leak the paid picks
    // to free accounts, which is exactly what this filter exists to prevent.
    await release();
    console.error("[emailTip] recipient query failed — has 0006 been run?", subsErr.message);
    return {
      ok: false,
      error: "Couldn't work out who is a member, so nothing was sent. Check the subscription columns exist (migration 0006).",
    };
  }

  const recipients = (subs ?? [])
    .filter(
      (r) =>
        r.is_comp === true ||
        r.role === "admin" ||
        r.role === "super_admin" ||
        PAID_STATUSES.includes(r.subscription_status as string),
    )
    .map((r) => (r.email as string)?.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    await release();
    return { ok: false, error: "No members or trials to email yet." };
  }

  const res = await sendTipEmail(recipients, {
    title: tip.title,
    teamPick: tip.team_pick,
    message: tip.message ?? undefined,
  });

  // Hard failure (nothing delivered) → release so it can be retried.
  if (res.sent === 0) {
    await release();
    return { ok: false, error: res.error ?? "Could not send emails." };
  }
  return { ok: true, sent: res.sent, failed: res.failed, recipients: recipients.length };
}
