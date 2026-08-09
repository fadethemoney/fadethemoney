"use client";

import { useState } from "react";
import type { SubscriptionStatus } from "@/lib/subscription.types";

/**
 * Site-wide warning while a payment is failing.
 *
 * Without this, the only place a member learns their card died is the account
 * page — somewhere nobody visits until access is already gone. The whole point
 * of the past_due grace window is that it gives them a few days to fix it, and
 * a window nobody is told about is worth nothing.
 *
 * Shown only for past_due and paused. A member who cancelled on purpose is not
 * nagged, and neither is anyone whose billing is healthy.
 */

const COPY: Partial<Record<SubscriptionStatus, { lead: string; body: string; cta: string }>> = {
  past_due: {
    lead: "Payment failed",
    body: "We couldn't take your last payment. Update your card to keep your picks — you still have access while we retry.",
    cta: "Update card",
  },
  paused: {
    lead: "Access paused",
    body: "Your picks are locked because the last payment didn't go through. Update your card to pick up right where you left off.",
    cta: "Update card",
  },
};

export function BillingAlert({ status }: { status: SubscriptionStatus }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const copy = COPY[status];
  if (!copy) return null;

  async function openPortal() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Couldn't open billing. Try again in a moment.");
        setBusy(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Couldn't reach billing. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="billing-alert" role="status">
      <div className="container billing-alert-inner">
        <span className="billing-alert-tag">{copy.lead}</span>
        <span className="billing-alert-text">{error ?? copy.body}</span>
        <button type="button" className="billing-alert-btn" onClick={openPortal} disabled={busy}>
          {busy ? "Opening…" : copy.cta}
        </button>
      </div>
    </div>
  );
}
