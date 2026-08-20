# Phase 3 — status as of 2026-08-20

**Built, deployed, and the paywall is ON at https://fadethemoney.com.** What is
NOT done is taking real money: production still runs Stripe **sandbox** keys, so
every "payment" so far has been play money.

Live site verified 2026-08-20: `/pricing` shows $50/month, $500/year,
"Start 14-day trial", and the non-refundable consent wording. Code and site
agree, and `main` builds clean.

**The one remaining gate is the live key swap.** See "Go-live — what is left"
at the bottom of this doc.

Companion doc: `docs/PHASE3-TESTING.md` (setup + the 13-scenario test pass).

---

## What was delivered, against the 8-section client list

| # | Section | Status | Main files |
| --- | --- | --- | --- |
| 1 | Join & payment | Built | `app/pricing/`, `app/api/stripe/checkout/`, `app/welcome/`, membership welcome email in `lib/mailer.ts` |
| 2 | Member access (paywall) | Built | `lib/subscription.ts` (gate), `lib/paywall.ts` (redaction) |
| 3 | Member account area | Built | `components/account/MembershipSection.tsx`, `components/account/AlertPreferences.tsx`, `app/api/stripe/portal/` |
| 4 | Alerts to members | Built | `lib/alert-recipients.ts`, `sendStreakAlert` in `lib/mailer.ts`, `app/api/alerts/unsubscribe/` |
| 5 | Billing protection | Built | `app/api/stripe/webhook/`, `app/api/cron/reconcile/`, `lib/stripe-sync.ts` |
| 6 | Admin | Built | `app/admin/members/` |
| 7 | Legal pages | Built (needs lawyer) | `app/terms/`, `app/privacy/`, `app/disclaimer/`, `lib/legal.ts` |
| 8 | Full test pass | Scenarios 3.1–3.4 pass in sandbox; 3.5–3.13 deferred by Robert 2026-08-10 | `docs/PHASE3-TESTING.md` |

---

## How the lock actually works

Not a CSS blur. `lib/paywall.ts` strips the data server-side before anything
renders, so a non-member's browser never receives the pick:

- unfinished games lose `pickedSide` (every verdict is computed from it)
- all streak state is emptied, globally and per league
- finished games keep their results — past performance is the marketing
- `/api/games` runs through the same redaction, so the JSON route can't be
  used as a side door
- the announcement bar (admin-sent picks) is fetched only for members

Access is granted to: staff, comp accounts, and `trialing` / `active` /
`past_due` subscriptions. `past_due` keeps access on purpose — that's the
grace window while Stripe retries a failed card. Only `paused` locks out.

**Verified locally on 2026-08-03** with `PAYWALL_ENABLED=true`: an anonymous
`/api/games` payload had zero `pickedSide` across 32 unfinished games and an
empty streak, while 65 finished games kept their results. With the flag off,
picks and streaks returned untouched.

---

## Honest caveat worth repeating to the client

Hiding the "Public" tag while still showing the spread is a **UI** lock — the
ATS favorite is derivable from the line we display. The genuinely paywalled
assets are: streak state, live cover verdicts, the announcement-bar picks, and
the alert emails. Don't oversell the lock as cryptographic.

---

## To check the work

Everything is live. Migration 0006 was applied 2026-08-04 and
`PAYWALL_ENABLED=true` has been set in Vercel since 2026-08-06, so a
logged-out visit to https://fadethemoney.com already shows the locked
dashboard and the join prompts. Removing that variable and redeploying
reverts the whole paywall.

---

## Go-live — what is left

Production runs **sandbox** Stripe keys, so nothing has ever charged a real
card. Closing that is the whole remaining job.

**Decided 2026-08-20:** launch on the client's existing live account
`acct_1S3ykhCH7wkxF1QU` ("Doctor auto glass"). No second Stripe account, no
rename, legal entity untouched — its default payout bank is already the
client's own. Consequence accepted knowingly: an account registered to one
business selling a second business's product is the classic Stripe freeze
pattern, and a freeze there also freezes the auto-glass side. Two mitigations
are therefore not optional — put the statement descriptor on the PRODUCT
rather than the account, and send Stripe support a written notice that the
account now also sells sports-information subscriptions.

1. **Live keys.** `sk_live_…` into a gitignored `.env.live`. The publishable
   key is NOT needed — nothing imports `@stripe/stripe-js`; checkout is a
   server-side redirect to `session.url`.
2. **Run `scripts/stripe-live-setup.mjs --key … --apply`.** One pass creates
   the product (descriptor `FADETHEMONEY.COM`), the $50/mo and $500/yr prices,
   the 5-event webhook, and a portal config that actually lists products so
   plan-switching has something to switch to. It refuses to create a price
   that disagrees with `lib/plans.ts`, and prints the webhook secret — which
   Stripe returns only once, at creation.
3. **Swap four env vars in Vercel Production** and redeploy, together:
   `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`,
   `STRIPE_WEBHOOK_SECRET`. Half-swapped is a broken checkout.
4. **Three dashboard settings the API cannot reach:** turn Google Pay ON
   (confirmed off), set failed-payment handling to *mark unpaid* not *cancel*
   (`lib/stripe-sync.ts` maps unpaid→paused/recoverable, canceled→dead), and
   turn on the trial-ending reminder email.
5. **Clear the two profiles holding sandbox customer ids** —
   `rakesh@nibbleedge.com.au` (active) and `sbryann16@gmail.com` (canceled).
   Once the keys are live those customers do not exist, and the nightly
   reconcile will silently mark the active one canceled. Comp them or reset
   them to `none`; do it deliberately rather than overnight.
6. **Legal review** + real business name, address, support inbox and governing
   state into `lib/legal.ts` — still placeholders, and they print on the pages
   customers accept at checkout. This is the one item that genuinely blocks
   charging a stranger.

**The real-card test.** A 14-day trial means checkout captures nothing on day
one, so proving the money path takes two steps: complete checkout with a real
card, then *End trial now* on the subscription to force the first $50 invoice.
Refund afterwards — Stripe returns the $50 but keeps the ~$1.75 fee.

## Client answers received 2026-08-12

| Question | Answer | State |
|---|---|---|
| Monthly price | **$50/mo** | In `lib/plans.ts`. Needs a matching live Stripe Price. |
| Annual price | **$500/yr** (ten monthly payments, so "two months free" is literal) | In `lib/plans.ts`. Needs a matching live Stripe Price. |
| Refunds | **None** | Already the wording in `/terms`; renewal copy now says it too. |
| Promo codes | **None** | Already off. Leave `STRIPE_ALLOW_PROMO` unset. |
| Business name | Answer incomplete, still needed | `lib/legal.ts` still falls back to "Fade The Money". |

Trial length **confirmed 2026-08-16: two weeks.** `TRIAL_DAYS = 14`.

**Price change is a two-part job.** `lib/plans.ts` is only what the customer
reads; the amount charged is the Stripe Price behind `STRIPE_PRICE_MONTHLY` /
`STRIPE_PRICE_ANNUAL`. Stripe Prices are immutable, so $50/$500 means creating
NEW prices and repointing those env vars. Ship the code and the env change
together or the page will quote one number and the card will be charged
another.
