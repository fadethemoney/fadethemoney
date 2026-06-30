import type { Game } from "./types";
import { publicCovering } from "./calc";

/**
 * Compute finalResult against the trend currently on the game. Must be called
 * AFTER the trend has been locked to the pregame value (see upsertGames in
 * lib/storage.ts) — otherwise totalGoOver/publicCovered get computed against a
 * live, in-game-adjusted line and produce the wrong verdict (e.g. a game that
 * scores 11 against a pregame O/U of 8.5 gets tagged UNDER because the live
 * total moved up to 11.5).
 *
 * Idempotent: always recomputes, even if finalResult already existed. This
 * lets a refresh repair previously-corrupted verdicts after the trend is
 * locked correctly.
 */
export function attachFinalResult(g: Game): Game {
  if (g.status !== "final" || !g.trend) return g;
  const homeScore = g.home.score ?? 0;
  const awayScore = g.away.score ?? 0;
  const margin = homeScore + g.trend.spread - awayScore;
  const totalScored = homeScore + awayScore;
  const next: Game = { ...g };
  next.publicCovering = publicCovering(next);
  next.finalResult = {
    // Three-way: a draw (e.g. an NFL regular-season 17-17 OT tie) is its own
    // value, not silently collapsed into an "away" win. margin === 0 on a tie,
    // so ATS/Totals already null out the push; the moneyline grader skips "tie".
    winnerSide:
      homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "tie",
    margin: Math.abs(homeScore - awayScore),
    publicCovered: margin === 0 ? null : next.publicCovering ?? null,
    totalGoOver:
      totalScored === g.trend.total ? null : totalScored > g.trend.total,
  };
  return next;
}

/**
 * Pre-upsert pass: only set the live publicCovering indicator. Do NOT attach
 * finalResult here — the incoming trend is the live line, not the locked
 * pregame line, and computing finalResult against it produces wrong verdicts.
 * finalResult is attached after upsertGames in the refresh route, against the
 * locked trend.
 */
export function finalizeGames(games: Game[]): Game[] {
  return games.map((g) => {
    const next: Game = { ...g };
    next.publicCovering = publicCovering(next);
    return next;
  });
}
