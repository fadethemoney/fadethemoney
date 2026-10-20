import type { BetCategory, League } from "./types";

/**
 * Every league we fetch, grade and show. Order drives the homepage tabs and the
 * account alert-preference list.
 */
export const LEAGUES_ALL: League[] = [
  "nba",
  "wnba",
  "mlb",
  "nfl",
  "nhl",
  "ncaab",
  "ncaaf",
  "laliga",
];

export const LEAGUE_LABEL: Record<League, string> = {
  nba: "NBA",
  wnba: "WNBA",
  mlb: "MLB",
  nfl: "NFL",
  nhl: "NHL",
  ncaab: "NCAAB",
  ncaaf: "NCAAF",
  laliga: "La Liga",
};

const ALL_CATEGORIES: readonly BetCategory[] = ["ats", "total", "moneyline"];

/**
 * Which bet categories a league is graded and alerted on.
 *
 * La Liga is TOTALS ONLY, at the client's request (WhatsApp 2026-10-17: "can
 * you just do the totals?"). 38% of La Liga matches are posted at a level (0)
 * handicap with no favorite, which makes the Public/Vegas side arbitrary — on
 * a 0 handicap `pickedSide` always resolves to home, since it derives from
 * `spread <= 0` (lib/sportsgameodds.ts). Totals carry no such defect: all 79
 * graded matches this season were gradeable with zero pushes.
 *
 * This list must gate the CATEGORIES, not just the spread UI. The ATS *and*
 * moneyline streaks both grade off `pickedSide` — moneyline reads the spread to
 * decide who the favorite was, never the ML prices — so hiding spreads alone
 * would leave two streaks running on arbitrary sides and still emailing.
 */
export const LEAGUE_CATEGORIES: Record<League, readonly BetCategory[]> = {
  nba: ALL_CATEGORIES,
  wnba: ALL_CATEGORIES,
  mlb: ALL_CATEGORIES,
  nfl: ALL_CATEGORIES,
  nhl: ALL_CATEGORIES,
  ncaab: ALL_CATEGORIES,
  ncaaf: ALL_CATEGORIES,
  laliga: ["total"],
};

export function leagueHasCategory(league: League, category: BetCategory): boolean {
  return LEAGUE_CATEGORIES[league].includes(category);
}

/** True for a league graded on totals alone — no spread or moneyline picks. */
export function isTotalsOnlyLeague(league: League): boolean {
  return !leagueHasCategory(league, "ats");
}
