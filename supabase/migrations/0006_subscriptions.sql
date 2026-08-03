-- Fade The Money — Phase 3: paid subscriptions (Stripe)
-- Run in the Supabase SQL editor. Additive only: new columns on profiles plus
-- the stripe_events idempotency table. Nothing here changes Phase 2 behavior.

-- ============================================================
-- profiles: subscription state (written ONLY by the server via
-- the service-role key — webhook + reconcile job). Column-level
-- grants below keep these fields unwritable from the client.
-- ============================================================
alter table public.profiles
  add column stripe_customer_id   text unique,
  add column subscription_status  text not null default 'none'
    check (subscription_status in ('none', 'trialing', 'active', 'past_due', 'paused', 'canceled')),
  add column subscription_plan    text
    check (subscription_plan in ('monthly', 'annual')),
  add column current_period_end   timestamptz,
  add column cancel_at_period_end boolean not null default false,
  -- Comp accounts (owners/free member grants): full member access + alert
  -- emails without a Stripe subscription. Toggled by admins only.
  add column is_comp              boolean not null default false,
  -- Per-league streak-alert prefs; default = all leagues on.
  add column alert_leagues        text[] not null
    default array['nba', 'wnba', 'mlb', 'nfl', 'nhl', 'ncaab', 'ncaaf'];

-- Member-alert recipient query filters on status; keep it indexed.
create index profiles_subscription_status_idx
  on public.profiles (subscription_status);

-- End users may now also update their own alert_leagues (account page).
-- Extends the column grant from 0005; subscription/Stripe columns stay
-- service-role-only by omission.
grant update (name, email_opt_in, phone, address, alert_leagues) on public.profiles to authenticated;

-- ============================================================
-- stripe_events: webhook idempotency ledger. Stripe retries
-- deliveries; inserting the event id first (primary key) makes
-- reprocessing a no-op. Service-role only — RLS on, no policies.
-- ============================================================
create table public.stripe_events (
  id          text primary key,          -- Stripe event id (evt_...)
  type        text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;

-- ============================================================
-- helper: does the current user have member access? Mirrors the
-- server-side gate (lib/subscription.ts) for use in future RLS
-- policies (e.g. the post-launch picks-only visibility change).
-- past_due keeps access: grace window while Stripe smart-retries.
-- ============================================================
create or replace function public.is_member()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (
        is_comp
        or role in ('admin', 'super_admin')
        or subscription_status in ('trialing', 'active', 'past_due')
      )
  );
$$;
