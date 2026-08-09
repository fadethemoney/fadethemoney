"use client";

import { useState } from "react";
import { PLANS, TRIAL_DAYS, planById } from "@/lib/plans";
import type { SubscriptionPlan } from "@/lib/subscription.types";

/**
 * Plan picker + checkout hand-off.
 *
 * The auto-renewal consent checkbox is a legal requirement for subscriptions
 * (US state auto-renewal laws): the customer must actively agree to a
 * recurring charge, with the amount and cadence stated next to the control.
 * Consent is required before the button enables, and the exact wording is
 * recorded with the Checkout session.
 */
export function PricingPlans({
  signedIn,
  initialPlan = "monthly",
}: {
  signedIn: boolean;
  initialPlan?: SubscriptionPlan;
}) {
  const [plan, setPlan] = useState<SubscriptionPlan>(initialPlan);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const selected = planById(plan)!;

  async function startCheckout() {
    if (!consent || busy) return;
    if (!signedIn) {
      // Create the account first, then come straight back here with the plan
      // they already chose still selected — re-picking it after a round trip
      // through the inbox is friction on the one screen that can't afford any.
      window.location.assign(`/register?next=${encodeURIComponent(`/pricing?plan=${plan}`)}`);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, consent: selected.renewalTerms }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Checkout is unavailable right now. Please try again.");
        setBusy(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Couldn't reach checkout. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="plan-grid">
        {PLANS.map((p) => {
          const active = p.id === plan;
          return (
            <button
              key={p.id}
              type="button"
              className={`plan-card${active ? " active" : ""}`}
              aria-pressed={active}
              onClick={() => setPlan(p.id)}
            >
              <span className="plan-name">{p.name}</span>
              <span className="plan-price">{p.price}</span>
              <span className="plan-cadence">{p.cadence}</span>
              {p.note && <span className="plan-note">{p.note}</span>}
            </button>
          );
        })}
      </div>

      <label className="consent-row">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          I agree to a recurring subscription. {selected.renewalTerms} I can cancel
          anytime from my account page.
        </span>
      </label>

      {error && <p className="pricing-error">{error}</p>}

      <button
        type="button"
        className="btn-primary btn-join pricing-cta"
        disabled={!consent || busy}
        onClick={startCheckout}
      >
        {busy ? "Opening secure checkout…" : `Start ${TRIAL_DAYS}-day trial`}
      </button>

      <p className="pricing-fineprint">
        Payments are handled by Stripe — card details never touch our servers.
        Apple Pay and Google Pay supported.
      </p>
    </>
  );
}
