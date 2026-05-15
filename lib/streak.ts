import type {
  AtsWinner,
  BetCategory,
  CategoryStreak,
  Game,
  League,
  LeagueStreaks,
  TotalWinner,
} from "./types";

export const LEAGUES_ALL: League[] = ["nba", "mlb", "nfl", "nhl"];

function emptyCategory<W extends string>(): CategoryStreak<W> {
  return { current: null, count: 0, lastNotifiedCount: 0, history: [] };
}

export function emptyLeagueStreaks(): LeagueStreaks {
  return { ats: emptyCategory<AtsWinner>(), total: emptyCategory<TotalWinner>() };
}

export function getLeagueStreaks(
  streaks: Partial<Record<League, LeagueStreaks>> | undefined,
  league: League,
): LeagueStreaks {
  return streaks?.[league] ?? emptyLeagueStreaks();
}

function applyWinner<W extends string>(
  streak: CategoryStreak<W>,
  game: Game,
  winner: W,
  today: string,
): CategoryStreak<W> | null {
  const key = `${today}:${game.id}`;
  if (streak.history.find((h) => h.date === key)) return null;
  const next: CategoryStreak<W> = {
    current: streak.current,
    count: streak.count,
    lastNotifiedCount: streak.lastNotifiedCount,
    history: streak.history.slice(),
  };
  if (next.current === winner) next.count += 1;
  else {
    next.current = winner;
    next.count = 1;
    next.lastNotifiedCount = 0;
  }
  next.history.unshift({ date: key, winner });
  next.history = next.history.slice(0, 50);
  return next;
}

/** Apply a final game to a league's ATS + Total streaks. Returns updated pair. */
export function applyGameToLeagueStreaks(
  streaks: LeagueStreaks,
  game: Game,
  today: string,
): LeagueStreaks {
  if (game.status !== "final" || !game.finalResult) return streaks;
  let next = streaks;

  const covered = game.finalResult.publicCovered;
  if (covered !== null) {
    const w: AtsWinner = covered ? "public" : "vegas";
    const updated = applyWinner(next.ats, game, w, today);
    if (updated) next = { ...next, ats: updated };
  }

  const over = game.finalResult.totalGoOver;
  if (over !== null) {
    const w: TotalWinner = over ? "over" : "under";
    const updated = applyWinner(next.total, game, w, today);
    if (updated) next = { ...next, total: updated };
  }
  return next;
}

export interface StreakEmail {
  league: League;
  category: BetCategory;
  subject: string;
  text: string;
  newLastNotifiedCount: number;
}

function buildLines<W extends string>(
  category: BetCategory,
  streak: CategoryStreak<W>,
  gamesById: Map<string, Game>,
): string[] {
  const contributing = streak.history.slice(0, streak.count);
  return contributing.map((h) => {
    const id = h.date.split(":").slice(1).join(":");
    const g = gamesById.get(id);
    if (!g) return `• (game ${id})`;
    const matchup = `${g.away.abbr} @ ${g.home.abbr}`;
    if (category === "ats") {
      const favSide = g.trend?.pickedSide;
      const fav = favSide === "home" ? g.home : favSide === "away" ? g.away : null;
      const dog = favSide === "home" ? g.away : favSide === "away" ? g.home : null;
      const covered = h.winner === "public" ? fav : dog;
      const homeSpread = g.trend?.spread;
      let spreadStr = "";
      if (typeof homeSpread === "number" && favSide) {
        const favSpread = favSide === "home" ? homeSpread : -homeSpread;
        const shown = h.winner === "public" ? favSpread : -favSpread;
        spreadStr = ` ${shown > 0 ? "+" : ""}${shown}`;
      }
      const coveredName = covered?.abbr ?? (h.winner === "public" ? "favorite" : "underdog");
      return `• ${g.league.toUpperCase()} — ${matchup} → ${coveredName} covered${spreadStr}`;
    }
    const total = g.trend?.total;
    const totalStr = typeof total === "number" ? ` (O/U ${total})` : "";
    const score =
      typeof g.home.score === "number" && typeof g.away.score === "number"
        ? ` ${g.away.score}-${g.home.score}`
        : "";
    return `• ${g.league.toUpperCase()} — ${matchup}${score} → ${h.winner.toUpperCase()}${totalStr}`;
  });
}

export function buildAtsEmail(
  league: League,
  streak: CategoryStreak<AtsWinner>,
  gamesById: Map<string, Game>,
): StreakEmail | null {
  if (streak.count < 2 || streak.count <= streak.lastNotifiedCount) return null;
  const side = streak.current?.toUpperCase();
  const header = `${league.toUpperCase()} SPREAD — ${side} has won ${streak.count} bets in a row (ATS).`;
  return {
    league,
    category: "ats",
    subject: `Fade The Money — ${league.toUpperCase()} ${streak.current} on a ${streak.count}-game spread streak`,
    text: [header, "", ...buildLines("ats", streak, gamesById)].join("\n"),
    newLastNotifiedCount: streak.count,
  };
}

export function buildTotalEmail(
  league: League,
  streak: CategoryStreak<TotalWinner>,
  gamesById: Map<string, Game>,
): StreakEmail | null {
  if (streak.count < 2 || streak.count <= streak.lastNotifiedCount) return null;
  const side = streak.current?.toUpperCase();
  const header = `${league.toUpperCase()} TOTAL — ${side} has hit ${streak.count} games in a row (O/U).`;
  return {
    league,
    category: "total",
    subject: `Fade The Money — ${league.toUpperCase()} ${streak.current} on a ${streak.count}-game total streak`,
    text: [header, "", ...buildLines("total", streak, gamesById)].join("\n"),
    newLastNotifiedCount: streak.count,
  };
}
