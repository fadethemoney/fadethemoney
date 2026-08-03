# Phase 3 — go-live checklist and test pass

Everything below runs in **Stripe test mode**. Nothing goes to live keys until
every box here is ticked.

---

## 1. Setup (one time)

### Stripe dashboard (test mode)

1. **Products → Add product** twice:
   - *Fade The Money — Monthly*, recurring, $29.99 / month
   - *Fade The Money — Annual*, recurring, $299 / year
   Copy each **price id** (`price_…`).
2. **Settings → Billing → Customer portal** → enable: cancel subscription
   (at period end), update payment method, switch plan between the two prices,
   invoice history. Save — the portal 500s until this is saved once.
3. **Settings → Billing → Subscriptions and emails** → turn on
   *Send trial-ending reminders* (3 days before) and failed-payment emails.
4. **Developers → Webhooks → Add endpoint**:
   `https://<site>/api/stripe/webhook`, events:
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `checkout.session.completed`,
   `charge.dispute.created`. Copy the signing secret (`whsec_…`).

### Supabase

Run `supabase/migrations/0006_subscriptions.sql` in the SQL editor. Confirm
`profiles` has `subscription_status`, `is_comp`, `alert_leagues`, that
`stripe_events` exists, and that `is_member()` was created.

### Env (`.env.local` for local testing, Vercel for production)

```
PAYWALL_ENABLED=true
STRIPE_SECRET_KEY=sk_test_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_MONTHLY=price_…
STRIPE_PRICE_ANNUAL=price_…
NEXT_PUBLIC_SITE_URL=https://<site>
CRON_SECRET=<long random string>
```

Missing Supabase or Stripe vars in Vercel break the build and the new routes
404 while the old deploy keeps serving — set them **before** redeploying.

### Local webhook forwarding

```
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the `whsec_` it prints, not the dashboard one.

---

## 2. Test cards

| Card | Behaviour |
| --- | --- |
| `4242 4242 4242 4242` | succeeds |
| `4000 0000 0000 9995` | declines — insufficient funds |
| `4000 0000 0000 0341` | attaches fine, then fails on charge |
| `4000 0000 0000 3220` | 3D Secure challenge |
| `4000 0000 0000 0259` | succeeds, then disputes as fraudulent |

Any future expiry, any CVC, any ZIP.

---

## 3. Scenarios

Each one: do the action, then check **both** the Stripe dashboard and the
`profiles` row (Supabase → Table editor) plus what the site actually shows.

### 3.1 Free visitor sees the free tier
- [ ] Logged out, dashboard shows games, odds and past results
- [ ] No pick tags, no live verdict pills, streak banner is the join prompt
- [ ] `GET /api/games` contains **no** `pickedSide` on unfinished games and an
      empty `streak` — this is the real lock, not the UI
- [ ] `/results` and `/blog` fully readable

### 3.2 Join with a trial
- [ ] `/pricing` → pick Monthly → the trial button stays disabled until the
      auto-renewal box is ticked
- [ ] Checkout shows $0 due today, trial end date, and Apple/Google Pay on a
      supported device
- [ ] Pay with `4242…` → lands on `/welcome`, which flips to "You're in"
      within a few seconds
- [ ] `profiles`: `subscription_status=trialing`, `subscription_plan=monthly`,
      `current_period_end` = trial end, `stripe_customer_id` set
- [ ] Membership welcome email arrives
- [ ] Dashboard now shows picks, tags and streaks
- [ ] `stripe_events` has one row per delivered event

### 3.3 Trial converts
- [ ] Stripe → Subscriptions → the test subscription → **Advance test clock**
      past the trial end (create the subscription against a test clock, or use
      the Stripe CLI `stripe test_helpers test_clocks advance`)
- [ ] `subscription_status` → `active`, `current_period_end` moves forward
- [ ] Access uninterrupted

### 3.4 Renewal
- [ ] Advance the clock a further billing period
- [ ] Invoice paid, `current_period_end` moves, status stays `active`

### 3.5 Failed payment → grace → pause
- [ ] Swap the card to `4000 0000 0000 0341` in the portal, advance to renewal
- [ ] Charge fails → `subscription_status=past_due` → **access continues**
- [ ] Advance through Stripe's smart retries until it gives up
- [ ] Status → `paused`, dashboard locks, account page explains how to fix it
- [ ] Update to a good card → back to `active`, access returns, no re-purchase

### 3.6 Cancel
- [ ] Account → Manage subscription → cancel
- [ ] `cancel_at_period_end=true`, account page says access runs to the date
- [ ] Picks still visible before that date
- [ ] Advance past `current_period_end` → status `canceled`, dashboard locks

### 3.7 Re-subscribe
- [ ] Same account joins again from `/pricing`
- [ ] **`stripe_customer_id` is the same value as before** — one customer, one
      billing history
- [ ] Access restored

### 3.8 Annual plan
- [ ] Join on Annual → `subscription_plan=annual`, period end one year out
- [ ] Portal → switch to Monthly → webhook updates the plan within seconds

### 3.9 Chargeback
- [ ] Join with `4000 0000 0000 0259`, wait for `charge.dispute.created`
- [ ] `subscription_status=canceled`, access gone immediately

### 3.10 Alert emails
- [ ] Two member accounts: one with all leagues, one with NFL only
- [ ] Trigger an NBA streak (`npm run test-alert`) → only the all-leagues member
      and the ADMIN_EMAIL owners receive it
- [ ] Each member copy has its own unsubscribe link; owners' copies don't
- [ ] Click unsubscribe → `alert_leagues` empties, membership untouched, the
      confirmation page appears
- [ ] Re-select leagues on the account page → alerts resume

### 3.11 Admin
- [ ] `/admin/members` counts match Stripe (active, trial, problems, canceled)
- [ ] Monthly revenue = paying members only; annual counted at 1/12
- [ ] Super admin can grant/remove comp; a comped account keeps full access with
      no Stripe subscription
- [ ] A plain admin sees the list but no comp buttons

### 3.12 Reconcile job
- [ ] Set a profile to `active` by hand in Supabase with no Stripe subscription
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/reconcile`
- [ ] The row is closed out to `canceled`, an admin email reports the fix
- [ ] Without the header → 401

### 3.13 Security
- [ ] Webhook with a bad signature → 400, nothing written
- [ ] Replay a delivered event (Stripe dashboard → Resend) → 200 `duplicate`,
      no double email
- [ ] Non-member calling `/api/games` directly gets the redacted payload
- [ ] Free account visiting `/welcome` sees the activating state, not member
      content

---

## 4. Before switching to live keys

- [ ] Legal pages reviewed by a lawyer; `lib/legal.ts` placeholders replaced
      with the real business name, address, support inbox and governing state
- [ ] Stripe account fully activated (business details + bank) or payouts stay
      blocked
- [ ] Written confirmation from Stripe that the business category is accepted
- [ ] Live keys in Vercel only, webhook endpoint re-created against the live
      site with its own signing secret
- [ ] `PAYWALL_ENABLED=true` in Vercel — until this is set the site stays open
- [ ] Owner accounts (`ADMIN_EMAIL` addresses) set to comp so they keep access
      and alerts for free
- [ ] One real card charged and refunded end to end
