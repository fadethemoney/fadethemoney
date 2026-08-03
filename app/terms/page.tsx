import Link from "next/link";
import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Terms of Service — Fade The Money",
  description: "The terms that govern your use of Fade The Money.",
};

export default function TermsPage() {
  const monthly = PLANS.find((p) => p.id === "monthly")!;
  const annual = PLANS.find((p) => p.id === "annual")!;

  return (
    <LegalPage title="Terms of Service" updated={LEGAL.effectiveDate}>
      <p>
        These terms are an agreement between you and {LEGAL.entity} (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;), covering your use of {LEGAL.domain} and everything on it. By
        creating an account or subscribing, you agree to them. If you don&apos;t agree,
        please don&apos;t use the service.
      </p>

      <LegalSection heading="1. What this service is">
        <p>
          {LEGAL.site} publishes sports information: odds, spreads, totals, scores,
          historical results, and statistics about how favorites and underdogs perform
          against the betting line. It is an information and entertainment product.
        </p>
        <p>
          <strong>We are not a sportsbook.</strong> We do not accept, place, broker or
          settle wagers, we hold no player funds, and we award no prizes. Nothing on the
          site is a recommendation to place a bet, financial advice, or a prediction of
          any outcome. See our <Link href="/disclaimer">disclaimer</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="2. Who may use it">
        <p>
          You must be at least 18 years old (21 in jurisdictions where that is the legal
          age for gambling-related content) and legally permitted to receive this
          information where you live. Gambling laws vary by state and country, and it is
          your responsibility to know the rules that apply to you.
        </p>
      </LegalSection>

      <LegalSection heading="3. Your account">
        <p>
          Keep your login details private — you are responsible for activity under your
          account. Give us accurate information and keep it current. Tell us promptly at{" "}
          <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a> if you think
          someone else has accessed your account.
        </p>
        <p>
          One account is for one person. Sharing a membership, reselling access, or
          redistributing member-only picks and streak data is not permitted.
        </p>
      </LegalSection>

      <LegalSection heading="4. Membership, billing and renewal">
        <ul>
          <li>
            <strong>Plans.</strong> {monthly.price} {monthly.cadence}, or {annual.price}{" "}
            {annual.cadence}. Prices are in US dollars.
          </li>
          <li>
            <strong>Free trial.</strong> New members get {TRIAL_DAYS} days free. We ask
            for a card up front. Cancel before the trial ends and you are not charged.
          </li>
          <li>
            <strong>Automatic renewal.</strong> Your membership renews automatically at
            the end of every billing period, at the plan price then in effect, until you
            cancel. You consent to this recurring charge when you subscribe.
          </li>
          <li>
            <strong>Cancelling.</strong> Cancel any time from your{" "}
            <Link href="/account">account page</Link>. Access continues to the end of the
            period you have already paid for, then stops. We don&apos;t pro-rate partial
            periods.
          </li>
          <li>
            <strong>Refunds.</strong> Payments are non-refundable except where the law
            requires otherwise. If something has genuinely gone wrong, email us — we
            would rather sort it out than argue about it.
          </li>
          <li>
            <strong>Failed payments.</strong> If a payment fails we retry it over several
            days. Access pauses if those retries don&apos;t succeed, and resumes as soon
            as a valid card goes through. A chargeback ends access immediately.
          </li>
          <li>
            <strong>Price changes.</strong> We will give you notice before any price
            change takes effect, and you can cancel before it does.
          </li>
        </ul>
        <p>
          Payments are processed by Stripe. We never see or store your full card details.
        </p>
      </LegalSection>

      <LegalSection heading="5. Emails you receive">
        <p>
          Members receive streak alert emails for the leagues they choose. You can change
          those leagues, or turn alerts off entirely, from your account page or the
          unsubscribe link in any alert. Service messages about your account and billing
          are not optional while you hold an active membership.
        </p>
      </LegalSection>

      <LegalSection heading="6. Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>scrape, crawl, or bulk-extract data from the site</li>
          <li>republish, resell or redistribute member-only content</li>
          <li>attempt to bypass the membership gate or access another user&apos;s account</li>
          <li>interfere with the operation or security of the service</li>
        </ul>
      </LegalSection>

      <LegalSection heading="7. Our content">
        <p>
          The site, its design, text and the analysis we produce belong to us or our
          licensors. Underlying sports data, odds and scores come from third-party
          providers and remain theirs. Your membership grants you a personal,
          non-transferable right to use the service — not ownership of anything in it.
        </p>
      </LegalSection>

      <LegalSection heading="8. No warranty">
        <p>
          The service is provided &ldquo;as is&rdquo;. Sports data arrives from third
          parties and can be delayed, incomplete, or wrong; lines move; games get
          postponed; results are sometimes corrected after the fact. We do not warrant
          that the information is accurate, uninterrupted, or fit for any particular
          purpose, and we do not guarantee any outcome or result whatsoever.
        </p>
      </LegalSection>

      <LegalSection heading="9. Limitation of liability">
        <p>
          To the fullest extent the law allows, we are not liable for any indirect,
          incidental or consequential damages, or for any betting, financial or other
          losses arising from your use of the service. Our total liability to you for any
          claim is limited to the amount you paid us in the twelve months before it arose.
        </p>
      </LegalSection>

      <LegalSection heading="10. Suspension and termination">
        <p>
          We may suspend or close an account that breaches these terms, is used
          fraudulently, or charges back a payment. You may close your account at any time
          from your account page.
        </p>
      </LegalSection>

      <LegalSection heading="11. Changes to these terms">
        <p>
          We may update these terms. If a change is material we will notify members by
          email before it takes effect. Continuing to use the service after that means
          you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection heading="12. Governing law">
        <p>
          These terms are governed by the laws of {LEGAL.jurisdiction}, without regard to
          conflict-of-law rules.
        </p>
      </LegalSection>

      <LegalSection heading="13. Contact">
        <p>
          Questions about these terms:{" "}
          <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
