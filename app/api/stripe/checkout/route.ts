import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  automaticTaxEnabled,
  getStripe,
  priceIdFor,
  promoCodesEnabled,
  siteUrl,
  stripeConfigured,
} from "@/lib/stripe";
import { TRIAL_DAYS, planById } from "@/lib/plans";
import type { SubscriptionPlan } from "@/lib/subscription.types";

export const dynamic = "force-dynamic";

/**
 * Creates a Stripe Checkout session for the signed-in user and returns its
 * URL for the browser to redirect to.
 *
 * Notes on the deliberate choices here:
 *   - The customer id is reused when one exists, so someone who cancels and
 *     re-subscribes keeps a single Stripe customer (one billing history, no
 *     duplicate records).
 *   - We never trust a plan/price from the client beyond its id: the actual
 *     price comes from server env, so a tampered request can't buy at a
 *     price we didn't set.
 *   - The auto-renewal consent wording the customer ticked is stored on the
 *     subscription metadata — that record is the point of the checkbox.
 *   - Access itself is granted by the webhook, never here. A created session
 *     is not a payment.
 */
export async function POST(request: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Checkout isn't switched on yet. Please try again shortly." },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }

  let body: { plan?: string; consent?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const plan = planById(String(body.plan ?? ""));
  if (!plan) {
    return NextResponse.json({ error: "Pick a plan to continue." }, { status: 400 });
  }
  const price = priceIdFor(plan.id as SubscriptionPlan);
  if (!price) {
    return NextResponse.json(
      { error: "Checkout isn't switched on yet. Please try again shortly." },
      { status: 503 },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email, name, stripe_customer_id, subscription_status")
    .eq("id", user.id)
    .single<{
      email: string | null;
      name: string | null;
      stripe_customer_id: string | null;
      subscription_status: string | null;
    }>();

  if (profile?.subscription_status === "active" || profile?.subscription_status === "trialing") {
    return NextResponse.json(
      { error: "You already have an active membership." },
      { status: 409 },
    );
  }

  const stripe = getStripe();

  let customerId = profile?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email ?? undefined,
      name: profile?.name ?? undefined,
      // Lets us find the Supabase user from any Stripe object, including
      // events that don't carry our client_reference_id.
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    // Persist immediately: if the visitor abandons checkout and comes back,
    // we reuse this customer instead of creating a second one.
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: {
        supabase_user_id: user.id,
        plan: plan.id,
        // Auto-renewal consent record: exact wording shown, plus when it was
        // accepted. Kept on the subscription so it survives disputes.
        consent_text: (body.consent ?? plan.renewalTerms).slice(0, 480),
        consent_at: new Date().toISOString(),
      },
    },
    metadata: { supabase_user_id: user.id, plan: plan.id },
    allow_promotion_codes: promoCodesEnabled(),
    automatic_tax: { enabled: automaticTaxEnabled() },
    customer_update: automaticTaxEnabled() ? { address: "auto", name: "auto" } : undefined,
    success_url: `${siteUrl()}/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/pricing?canceled=1`,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Couldn't start checkout." }, { status: 502 });
  }
  return NextResponse.json({ url: session.url });
}
