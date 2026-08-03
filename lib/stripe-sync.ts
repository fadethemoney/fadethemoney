import "server-only";
import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PLANS } from "@/lib/plans";
import type { SubscriptionPlan, SubscriptionStatus } from "@/lib/subscription.types";

/**
 * Phase 3 — Stripe → Supabase state sync.
 *
 * Stripe is the source of truth for billing; `profiles` holds a cached copy so
 * the dashboard can gate a page render without an API round-trip. Both the
 * webhook and the nightly reconcile job funnel through `syncSubscription`, so
 * there is exactly one mapping from Stripe's world to ours.
 */

/**
 * Stripe status → our status.
 *
 *   unpaid   → paused: Stripe has exhausted smart retries, so the grace
 *              window is over and access stops. The subscription still
 *              exists, which is what lets a member fix their card and pick
 *              up where they left off instead of re-subscribing.
 *   incomplete(_expired) → none: checkout never completed; no access, and
 *              nothing to show on the account page.
 */
export function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "unpaid":
    case "paused":
      return "paused";
    case "canceled":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
      return "none";
    default:
      return "none";
  }
}

/** Which of our plans a subscription's price maps to, if any. */
export function planFromSubscription(sub: Stripe.Subscription): SubscriptionPlan | null {
  const priceId = sub.items.data[0]?.price?.id;
  if (!priceId) return null;
  for (const plan of PLANS) {
    if (process.env[plan.priceEnv] === priceId) return plan.id;
  }
  // Metadata fallback: covers a price rotated in Stripe before the env var
  // caught up, and anything created by hand in the dashboard.
  const meta = sub.metadata?.plan;
  return meta === "monthly" || meta === "annual" ? meta : null;
}

/**
 * End of the paid period. Stripe moved this onto subscription items, so read
 * it there and take the latest across items (we only sell one item, but this
 * stays correct if that ever changes).
 */
export function periodEndOf(sub: Stripe.Subscription): string | null {
  const ends = sub.items.data
    .map((i) => i.current_period_end)
    .filter((n): n is number => typeof n === "number");
  if (!ends.length) return null;
  return new Date(Math.max(...ends) * 1000).toISOString();
}

function customerIdOf(sub: Stripe.Subscription): string | null {
  const c = sub.customer;
  return typeof c === "string" ? c : c?.id ?? null;
}

/**
 * Write a subscription's state onto the owning profile.
 *
 * The row is found by supabase_user_id metadata first (set at checkout), then
 * by stripe_customer_id — a subscription created by hand in the Stripe
 * dashboard has no metadata, and we still want it to grant access.
 *
 * Returns what happened so callers can log/alert; a missing profile is not
 * thrown, because a webhook retry storm over one orphan row helps nobody.
 */
export async function syncSubscription(
  sub: Stripe.Subscription,
): Promise<{ ok: boolean; userId?: string; reason?: string }> {
  const admin = createSupabaseAdminClient();
  const customerId = customerIdOf(sub);
  const userId = sub.metadata?.supabase_user_id ?? null;

  const patch = {
    subscription_status: mapStripeStatus(sub.status),
    subscription_plan: planFromSubscription(sub),
    current_period_end: periodEndOf(sub),
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    ...(customerId ? { stripe_customer_id: customerId } : {}),
  };

  if (userId) {
    const { error } = await admin.from("profiles").update(patch).eq("id", userId);
    if (error) return { ok: false, reason: error.message };
    return { ok: true, userId };
  }

  if (!customerId) return { ok: false, reason: "no user id and no customer id on subscription" };

  const { data, error } = await admin
    .from("profiles")
    .update(patch)
    .eq("stripe_customer_id", customerId)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error) return { ok: false, reason: error.message };
  if (!data) return { ok: false, reason: `no profile for customer ${customerId}` };
  return { ok: true, userId: data.id };
}

/**
 * Cut access immediately, ignoring any paid-through date. Used for
 * chargebacks: the money is gone, so the product goes with it.
 */
export async function revokeAccessForCustomer(
  customerId: string,
): Promise<{ ok: boolean; userId?: string; reason?: string }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({
      subscription_status: "canceled" satisfies SubscriptionStatus,
      cancel_at_period_end: false,
      current_period_end: null,
    })
    .eq("stripe_customer_id", customerId)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error) return { ok: false, reason: error.message };
  if (!data) return { ok: false, reason: `no profile for customer ${customerId}` };
  return { ok: true, userId: data.id };
}
