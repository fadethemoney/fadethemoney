import Link from "next/link";
import type { Metadata } from "next";
import { getMemberAccess } from "@/lib/subscription";
import { PricingPlans } from "@/components/PricingPlans";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Membership — Fade The Money",
  description:
    "Unlock every pick, live favorite-vs-underdog streaks across 7 leagues, and streak alert emails.",
};

const INCLUDED = [
  "Every pick unlocked — spread, total and moneyline, all 7 leagues",
  "Live favorite-vs-underdog streaks as they form",
  "Streak alert emails for the leagues you pick",
  "Full results history and daily recaps",
  "Cancel anytime — access runs to the end of the paid period",
];

export default async function PricingPage() {
  const access = await getMemberAccess();

  return (
    <main className="container pricing-shell">
      <div className="section-h">Membership</div>
      <h1 className="section-title serif">
        The board is free.<br />
        <em>The picks are ours.</em>
      </h1>

      {access.isMember ? (
        <div className="pricing-member">
          <p>
            You already have full access
            {access.reason === "comp"
              ? " — your account is comped."
              : access.reason === "staff"
                ? " as a member of the team."
                : "."}
          </p>
          <Link href="/account" className="btn-primary btn-join">
            Manage subscription
          </Link>
        </div>
      ) : (
        <>
          <ul className="join-list">
            {INCLUDED.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <PricingPlans signedIn={access.signedIn} />

          <p className="pricing-fineprint">
            Fade The Money publishes sports information and statistics. We are not a
            sportsbook, we don&apos;t accept wagers, and nothing here is a guarantee of
            results. See our <Link href="/terms">Terms</Link>,{" "}
            <Link href="/privacy">Privacy Policy</Link> and{" "}
            <Link href="/disclaimer">disclaimer</Link>.
          </p>
        </>
      )}
    </main>
  );
}
