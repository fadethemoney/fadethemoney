-- Fade The Money — pick emails with an image.
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query) once.
-- Additive and safe to run on the live project; the app degrades gracefully
-- (image upload silently disabled) if it hasn't been applied yet.

-- Optional picture for a tip. Holds a public Vercel Blob URL uploaded through
-- /api/admin/upload — the same store the news editor uses. Shown at the top of
-- the "Email subscribers" blast.
alter table public.notifications
  add column if not exists image_url text;
