import type { Game } from "./types";
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

export function finalizeGames(games: Game[]): Game[] {
  return games.map((g) => {
    if (g.status === "final") return attachFinalResult(g);
    const next: Game = { ...g };
    next.publicCovering = publicCovering(next);
    return next;
  });
}
