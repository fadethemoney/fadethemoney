-- Fade The Money — Phase 2: welcome-email dedup
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- Adds a one-time "welcome email sent" marker so the welcome email can be
-- claimed atomically and never looped or double-sent.

alter table public.profiles
  add column if not exists welcomed_at timestamptz;
