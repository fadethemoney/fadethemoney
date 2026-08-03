import "server-only";
import Stripe from "stripe";
import { PLANS, type Plan } from "@/lib/plans";
import type { SubscriptionPlan } from "@/lib/subscription.types";

/**
 * Phase 3 — Stripe server client.
 *
 * Keys live in env only: test keys in .env.local, live keys in Vercel and
 * nowhere else. Every entry point checks `stripeConfigured()` first so the
 * app degrades to a clear message instead of a 500 while keys are pending.
 */

let cached: Stripe | null = null;

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!cached) {
    cached = new Stripe(key, {
      // Pinned so a Stripe-side API change can't alter webhook payload shapes
      // under us; bump deliberately after reading the changelog.
      apiVersion: "2026-07-29.dahlia",
      appInfo: { name: "Fade The Money", url: "https://fadethemoney.com" },
    });
  }
  return cached;
}

/** True once both plan prices are wired — used to gate the pricing CTA. */
export function pricesConfigured(): boolean {
  return PLANS.every((p) => !!process.env[p.priceEnv]);
}

/** The Stripe price id for a plan, or null when it isn't configured yet. */
export function priceIdFor(plan: SubscriptionPlan): string | null {
  const found: Plan | undefined = PLANS.find((p) => p.id === plan);
  if (!found) return null;
  return process.env[found.priceEnv] ?? null;
}

/** Whether to show Stripe's promo-code field at checkout (client pending). */
export function promoCodesEnabled(): boolean {
  const v = (process.env.STRIPE_ALLOW_PROMO ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "on";
}

/** Whether to let Stripe Tax calculate sales tax (client pending). */
export function automaticTaxEnabled(): boolean {
  const v = (process.env.STRIPE_AUTOMATIC_TAX ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "on";
}

/** Canonical site origin for Checkout return URLs. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://fadethemoney.com").replace(/\/$/, "");
}
