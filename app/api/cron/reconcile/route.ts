import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapStripeStatus, syncSubscription } from "@/lib/stripe-sync";
import { requireCronAuth } from "@/lib/cron-auth";
import { notifyAdmin } from "@/lib/mailer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Nightly Stripe → Supabase reconciliation.
 *
 * Webhooks are reliable but not guaranteed: a delivery can fail every retry
 * during an outage, an endpoint secret can be rotated badly, or a
 * subscription can be edited in the Stripe dashboard while we're deployed.
 * This job re-reads Stripe as the source of truth and repairs any drift, in
 * both directions:
 *
 *   1. every Stripe subscription is re-synced onto its profile
 *   2. any profile still claiming access that Stripe has no live
 *      subscription for is closed out
 *
 * Comp and staff accounts are skipped in step 2 — their access never came
 * from Stripe in the first place.
 */
const ENTITLED = ["trialing", "active", "past_due"];

export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  if (!stripeConfigured()) {
    return NextResponse.json({ ok: false, error: "stripe not configured" }, { status: 503 });
  }

  const stripe = getStripe();
  const admin = createSupabaseAdminClient();

  let scanned = 0;
  let resynced = 0;
  const problems: string[] = [];
  // Customers Stripe says are currently entitled — the yardstick for step 2.
  const entitledCustomers = new Set<string>();

  for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100 })) {
    scanned++;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (customerId && ENTITLED.includes(mapStripeStatus(sub.status))) {
      entitledCustomers.add(customerId);
    }
    const result = await syncSubscription(sub as Stripe.Subscription);
    if (result.ok) resynced++;
    else problems.push(`${sub.id}: ${result.reason}`);
  }

  // Step 2 — profiles claiming access Stripe can't back up.
  const { data: claiming, error } = await admin
    .from("profiles")
    .select("id, email, stripe_customer_id, subscription_status, is_comp, role")
    .in("subscription_status", ENTITLED);

  let revoked = 0;
  if (error) {
    problems.push(`profile scan failed: ${error.message}`);
  } else {
    for (const row of claiming ?? []) {
      if (row.is_comp || row.role === "admin" || row.role === "super_admin") continue;
      const customerId = row.stripe_customer_id as string | null;
      if (customerId && entitledCustomers.has(customerId)) continue;

      const { error: fixError } = await admin
        .from("profiles")
        .update({
          subscription_status: "canceled",
          cancel_at_period_end: false,
          current_period_end: null,
        })
        .eq("id", row.id);
      if (fixError) {
        problems.push(`could not close out ${row.email}: ${fixError.message}`);
        continue;
      }
      revoked++;
      console.warn(`[reconcile] closed out ${row.email} — no live Stripe subscription`);
    }
  }

  // Only shout when something was actually wrong; a clean night stays quiet.
  if (revoked > 0 || problems.length > 0) {
    try {
      await notifyAdmin({
        subject: `[Fade The Money] Subscription reconcile fixed ${revoked} account(s)`,
        text:
          `Nightly Stripe reconcile:\n\n` +
          `• Stripe subscriptions scanned: ${scanned}\n` +
          `• Profiles re-synced: ${resynced}\n` +
          `• Access closed out (no live Stripe subscription): ${revoked}\n` +
          (problems.length ? `\nProblems:\n${problems.map((p) => `• ${p}`).join("\n")}` : ""),
      });
    } catch (e) {
      console.warn("[reconcile] admin notify failed:", (e as Error).message);
    }
  }

  return NextResponse.json({ ok: true, scanned, resynced, revoked, problems });
}
