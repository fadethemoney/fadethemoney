import type { BettingTrend, Game, Side } from "./types";

/**
 * Parse an American odds string ("-120", "+105") to a number. Returns null
 * for missing/invalid values. Lower number = shorter price = the favored side.
 */
function parseAmerican(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Which side of the total is the favorite per the juice on Over vs Under.
 * Whichever side has the shorter (more negative) price is the implied favorite.
 * Returns null if either price is missing or they're equal.
 */
export function totalFavoriteSide(
  trend: Pick<BettingTrend, "totalOddsOver" | "totalOddsUnder"> | undefined | null,
): "over" | "under" | null {
  if (!trend) return null;
  const over = parseAmerican(trend.totalOddsOver);
  const under = parseAmerican(trend.totalOddsUnder);
  if (over === null || under === null) return null;
  if (over === under) return null;
  return over < under ? "over" : "under";
}

/**
 * Determine if the public side is currently covering the spread.
 * Returns true (covering), false (not covering), or null (push / unknown).
 */
export function publicCovering(game: Game): boolean | null {
  if (!game.trend) return null;
  // 0-0 isn't "Vegas winning" — there's just no game yet.
  if (game.status !== "live" && game.status !== "final") return null;
  const homeScore = game.home.score ?? 0;
  const awayScore = game.away.score ?? 0;
  const homeSpread = game.trend.spread; // home line
  const adjustedHome = homeScore + homeSpread;
  const margin = adjustedHome - awayScore;
  if (margin === 0) return null;
  const homeCovering = margin > 0;
  const publicSide: Side = game.trend.pickedSide;
  return publicSide === "home" ? homeCovering : !homeCovering;
}

export function statusLabel(game: Game): "Public Winning" | "Vegas Winning" | "Push" | "—" {
  const c = publicCovering(game);
  if (c === null) return game.status === "scheduled" ? "—" : "Push";
  return c ? "Public Winning" : "Vegas Winning";
}

/**
 * Total status for the over/under market.
 *
 * Returns true if the OVER is currently winning (combined score > line),
 * false if the UNDER is winning (final score < line), null on push / no data.
 *
 * For live games this compares the running total to the locked pregame O/U,
 * so it answers "is this game already over the number?" Until the running
 * total has cleared the line we don't claim either side — too early to tell.
 */
export function totalGoingOver(game: Game): boolean | null {
  if (!game.trend) return null;
  if (game.status !== "live" && game.status !== "final") return null;
  const homeScore = game.home.score ?? 0;
  const awayScore = game.away.score ?? 0;
  const total = homeScore + awayScore;
  if (game.status === "final") {
    if (total === game.trend.total) return null;
    return total > game.trend.total;
  }
  // Live: once the running total has cleared the line, Over is a lock.
  // Until then we don't claim either side — too early to tell.
  if (total > game.trend.total) return true;
  return null;
}

import { etDateKey } from "./time";

/** Today in US Eastern time, as "YYYY-MM-DD". */
export function todayKey(d = new Date()): string {
  return etDateKey(d);
}

export function summarizeDay(games: Game[]): { publicWins: number; vegasWins: number; pushes: number } {
  let publicWins = 0, vegasWins = 0, pushes = 0;
  for (const g of games) {
    if (g.status !== "final" || !g.finalResult) continue;
    const c = g.finalResult.publicCovered;
    if (c === null) pushes++;
    else if (c) publicWins++;
    else vegasWins++;
  }
  return { publicWins, vegasWins, pushes };
}
