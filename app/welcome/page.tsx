import Link from "next/link";
import type { Metadata } from "next";
import { getMemberAccess } from "@/lib/subscription";
import { ActivationPoll } from "@/components/ActivationPoll";
import { TRIAL_DAYS } from "@/lib/plans";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Welcome — Fade The Money",
  robots: { index: false },
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Post-checkout landing page. */
export default async function WelcomePage() {
  const access = await getMemberAccess();
  const renews = formatDate(access.currentPeriodEnd);

  if (!access.isMember) {
    return (
      <main className="container pricing-shell">
        <div className="section-h">Membership</div>
        <h1 className="section-title serif">
          Activating your membership…
        </h1>
        <p className="lede">
          Stripe has your payment. We&apos;re switching your account over now — this
          page updates by itself, no need to reload.
        </p>
        <ActivationPoll />
      </main>
    );
  }

  return (
    <main className="container pricing-shell">
      <div className="section-h">Membership</div>
      <h1 className="section-title serif">
        You&apos;re in.<br />
        <em>Every pick is unlocked.</em>
      </h1>

      <p className="lede">
        {access.status === "trialing"
          ? `Your ${TRIAL_DAYS}-day free trial has started.${renews ? ` First charge on ${renews} — cancel any time before then and you won't be billed.` : ""}`
          : renews
            ? `Your membership is active. Next billing date: ${renews}.`
            : "Your membership is active."}
      </p>

      <ul className="join-list">
        <li>The full board is unlocked — spread, total and moneyline picks, all 7 leagues</li>
        <li>Live favorite-vs-underdog streaks as they form</li>
        <li>Streak alerts land in your inbox the moment a run hits</li>
        <li>Manage your plan or cancel any time from your account page</li>
      </ul>

      <div className="pricing-member">
        <Link href="/" className="btn-primary btn-join">
          Go to the dashboard
        </Link>
        <Link href="/account" className="pick-locked">
          Manage subscription and alert preferences
        </Link>
      </div>
    </main>
  );
}
