"use client";

import { useState } from "react";
import Link from "next/link";
import type { SubscriptionPlan, SubscriptionStatus } from "@/lib/subscription.types";

export type MembershipInfo = {
  status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isComp: boolean;
  hasBillingAccount: boolean;
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  none: "Free account",
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed",
  paused: "Paused",
  canceled: "Canceled",
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.max(0, Math.ceil((d - Date.now()) / 86_400_000));
}

/** Plain-English summary of where the subscription stands right now. */
function summary(m: MembershipInfo): string {
  const when = fmtDate(m.currentPeriodEnd);
  if (m.isComp) return "Your account has complimentary full access — no billing attached.";
  switch (m.status) {
    case "trialing": {
      const left = daysUntil(m.currentPeriodEnd);
      const tail = when ? ` First charge on ${when}.` : "";
      return m.cancelAtPeriodEnd
        ? `Trial ends${when ? ` ${when}` : ""} and won't renew.`
        : `${left === null ? "Trial running." : `${left} day${left === 1 ? "" : "s"} left on your trial.`}${tail}`;
    }
    case "active":
      return m.cancelAtPeriodEnd
        ? `Canceled — your access runs until${when ? ` ${when}` : " the end of the paid period"}.`
        : when
          ? `Renews on ${when}.`
          : "Your membership is active.";
    case "past_due":
      return "We couldn't take the last payment. Stripe will retry over the next few days — update your card to avoid losing access.";
    case "paused":
      return "Access is paused after a failed payment. Update your card to pick up right where you left off — you don't need to buy again.";
    case "canceled":
      return "Your membership has ended. You can start again any time.";
    default:
      return "You're on the free view: games, odds and past results.";
  }
}

export function MembershipSection({ membership }: { membership: MembershipInfo }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function openPortal() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Couldn't open the billing portal.");
        setBusy(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Couldn't reach the billing portal. Try again in a moment.");
      setBusy(false);
    }
  }

  const statusClass =
    membership.status === "active" || membership.status === "trialing"
      ? " ok"
      : membership.status === "past_due" || membership.status === "paused"
        ? " warn"
        : "";

  return (
    <section className="account-section">
      <div className="account-section-title">Membership</div>

      <div className="membership-head">
        <span className={`membership-pill${statusClass}`}>
          {membership.isComp ? "Comped" : STATUS_LABEL[membership.status]}
        </span>
        {membership.plan && !membership.isComp && (
          <span className="membership-plan">
            {membership.plan === "annual" ? "Annual plan" : "Monthly plan"}
          </span>
        )}
      </div>

      <p className="membership-summary">{summary(membership)}</p>

      {error && <p className="pricing-error">{error}</p>}

      <div className="account-actions">
        {membership.hasBillingAccount ? (
          <button className="account-btn" type="button" onClick={openPortal} disabled={busy}>
            {busy ? "Opening…" : "Manage subscription"}
          </button>
        ) : (
          <Link className="account-btn" href="/pricing">
            Become a member
          </Link>
        )}
      </div>

      {membership.hasBillingAccount && (
        <p className="membership-note">
          Cancel, change your card, switch between monthly and annual, or download
          invoices — all in the secure Stripe portal.
        </p>
      )}
    </section>
  );
}
