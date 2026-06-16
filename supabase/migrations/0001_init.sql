-- Fade The Money — Phase 2: accounts + admin
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query) once the
-- project exists. Creates the profiles + notifications tables, Row Level
-- Security policies (default-deny), and the signup → profile trigger.

-- ============================================================
-- Roles
-- ============================================================
create type public.user_role as enum ('customer', 'admin', 'super_admin');

-- ============================================================
-- profiles: one row per auth.users, auto-created on signup
-- ============================================================
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  name          text,
  role          public.user_role not null default 'customer',
  email_opt_in  boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ============================================================
-- notifications: admin "tips"
-- ============================================================
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  team_pick   text not null,
  message     text,
  status      text not null default 'draft' check (status in ('draft', 'active')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.notifications enable row level security;

-- ============================================================
-- helper: is the current user an admin/super_admin?
-- security definer avoids RLS recursion when a profiles policy
-- needs to read profiles.
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

-- ============================================================
-- profiles policies
-- ============================================================
-- read own profile; admins can read everyone (for the Users list)
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using ( auth.uid() = id or public.is_admin() );

-- update own profile only (role escalation blocked by trigger below)
create policy "profiles_update_own"
  on public.profiles for update
  using ( auth.uid() = id )
  with check ( auth.uid() = id );

-- No end-user INSERT/DELETE policy: inserts come from the signup trigger
-- (security definer); role changes + deletes happen server-side with the
-- service-role key, which bypasses RLS.

-- block users from changing their own role via the self-update path
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
as $$
begin
  if (auth.role() <> 'service_role') and (new.role is distinct from old.role) then
    raise exception 'role can only be changed by the server';
  end if;
  return new;
end;
$$;
create trigger profiles_no_role_change
  before update on public.profiles
  for each row execute function public.prevent_role_change();

-- defense-in-depth: column-level privileges (enforced independently of RLS and
-- the trigger). End users can only ever write name + email_opt_in; role, email,
-- id and created_at are physically unwritable from the client even if RLS or
-- the trigger are bypassed. The service-role key (table owner) bypasses this.
revoke update on public.profiles from authenticated;
grant update (name, email_opt_in) on public.profiles to authenticated;

-- ============================================================
-- notifications policies
-- ============================================================
-- any signed-in user reads ACTIVE tips; admins read all (incl. drafts).
-- `to authenticated` keeps active tips from leaking to the anon role (and sets
-- up the Phase 3 paywall, where this gains a subscription check).
create policy "notifications_select"
  on public.notifications for select
  to authenticated
  using ( status = 'active' or public.is_admin() );

-- only admins create / edit / delete tips
create policy "notifications_insert_admin"
  on public.notifications for insert
  with check ( public.is_admin() );
create policy "notifications_update_admin"
  on public.notifications for update
  using ( public.is_admin() ) with check ( public.is_admin() );
create policy "notifications_delete_admin"
  on public.notifications for delete
  using ( public.is_admin() );

-- ============================================================
-- triggers
-- ============================================================
-- create a profile row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep notifications.updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger notifications_touch_updated_at
  before update on public.notifications
  for each row execute function public.touch_updated_at();
