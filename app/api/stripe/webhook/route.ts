import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revokeAccessForCustomer, syncSubscription } from "@/lib/stripe-sync";
import { sendMembershipWelcomeEmail } from "@/lib/mailer";

export const dynamic = "force-dynamic";
// Signature verification needs the raw body, so nothing may parse it first.
export const runtime = "nodejs";

/**
 * Stripe webhook — the only thing that grants or removes paid access.
 *
 * Ordering and delivery guarantees are Stripe's weak point: events can
 * arrive out of order, more than once, or days late after an outage. So:
 *   - every event id is written to stripe_events first; a duplicate insert
 *     means we already handled it and we exit 200 without touching anything
 *   - handlers re-read state from the event's own object rather than
 *     applying deltas, so a replay is harmless
 *   - anything unexpected still returns 200, because a non-2xx makes Stripe
 *     retry an event we simply don't care about
 */
export async function POST(request: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "stripe not configured" }, { status: 503 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe] STRIPE_WEBHOOK_SECRET missing — rejecting webhook");
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret);
  } catch (err) {
    // Bad signature = not from Stripe (or the wrong endpoint secret).
    console.error("[stripe] signature verification failed:", (err as Error).message);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  // --- idempotency ---------------------------------------------------
  const admin = createSupabaseAdminClient();
  const { error: seenError } = await admin
    .from("stripe_events")
    .insert({ id: event.id, type: event.type });
  if (seenError) {
    // 23505 = unique violation: this delivery is a repeat of one we finished.
    if (seenError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    // Anything else (e.g. table missing) is ours to fix — let Stripe retry.
    console.error("[stripe] could not record event:", seenError.message);
    return NextResponse.json({ error: "event log unavailable" }, { status: 500 });
  }

  try {
    await handleEvent(event, stripe);
  } catch (err) {
    // Drop the ledger row so Stripe's retry gets a real second attempt
    // instead of being swallowed as a duplicate.
    await admin.from("stripe_events").delete().eq("id", event.id);
    console.error(`[stripe] handler failed for ${event.type}:`, (err as Error).message);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event, stripe: Stripe) {
  switch (event.type) {
    // Fires on join, renewal, plan switch, cancel-at-period-end, trial end,
    // failed payment, pause/resume — one handler keeps our copy honest.
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const result = await syncSubscription(sub);
      if (!result.ok) {
        console.error(`[stripe] ${event.type} sync failed: ${result.reason}`);
      }
      return;
    }

    // Checkout finished. The subscription events above do the state work;
    // this is where the customer gets their welcome email, exactly once
    // (the event log above guarantees the "once").
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return;

      // Re-fetch rather than trusting the expanded copy on the session.
      if (typeof session.subscription === "string") {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        const result = await syncSubscription(sub);
        if (!result.ok) {
          console.error(`[stripe] checkout sync failed: ${result.reason}`);
        }
      }

      const email = session.customer_details?.email ?? session.customer_email;
      if (email) {
        const res = await sendMembershipWelcomeEmail(email, session.customer_details?.name);
        if (!res.ok) console.error("[stripe] welcome email failed:", res.error);
      }
      return;
    }

    // A chargeback: the bank has pulled the money back. Access goes with it
    // (client-confirmed policy), and the customer keeps the ability to
    // re-subscribe later through the normal flow.
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      const customerId =
        typeof dispute.charge === "string"
          ? (await stripe.charges.retrieve(dispute.charge)).customer
          : dispute.charge?.customer;
      const id = typeof customerId === "string" ? customerId : customerId?.id;
      if (!id) {
        console.error("[stripe] dispute without a customer — nothing to revoke");
        return;
      }
      const result = await revokeAccessForCustomer(id);
      if (!result.ok) console.error(`[stripe] dispute revoke failed: ${result.reason}`);
      return;
    }

    default:
      // Everything else is Stripe's business (receipts, retries, trial
      // reminders). Acknowledged and ignored on purpose.
      return;
  }
}
