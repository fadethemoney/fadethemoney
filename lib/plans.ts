import type { SubscriptionPlan } from "@/lib/subscription.types";

/**
 * Phase 3 — plan catalogue.
 *
 * One place for every number the customer sees, so a price change is a
 * single edit here plus a new Stripe Price. The `priceEnv` value names the
 * env var holding that plan's Stripe price id (price_…): test ids in
 * .env.local, live ids only in Vercel.
 *
 * Amounts below are the suggested defaults the client has not yet confirmed
 * ($29.99/mo, $299/yr, 7-day trial). Confirmed numbers land here.
 */

export const TRIAL_DAYS = 7;

export type Plan = {
  id: SubscriptionPlan;
  name: string;
  /** Headline price, already formatted. */
  price: string;
  cadence: string;
  /** Shown under the price — value framing, not a legal term. */
  note?: string;
  /** Billing sentence shown next to the consent checkbox. */
  renewalTerms: string;
  priceEnv: "STRIPE_PRICE_MONTHLY" | "STRIPE_PRICE_ANNUAL";
};

export const PLANS: Plan[] = [
  {
    id: "monthly",
    name: "Monthly",
    price: "$29.99",
    cadence: "per month",
    note: `${TRIAL_DAYS}-day free trial`,
    renewalTerms: `After the ${TRIAL_DAYS}-day free trial, $29.99 is charged every month until you cancel.`,
    priceEnv: "STRIPE_PRICE_MONTHLY",
  },
  {
    id: "annual",
    name: "Annual",
    price: "$299",
    cadence: "per year",
    note: "Two months free vs monthly",
    renewalTerms: `After the ${TRIAL_DAYS}-day free trial, $299 is charged every year until you cancel.`,
    priceEnv: "STRIPE_PRICE_ANNUAL",
  },
];

export function planById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
