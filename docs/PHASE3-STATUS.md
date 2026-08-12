# Phase 3 — status as of 2026-08-03

**All 10 milestones are built and on `main`** (commits `6c80030` → `3e9b4fe`).
The live site behaves exactly as it did before, because the paywall only
switches on when `PAYWALL_ENABLED=true` exists in the environment — and it is
deliberately not set in Vercel yet.

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
| 8 | Full test pass | Blocked on Stripe test keys | `docs/PHASE3-TESTING.md` |

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

**Already live** (paywall off, so the dashboard looks unchanged):
`/pricing`, `/terms`, `/privacy`, `/disclaimer`, `/welcome`.
`/account` and `/admin/members` show their new sections only after migration
0006 runs — before that they hide themselves rather than break.

**To see the paywall itself**, in this order:

1. Run `supabase/migrations/0006_subscriptions.sql` in the Supabase SQL editor
2. Set `PAYWALL_ENABLED=true` in Vercel → redeploy
3. Visit the dashboard in a logged-out/private window — picks locked, join
   prompts visible. Admin accounts still see everything.
4. Remove the variable and redeploy to revert.

Do step 1 before step 2. (An earlier version of the fallback would have locked
admins out if the columns were missing; fixed in `3e9b4fe`, but the migration
is still the right first move.)

---

## Blocked / needs a decision

1. **Stripe test keys** (`sk_test`, `pk_test`, `whsec`) → `.env.local`. Blocks
   the whole test pass.
2. **Run migration 0006** — nothing yet confirms it has been applied.
3. **Create the two Stripe prices** and save the Customer Portal config (the
   portal errors until its settings are saved once).
4. **Legal review** + real business name, address, support inbox and governing
   state into `lib/legal.ts` — currently placeholders.
5. **Client answers still open**: trial length, Stripe Tax (env flag, off),
   registered business name, mailing address, support inbox, governing state.
6. **Owner accounts** should be flipped to comp before launch so they keep
   access and alerts for free.

## Client answers received 2026-08-12

| Question | Answer | State |
|---|---|---|
| Monthly price | **$50/mo** | In `lib/plans.ts`. Needs a matching live Stripe Price. |
| Annual price | **$500/yr** (ten monthly payments, so "two months free" is literal) | In `lib/plans.ts`. Needs a matching live Stripe Price. |
| Refunds | **None** | Already the wording in `/terms`; renewal copy now says it too. |
| Promo codes | **None** | Already off. Leave `STRIPE_ALLOW_PROMO` unset. |
| Business name | Answer incomplete, still needed | `lib/legal.ts` still falls back to "Fade The Money". |

Trial length is still the unconfirmed 7-day default.

**Price change is a two-part job.** `lib/plans.ts` is only what the customer
reads; the amount charged is the Stripe Price behind `STRIPE_PRICE_MONTHLY` /
`STRIPE_PRICE_ANNUAL`. Stripe Prices are immutable, so $50/$500 means creating
NEW prices and repointing those env vars. Ship the code and the env change
together or the page will quote one number and the card will be charged
another.
