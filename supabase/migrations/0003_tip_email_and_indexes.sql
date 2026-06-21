-- Fade The Money — Phase 2 follow-up: tip email delivery + email sync + indexes
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query) once.
-- All of these are additive and safe to run on the live project. The app code
-- degrades gracefully if this migration hasn't been applied yet.

-- ============================================================
-- 1) Tip email: one-time "emailed to subscribers" marker.
--    Lets the admin "Email subscribers" action claim a send atomically so a
--    tip can never be blasted twice (mirrors profiles.welcomed_at).
-- ============================================================
alter table public.notifications
  add column if not exists emailed_at timestamptz;

-- ============================================================
-- 2) Email sync: keep profiles.email in step with auth.users.email.
--    A user changes their email via Supabase Auth (confirmed by link), which
--    updates auth.users.email — this mirrors it into profiles so the Users
--    list / dashboard never show a stale address.
-- ============================================================
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- ============================================================
-- 3) Indexes for the filters/sorts the admin screens actually run.
--    (Cheap insurance before the user base grows.)
-- ============================================================
create index if not exists notifications_status_created_idx
  on public.notifications (status, created_at desc);
create index if not exists profiles_role_idx
  on public.profiles (role);
create index if not exists profiles_created_at_idx
  on public.profiles (created_at desc);
create index if not exists profiles_email_opt_in_idx
  on public.profiles (email_opt_in) where email_opt_in = true;
