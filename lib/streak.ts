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
  upToCount: number = streak.count,
): string[] {
  const contributing = streak.history.slice(0, upToCount);
  return contributing.map((h) => {
    const id = h.date.split(":").slice(1).join(":");
    const g = gamesById.get(id);
    if (!g) return `• (game ${id})`;
    const matchup = `${g.away.abbr} @ ${g.home.abbr}`;
    if (category === "ats") {
      const favSide = g.trend?.pickedSide;
      const fav = favSide === "home" ? g.home : favSide === "away" ? g.away : null;
      const homeSpread = g.trend?.spread;
      const favSpread =
        typeof homeSpread === "number" && favSide
          ? favSide === "home"
            ? homeSpread
            : -homeSpread
          : null;
      const publicLabel = fav
        ? `Public: ${fav.abbr}${favSpread !== null ? ` ${favSpread > 0 ? "+" : ""}${favSpread}` : ""}`
        : "Public: —";
      const score =
        typeof g.home.score === "number" && typeof g.away.score === "number"
          ? ` ${g.away.score}-${g.home.score}`
          : "";
      const outcome = h.winner === "public" ? "PUBLIC WIN ✓" : "VEGAS WIN ✗";
      return `• ${g.league.toUpperCase()} — ${matchup}${score} — ${publicLabel} → ${outcome}`;
    }
    // Totals: track which side of the total won. Show the locked pregame O/U,
    // the final combined score, and which side cleared.
    const total = g.trend?.total;
    const totalStr = typeof total === "number" ? ` ${total}` : "";
    const score =
      typeof g.home.score === "number" && typeof g.away.score === "number"
        ? ` ${g.away.score}-${g.home.score}`
        : "";
    const overUnder = h.winner === "over" ? "OVER" : "UNDER";
    return `• ${g.league.toUpperCase()} — ${matchup}${score} — Total${totalStr} → ${overUnder} ✓`;
  });
}

/**
 * Emit one email per milestone (2, 3, 4, …) between lastNotifiedCount+1 and
 * streak.count. If multiple games finalize between cron ticks and the streak
 * jumps several steps at once, every milestone still gets its own alert.
 */
export function buildAtsEmails(
  league: League,
  streak: CategoryStreak<AtsWinner>,
  gamesById: Map<string, Game>,
): StreakEmail[] {
  const out: StreakEmail[] = [];
  const start = Math.max(2, streak.lastNotifiedCount + 1);
  for (let n = start; n <= streak.count; n++) {
    const side = streak.current?.toUpperCase();
    const header = `${league.toUpperCase()} SPREAD — ${side} has won ${n} bets in a row (ATS).`;
    out.push({
      league,
      category: "ats",
      subject: `Fade The Money — ${league.toUpperCase()} ${streak.current} on a ${n}-game spread streak`,
      text: [header, "", ...buildLines("ats", streak, gamesById, n)].join("\n"),
      newLastNotifiedCount: n,
    });
  }
  return out;
}

export function buildTotalEmails(
  league: League,
  streak: CategoryStreak<TotalWinner>,
  gamesById: Map<string, Game>,
): StreakEmail[] {
  const out: StreakEmail[] = [];
  const start = Math.max(2, streak.lastNotifiedCount + 1);
  for (let n = start; n <= streak.count; n++) {
    const side = streak.current?.toUpperCase();
    const header = `${league.toUpperCase()} TOTAL — ${side} has won ${n} totals in a row.`;
    out.push({
      league,
      category: "total",
      subject: `Fade The Money — ${league.toUpperCase()} ${side} on a ${n}-total streak`,
      text: [header, "", ...buildLines("total", streak, gamesById, n)].join("\n"),
      newLastNotifiedCount: n,
    });
  }
  return out;
}
