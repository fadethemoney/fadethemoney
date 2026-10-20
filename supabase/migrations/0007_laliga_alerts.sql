-- La Liga streak alerts (totals only) — client request, WhatsApp 2026-10-17
-- ("can you just do the totals?") and 2026-10-20 ("let's do the 2 streak").
--
-- 0006 hardcoded the seven leagues that existed then as the column default, so
-- without this a new signup gets no La Liga alert and every existing member
-- stays opted out. The owner copy is unaffected either way: ADMIN_EMAIL
-- addresses are always added in lib/alert-recipients.ts and never filtered on
-- alert_leagues.

alter table public.profiles
  alter column alert_leagues
  set default array['nba', 'wnba', 'mlb', 'nfl', 'nhl', 'ncaab', 'ncaaf', 'laliga'];

-- Opt in the members who never customised their list — i.e. rows still holding
-- exactly the seven-league default. Anyone who has deliberately switched a
-- league off keeps their choice and can add La Liga from the account page.
update public.profiles
   set alert_leagues = alert_leagues || array['laliga']
 where not ('laliga' = any (alert_leagues))
   and alert_leagues @> array['nba', 'wnba', 'mlb', 'nfl', 'nhl', 'ncaab', 'ncaaf']
   and array_length(alert_leagues, 1) = 7;
