import type { Game } from "./types";
import type { ScrapedMatchup } from "./sportsbettingdime";
import { publicCovering } from "./calc";

export function attachFinalResult(g: Game): Game {
  if (g.status !== "final" || !g.trend || g.finalResult) return g;
  const homeScore = g.home.score ?? 0;
  const awayScore = g.away.score ?? 0;
  const margin = homeScore + g.trend.spread - awayScore;
  const totalScored = homeScore + awayScore;
  const next: Game = { ...g };
  next.publicCovering = publicCovering(next);
  next.finalResult = {
    winnerSide: homeScore > awayScore ? "home" : "away",
    margin: Math.abs(homeScore - awayScore),
    publicCovered: margin === 0 ? null : next.publicCovering ?? null,
    totalGoOver:
      totalScored === g.trend.total ? null : totalScored > g.trend.total,
  };
  return next;
}

export function mergeTrends(games: Game[], trends: ScrapedMatchup[]): Game[] {
  return games.map((g) => {
    // SBD's feed only contains upcoming matchups. Don't merge new SBD trends
    // onto a final game — but DO still derive finalResult from whatever trend
    // we already had at game time.
    if (g.status === "final") return attachFinalResult(g);

    const match = trends.find(
      (t) => t.homeAbbr === g.home.abbr && t.awayAbbr === g.away.abbr,
    );
    if (!match) return g;
    const next: Game = { ...g, trend: match.trend };
    next.publicCovering = publicCovering(next);
    return next;
  });
}
