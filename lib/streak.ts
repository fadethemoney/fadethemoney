import type {
  AtsWinner,
  BetCategory,
  CategoryStreak,
  Game,
  League,
  LeagueStreaks,
  TotalWinner,
} from "./types";
import { totalFavoriteSide } from "./calc";
import { etKickoffLabel } from "./time";

export const LEAGUES_ALL: League[] = ["nba", "wnba", "mlb", "nfl", "nhl"];

/**
 * Lowest streak count that triggers an email. The client only wants alerts once
 * a streak is *after 3* (i.e. 4+), so 2- and 3-streaks stay silent and they get
 * far fewer emails for the same league/games.
 */
export const MIN_NOTIFY_COUNT = 4;

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

  // Totals streak: track whether the juice-favorite side of the total won,
  // not whether it was Over or Under. Favorite covered → "public"; dog → "vegas".
  const over = game.finalResult.totalGoOver;
  const totalFav = totalFavoriteSide(game.trend);
  if (over !== null && totalFav !== null) {
    const favWon = totalFav === (over ? "over" : "under");
    const w: TotalWinner = favWon ? "public" : "vegas";
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
    // Totals: track whether the juice-favorite side of the total won. Show the
    // locked pregame O/U, the favorite side, the final score, and the outcome.
    const total = g.trend?.total;
    const totalStr = typeof total === "number" ? ` ${total}` : "";
    const fav = totalFavoriteSide(g.trend);
    const favStr = fav ? `, Fav ${fav.toUpperCase()}` : "";
    const score =
      typeof g.home.score === "number" && typeof g.away.score === "number"
        ? ` ${g.away.score}-${g.home.score}`
        : "";
    const outcome = h.winner === "public" ? "PUBLIC WIN ✓" : "VEGAS WIN ✗";
    return `• ${g.league.toUpperCase()} — ${matchup}${score} — Total${totalStr}${favStr} → ${outcome}`;
  });
}

/**
 * Format the "Next up" line for an email: the next scheduled game in the
 * league that has NOT started yet, with its Public/favorite side. For ATS we
 * show the favored team + spread; for totals the locked O/U + favorite side.
 * Returns null when there is no upcoming game to show.
 */
function nextGameLine(category: BetCategory, g: Game | null | undefined): string | null {
  if (!g) return null;
  const matchup = `${g.away.abbr} @ ${g.home.abbr}`;
  const when = ` (${etKickoffLabel(g.startTime)})`;
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
    return `Next up: ${g.league.toUpperCase()} — ${matchup}${when} — ${publicLabel}`;
  }
  const total = g.trend?.total;
  const totalStr = typeof total === "number" ? ` ${total}` : "";
  const fav = totalFavoriteSide(g.trend);
  const favStr = fav ? `, Fav ${fav.toUpperCase()}` : "";
  return `Next up: ${g.league.toUpperCase()} — ${matchup}${when} — Total${totalStr}${favStr}`;
}

function withNextGame(lines: string[], category: BetCategory, nextGame: Game | null | undefined): string {
  const next = nextGameLine(category, nextGame);
  const tail = next ? ["", next] : ["", "Next up: no upcoming game scheduled yet."];
  return [...lines, ...tail].join("\n");
}

/**
 * Emit one email per milestone (4, 5, 6, …) between lastNotifiedCount+1 and
 * streak.count. If multiple games finalize between cron ticks and the streak
 * jumps several steps at once, every milestone still gets its own alert.
 */
export function buildAtsEmails(
  league: League,
  streak: CategoryStreak<AtsWinner>,
  gamesById: Map<string, Game>,
  nextGame?: Game | null,
): StreakEmail[] {
  const out: StreakEmail[] = [];
  const start = Math.max(MIN_NOTIFY_COUNT, streak.lastNotifiedCount + 1);
  for (let n = start; n <= streak.count; n++) {
    const side = streak.current?.toUpperCase();
    const header = `${league.toUpperCase()} SPREAD — ${side} has won ${n} bets in a row (ATS).`;
    out.push({
      league,
      category: "ats",
      subject: `Fade The Money — ${league.toUpperCase()} ${streak.current} on a ${n}-game spread streak`,
      text: withNextGame([header, "", ...buildLines("ats", streak, gamesById, n)], "ats", nextGame),
      newLastNotifiedCount: n,
    });
  }
  return out;
}

export function buildTotalEmails(
  league: League,
  streak: CategoryStreak<TotalWinner>,
  gamesById: Map<string, Game>,
  nextGame?: Game | null,
): StreakEmail[] {
  const out: StreakEmail[] = [];
  const start = Math.max(MIN_NOTIFY_COUNT, streak.lastNotifiedCount + 1);
  for (let n = start; n <= streak.count; n++) {
    const side = streak.current?.toUpperCase();
    const header = `${league.toUpperCase()} TOTAL — ${side} has won ${n} totals in a row.`;
    out.push({
      league,
      category: "total",
      subject: `Fade The Money — ${league.toUpperCase()} ${side} on a ${n}-total streak (totals)`,
      text: withNextGame([header, "", ...buildLines("total", streak, gamesById, n)], "total", nextGame),
      newLastNotifiedCount: n,
    });
  }
  return out;
}

/**
 * The next scheduled game in a league that has NOT started yet, by earliest
 * start time. Excludes live/final games — the client wants the next game
 * "about to start, not any game that has already started."
 */
export function findNextGame(games: Game[], league: League, now = Date.now()): Game | null {
  const upcoming = games
    .filter((g) => g.league === league && g.status === "scheduled")
    .filter((g) => new Date(g.startTime).getTime() > now)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  return upcoming[0] ?? null;
}
