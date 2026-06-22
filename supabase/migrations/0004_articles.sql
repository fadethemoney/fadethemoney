-- Fade The Money — News / Blog (admin-authored articles)
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query) once.
-- Public can read PUBLISHED articles (incl. logged-out visitors); only admins
-- create / edit / delete. Reuses public.is_admin() + public.touch_updated_at()
-- from migration 0001.

create table if not exists public.articles (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  excerpt       text,
  cover_image   text,
  body          text not null default '',
  status        text not null default 'draft' check (status in ('draft', 'published')),
  author_id     uuid references public.profiles (id) on delete set null,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.articles enable row level security;

-- Anyone (anon + signed-in) may read PUBLISHED articles; admins read all
-- (incl. drafts). No `to authenticated` here on purpose — news is public.
create policy "articles_select_published_or_admin"
  on public.articles for select
  using ( status = 'published' or public.is_admin() );

-- Only admins create / edit / delete.
create policy "articles_insert_admin"
  on public.articles for insert with check ( public.is_admin() );
create policy "articles_update_admin"
  on public.articles for update using ( public.is_admin() ) with check ( public.is_admin() );
create policy "articles_delete_admin"
  on public.articles for delete using ( public.is_admin() );

create index if not exists articles_status_published_idx
  on public.articles (status, published_at desc);
create index if not exists articles_slug_idx on public.articles (slug);

create trigger articles_touch_updated_at
  before update on public.articles
  for each row execute function public.touch_updated_at();
