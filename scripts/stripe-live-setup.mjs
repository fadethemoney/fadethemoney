/**
 * One-shot Stripe setup for a NEW account (live or sandbox).
 *
 * Creates everything the app needs and prints the env block to paste into
 * Vercel: the product, the two prices, the webhook endpoint and the billing
 * portal configuration. Safe to read first — it does nothing without --apply.
 *
 *   node scripts/stripe-live-setup.mjs --key sk_live_...            # dry run
 *   node scripts/stripe-live-setup.mjs --key sk_live_... --apply    # create
 *
 * Rehearse it against the sandbox key first; the only difference is the key.
 *
 * Prices are IMMUTABLE in Stripe. Re-running with --apply after a price change
 * makes NEW prices; it never edits an existing one. Existing objects are reused
 * when they carry the metadata tag below, so a second run is not a duplicate.
 */
import Stripe from "stripe";

const TAG = { app: "fadethemoney" };
const PRODUCT_NAME = "Fade The Money";
// Shown on the customer's card statement. Set on the PRODUCT, not the account,
// so a shared Stripe account keeps its own descriptor for its other business.
const STATEMENT_DESCRIPTOR = "FADETHEMONEY.COM";
const PRICES = [
  { key: "STRIPE_PRICE_MONTHLY", lookup: "ftm_monthly_5000", amount: 5000, interval: "month" },
  { key: "STRIPE_PRICE_ANNUAL", lookup: "ftm_annual_50000", amount: 50000, interval: "year" },
];
const WEBHOOK_URL = "https://fadethemoney.com/api/stripe/webhook";
// Must match the switch in app/api/stripe/webhook/route.ts.
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.dispute.created",
];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const key = args[args.indexOf("--key") + 1] ?? process.env.STRIPE_LIVE_SECRET_KEY;
if (!key || !key.startsWith("sk_")) {
  console.error("Pass a secret key:  --key sk_live_...   (or set STRIPE_LIVE_SECRET_KEY)");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2026-07-29.dahlia" });
const live = key.startsWith("sk_live");
const step = (s) => console.log("\n" + s);
const made = {};

// ---------------------------------------------------------------- account
const acct = await stripe.accounts.retrieve();
const bp = acct.business_profile ?? {};
console.log(`Stripe account : ${acct.id}  ${live ? "*** LIVE ***" : "(test/sandbox)"}`);
console.log(`  name         : ${acct.settings?.dashboard?.display_name ?? "-"}  /  business_profile.name: ${bp.name ?? "-"}`);
console.log(`  descriptor   : ${acct.settings?.payments?.statement_descriptor ?? "-"}`);
console.log(`  industry mcc : ${bp.mcc ?? "-"}`);
console.log(`  website      : ${bp.url ?? "-"}`);
console.log(`  charges/payouts: ${acct.charges_enabled} / ${acct.payouts_enabled}   details_submitted: ${acct.details_submitted}`);
if (live && !acct.charges_enabled) console.log("  !! charges are NOT enabled - activation is incomplete");
if (!apply) console.log("\nDRY RUN - nothing will be created. Re-run with --apply.");

// ---------------------------------------------------------------- product
step("Product");
const found = await stripe.products.search({ query: "metadata['app']:'fadethemoney'", limit: 10 });
let product = found.data.find((p) => p.active);
if (product) {
  console.log(`  reusing ${product.id} (${product.name})`);
} else if (apply) {
  product = await stripe.products
    .create({
      name: PRODUCT_NAME,
      description: "Subscription to sports betting information and analysis.",
      statement_descriptor: STATEMENT_DESCRIPTOR,
      metadata: TAG,
    })
    .catch((err) => {
      // Some accounts reject a product-level descriptor; the account-level one
      // is then what customers see. Worth knowing rather than failing the run.
      console.log(`  ! statement_descriptor rejected (${err.message}) - creating without it`);
      return stripe.products.create({ name: PRODUCT_NAME, metadata: TAG });
    });
  console.log(`  created ${product.id}`);
} else {
  console.log(`  would create "${PRODUCT_NAME}" with descriptor ${STATEMENT_DESCRIPTOR}`);
}

// ---------------------------------------------------------------- prices
step("Prices");
for (const p of PRICES) {
  const existing = product
    ? (await stripe.prices.list({ product: product.id, active: true, limit: 100 })).data.find(
        (x) => x.unit_amount === p.amount && x.recurring?.interval === p.interval,
      )
    : null;
  if (existing) {
    console.log(`  ${p.key} = ${existing.id}  ($${p.amount / 100}/${p.interval}, existing)`);
    made[p.key] = existing.id;
  } else if (apply) {
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: p.amount,
      currency: "usd",
      recurring: { interval: p.interval },
      lookup_key: p.lookup,
      metadata: TAG,
    });
    console.log(`  ${p.key} = ${price.id}  ($${p.amount / 100}/${p.interval}, created)`);
    made[p.key] = price.id;
  } else {
    console.log(`  would create $${p.amount / 100}/${p.interval} -> ${p.key}`);
  }
}

