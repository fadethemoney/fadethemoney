import Link from "next/link";
import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — Fade The Money",
  description: "What Fade The Money collects, why, and what you can do about it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={LEGAL.effectiveDate}>
      <p>
        This policy explains what {LEGAL.entity} collects when you use {LEGAL.domain}, why
        we collect it, and the choices you have. We keep it short and specific on purpose.
      </p>

      <LegalSection heading="What we collect">
        <ul>
          <li>
            <strong>Account details</strong> you give us: name, email address, phone
            number and address, plus a password we never see in readable form.
          </li>
          <li>
            <strong>Membership details:</strong> your plan, subscription status, renewal
            date, and which leagues you want alerts for.
          </li>
          <li>
            <strong>Payment details:</strong> handled entirely by Stripe. We receive a
            customer reference and the status of your subscription — never your full card
            number.
          </li>
          <li>
            <strong>Technical data</strong> our hosting produces in the normal course of
            serving pages: IP address, browser type, and request logs.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Why we use it">
        <ul>
          <li>to create and run your account, and to unlock member content</li>
          <li>to take payment and manage renewals, refunds and failed payments</li>
          <li>to send the streak alerts you asked for, and service emails about your account</li>
          <li>to keep the service secure and diagnose faults</li>
        </ul>
        <p>
          We do not sell your personal information, and we do not share it with third
          parties for their own marketing.
        </p>
      </LegalSection>

      <LegalSection heading="Who processes data for us">
        <ul>
          <li>
            <strong>Supabase</strong> — accounts and database hosting
          </li>
          <li>
            <strong>Stripe</strong> — payments, billing and the customer portal
          </li>
          <li>
            <strong>Resend</strong> — sending email
          </li>
          <li>
            <strong>Vercel</strong> — website hosting
          </li>
          <li>
            <strong>SportsGameOdds</strong> — sports data (they receive no personal data
            from us)
          </li>
        </ul>
        <p>
          Each processes data on our instructions under its own security commitments. We
          may also disclose information where the law requires it.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies">
        <p>
          We use cookies for one thing: keeping you signed in. There are no advertising or
          cross-site tracking cookies on this site.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <p>
          Account data lives as long as your account does. If you close your account we
          delete your profile, keeping only what we must for tax, accounting and
          fraud-prevention records — typically the billing history Stripe holds.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices">
        <ul>
          <li>
            <strong>Update your details</strong> any time on your{" "}
            <Link href="/account">account page</Link>.
          </li>
          <li>
            <strong>Stop alert emails</strong> from the same page, or via the unsubscribe
            link in any alert. That doesn&apos;t affect your membership.
          </li>
          <li>
            <strong>Get a copy of your data, or have it deleted</strong> — email us and we
            will action it. Depending on where you live you may also have rights to
            correct data or object to its use; we honour those requests regardless of
            where you are.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          This service is not for anyone under 18. We don&apos;t knowingly collect data
          from children, and we delete it if we discover we have.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If we change this policy materially, we&apos;ll email members before it takes
          effect. The effective date above always reflects the current version.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          {LEGAL.entity}
          <br />
          {LEGAL.address}
          <br />
          <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
