import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Disclaimer & Responsible Gaming — Fade The Money",
  description:
    "Fade The Money publishes sports information and statistics. It is not a sportsbook and not betting advice.",
};

export default function DisclaimerPage() {
  return (
    <LegalPage title="Disclaimer & Responsible Gaming" updated={LEGAL.effectiveDate}>
      <LegalSection heading="Information, not advice">
        <p>
          {LEGAL.site} publishes sports information: odds, spreads, totals, scores and
          statistics about how favorites and underdogs have performed against the betting
          line. Everything here is for information and entertainment.
        </p>
        <p>
          It is <strong>not</strong> betting advice, financial advice, or a recommendation
          to wager on anything. What you do with the information is your decision and your
          responsibility alone.
        </p>
      </LegalSection>

      <LegalSection heading="We are not a sportsbook">
        <p>
          We do not accept or place bets, we hold no customer funds for wagering, we
          broker nothing, and we pay out no prizes. Your membership buys access to
          information — nothing else.
        </p>
      </LegalSection>

      <LegalSection heading="No guarantees">
        <p>
          Nobody can predict sports outcomes, and we don&apos;t claim to. Past results
          shown on this site describe what already happened; they say nothing reliable
          about what happens next. Streaks end. Favorites cover, then they don&apos;t.
        </p>
        <p>
          Sports data comes from third-party providers and can be delayed, incomplete or
          incorrect. Lines move, games get postponed, and official scores are sometimes
          corrected after a game ends — which can change a result shown here.
        </p>
      </LegalSection>

      <LegalSection heading="Know your local law">
        <p>
          Gambling laws differ by state and country. You are responsible for knowing what
          is legal where you are. You must be 18 or older to use this service — 21 or
          older where that is the legal threshold for gambling-related content.
        </p>
      </LegalSection>

      <LegalSection heading="Responsible gaming">
        <p>
          Betting should be entertainment you can afford, never a way to make money or
          recover losses. If it stops feeling that way, step back.
        </p>
        <p>Free, confidential help is available 24/7:</p>
        <ul>
          <li>
            <strong>National Problem Gambling Helpline:</strong>{" "}
            <a href="tel:1-800-426-2537">1-800-GAMBLER</a> (1-800-426-2537)
          </li>
          <li>
            <strong>Text:</strong> 800GAM to 800321
          </li>
          <li>
            <strong>Online:</strong>{" "}
            <a href="https://www.ncpgambling.org" rel="noopener noreferrer" target="_blank">
              ncpgambling.org
            </a>
          </li>
          <li>
            <strong>Gamblers Anonymous:</strong>{" "}
            <a href="https://www.gamblersanonymous.org" rel="noopener noreferrer" target="_blank">
              gamblersanonymous.org
            </a>
          </li>
        </ul>
        <p>
          Most states also run self-exclusion programs, and every licensed sportsbook
          offers deposit limits, time-outs and self-exclusion tools. Use them early rather
          than late.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
