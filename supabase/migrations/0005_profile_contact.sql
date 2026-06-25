-- Fade The Money — collect phone + address at registration.
-- Run in the Supabase SQL editor (Dashboard → SQL → New query) after 0001–0004.

-- New optional contact columns on profiles.
alter table public.profiles
  add column if not exists phone   text,
  add column if not exists address text;

-- Populate them from signup metadata. The trigger is security definer (runs as
-- the table owner), so it can write these regardless of the column grants below.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, phone, address)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'address', '')
  );
  return new;
end;
$$;

-- Let end users maintain their own contact details from the account page
-- (extends the name + email_opt_in column-level grant from 0001).
grant update (name, email_opt_in, phone, address) on public.profiles to authenticated;