// ---------------------------------------------------------------- webhook
step("Webhook endpoint");
const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
const hook = hooks.data.find((h) => h.url === WEBHOOK_URL && h.status === "enabled");
if (hook) {
  const missing = WEBHOOK_EVENTS.filter((e) => !hook.enabled_events.includes(e));
  console.log(`  exists ${hook.id}${missing.length ? "  MISSING EVENTS: " + missing.join(", ") : "  (all 5 events present)"}`);
  console.log("  its signing secret is only readable in the dashboard -> Reveal");
  if (missing.length && apply) {
    await stripe.webhookEndpoints.update(hook.id, { enabled_events: WEBHOOK_EVENTS });
    console.log("  -> events updated");
  }
} else if (apply) {
  const created = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: WEBHOOK_EVENTS,
    description: "Fade The Money - subscription sync",
    metadata: TAG,
  });
  console.log(`  created ${created.id}`);
  made.STRIPE_WEBHOOK_SECRET = created.secret; // returned ONCE, at creation
} else {
  console.log(`  would create ${WEBHOOK_URL} with ${WEBHOOK_EVENTS.length} events`);
}

// ---------------------------------------------------------------- portal
step("Customer portal");
if (apply && product) {
  const priceIds = Object.entries(made)
    .filter(([k]) => k.startsWith("STRIPE_PRICE_"))
    .map(([, v]) => v);
  const cfg = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Fade The Money - manage your membership" },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      // Without `products`, the portal shows a plan-switch button with nothing
      // to switch to - the gap found on the sandbox config.
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: [{ product: product.id, prices: priceIds }],
      },
    },
    metadata: TAG,
  });
  console.log(`  created ${cfg.id}  (default: ${cfg.is_default})`);
} else {
  console.log("  would create a config with cancel / card / invoices / plan-switch (monthly <-> annual)");
}

// ---------------------------------------------------------------- output
if (apply) {
  step("Paste into Vercel -> Production, then redeploy. All five together:");
  console.log(`STRIPE_SECRET_KEY=${key.slice(0, 12)}...            (the key you passed)`);
  console.log(`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_${live ? "live" : "test"}_...   (from the dashboard)`);
  for (const [k, v] of Object.entries(made)) console.log(`${k}=${v}`);
  if (!made.STRIPE_WEBHOOK_SECRET) {
    console.log("STRIPE_WEBHOOK_SECRET=whsec_...        (endpoint already existed - Reveal it in the dashboard)");
  }
}

step("NOT fixable from here - do these in the dashboard:");
console.log("  1. Payment methods -> turn Google Pay ON (the client plan promises it)");
console.log("  2. Billing -> Manage failed payments -> 'mark subscription unpaid', NOT cancel");
console.log("     (lib/stripe-sync.ts maps unpaid->paused/recoverable, canceled->dead)");
console.log("  3. Branding -> logo + colour, so Checkout and receipts say Fade The Money");
