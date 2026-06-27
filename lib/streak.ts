import type {
  AtsWinner,
  BetCategory,
  CategoryStreak,
  Game,
  League,
  LeagueStreaks,
  MoneylineWinner,
  TotalWinner,
} from "./types";
import { totalFavoriteSide } from "./calc";
import { etDateKeyOf, etKickoffLabel } from "./time";

export const LEAGUES_ALL: League[] = ["nba", "wnba", "mlb", "nfl", "nhl"];

/**
 * Lowest "hot streak" count that triggers an email at every step: 4, 5, 6, …
 */
export const MIN_NOTIFY_COUNT = 4;

/**
 * The client also wants a single early "heads up" the moment a streak reaches 2
 * — but explicitly NOT at 3 ("just 2, not 3"). So the full set of counts that
 * email is {2} ∪ {4, 5, 6, …}; 1 and 3 stay silent.
 */
export const EARLY_NOTIFY_COUNT = 2;

function shouldNotifyAt(n: number): boolean {
  return n === EARLY_NOTIFY_COUNT || n >= MIN_NOTIFY_COUNT;
}

/**
 * Milestone counts to email this run: every not-yet-notified count between
 * lastNotifiedCount+1 and count that qualifies (2, or 4+). Walking each step
 * (rather than just the top) means a multi-game jump still emits each milestone
 * exactly once, and the 3-step is skipped silently.
 */
function notifyMilestones<W extends string>(streak: CategoryStreak<W>): number[] {
  const out: number[] = [];
  for (let n = streak.lastNotifiedCount + 1; n <= streak.count; n++) {
    if (shouldNotifyAt(n)) out.push(n);
  }
  return out;
}

function emptyCategory<W extends string>(): CategoryStreak<W> {
  return { current: null, count: 0, lastNotifiedCount: 0, history: [] };
}

export function emptyLeagueStreaks(): LeagueStreaks {
  return {
    ats: emptyCategory<AtsWinner>(),
    total: emptyCategory<TotalWinner>(),
    moneyline: emptyCategory<MoneylineWinner>(),
  };
}

export function getLeagueStreaks(
  streaks: Partial<Record<League, LeagueStreaks>> | undefined,
  league: League,
): LeagueStreaks {
  const existing = streaks?.[league];
  if (!existing) return emptyLeagueStreaks();
  // Backfill any category missing from older stored data (e.g. streaks written
  // before the moneyline category existed) so the rest of the pipeline can
  // assume all three categories are present.
  return {
    ats: existing.ats ?? emptyCategory<AtsWinner>(),
    total: existing.total ?? emptyCategory<TotalWinner>(),
    moneyline: existing.moneyline ?? emptyCategory<MoneylineWinner>(),
  };
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

  // Moneyline streak: did the betting favorite (pickedSide) win the game
  // outright ("public") or did the underdog win outright ("vegas")? No push —
  // every final has a straight-up winner. Requires a locked trend so we know
  // which side was favored pregame.
  const favSide = game.trend?.pickedSide;
  if (favSide) {
    const favWon = game.finalResult.winnerSide === favSide;
    const w: MoneylineWinner = favWon ? "public" : "vegas";
    const updated = applyWinner(next.moneyline, game, w, today);
    if (updated) next = { ...next, moneyline: updated };
  }
  return next;
}

/** Game id embedded in a streak history key ("YYYY-MM-DD:eventId"). */
function streakHistoryGameId(date: string): string {
  return date.split(":").slice(1).join(":");
}

// Per-category winner of a single confirmed final, or null when it doesn't
// count toward a streak (push, or a missing line so it can't be graded). These
// mirror the verdicts in applyGameToLeagueStreaks so the recompute below and the
// legacy incremental path agree.
export function atsWinnerOf(g: Game): AtsWinner | null {
  const c = g.finalResult?.publicCovered;
  if (c === null || c === undefined) return null;
  return c ? "public" : "vegas";
}

export function totalWinnerOf(g: Game): TotalWinner | null {
  const over = g.finalResult?.totalGoOver;
  const fav = totalFavoriteSide(g.trend);
  if (over === null || over === undefined || fav === null) return null;
  const favWon = fav === (over ? "over" : "under");
  return favWon ? "public" : "vegas";
}

export function moneylineWinnerOf(g: Game): MoneylineWinner | null {
  const favSide = g.trend?.pickedSide;
  const winnerSide = g.finalResult?.winnerSide;
  if (!favSide || !winnerSide) return null;
  return winnerSide === favSide ? "public" : "vegas";
}

/**
 * Recompute a category streak from the games it has already counted plus any
 * newly-confirmed finals, re-grading each against its CURRENT stored score.
 *
 * This replaces the old "append once, then freeze" logic. The freeze meant a
 * game graded off a wrong score (e.g. a still-in-progress 2-1 the feed flagged
 * as final, when the real final was 12-3) stayed wrong forever — wrongly
 * extending the streak — even after the stored score corrected. Re-grading every
 * refresh lets such a verdict self-heal: the streak follows the corrected score.
 *
 * Scope is deliberately "history ∪ new confirmed finals", NOT the entire store,
 * so backfilled historical games (which never fed streaks) don't suddenly get
 * pulled in.
 *
 * `prev.lastNotifiedCount` is preserved so each milestone still emails exactly
 * once. When the streak shrinks or flips side (a correction, or the first run
 * under this logic) lastNotifiedCount is pinned to the new count so a now-shorter
 * streak is never re-emailed.
 */
export function updateCategoryStreak<W extends string>(
  prev: CategoryStreak<W>,
  confirmedFinals: Game[],
  gamesById: Map<string, Game>,
  winnerOf: (g: Game) => W | null,
): CategoryStreak<W> {
  const ids = new Set<string>();
  for (const h of prev.history) ids.add(streakHistoryGameId(h.date));
  for (const g of confirmedFinals) ids.add(g.id);

  const graded: { g: Game; w: W }[] = [];
  for (const id of ids) {
    const g = gamesById.get(id);
    if (!g) continue;
    const w = winnerOf(g);
    if (w === null) continue;
    graded.push({ g, w });
  }
  graded.sort((a, b) => {
    const t = new Date(a.g.startTime).getTime() - new Date(b.g.startTime).getTime();
    if (t !== 0) return t;
    return a.g.id < b.g.id ? -1 : a.g.id > b.g.id ? 1 : 0;
  });

  // Current streak = trailing run of identical winners, walking newest → older.
  let current: W | null = null;
  let count = 0;
  for (let i = graded.length - 1; i >= 0; i--) {
    const w = graded[i].w;
    if (count === 0) {
      current = w;
      count = 1;
    } else if (w === current) {
      count += 1;
    } else break;
  }

  const tail = count > 0 ? graded.slice(graded.length - count) : [];
  const history = tail
    .reverse()
    .slice(0, 50)
    .map(({ g, w }) => ({ date: `${etDateKeyOf(g.startTime)}:${g.id}`, winner: w }));

  const lastNotifiedCount =
    current !== null && current === prev.current
      ? Math.min(prev.lastNotifiedCount, count)
      : count;

  return { current, count, lastNotifiedCount, history };
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
    if (category === "moneyline") {
      // Moneyline: the betting favorite is "public". Show the favored team, its
      // ML price, the final score, and the straight-up outcome.
      const favSide = g.trend?.pickedSide;
      const fav = favSide === "home" ? g.home : favSide === "away" ? g.away : null;
      const favOdds =
        favSide === "home" ? g.trend?.mlOddsHome : favSide === "away" ? g.trend?.mlOddsAway : null;
      const publicLabel = fav
        ? `Public: ${fav.abbr} ML${favOdds ? ` (${favOdds})` : ""}`
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
  if (category === "moneyline") {
    const favSide = g.trend?.pickedSide;
    const fav = favSide === "home" ? g.home : favSide === "away" ? g.away : null;
    const favOdds =
      favSide === "home" ? g.trend?.mlOddsHome : favSide === "away" ? g.trend?.mlOddsAway : null;
    const publicLabel = fav
      ? `Public: ${fav.abbr} ML${favOdds ? ` (${favOdds})` : ""}`
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
 * Emit one email per milestone (2, then 4, 5, 6, …) between lastNotifiedCount+1
 * and streak.count. If multiple games finalize between cron ticks and the streak
 * jumps several steps at once, every qualifying milestone still gets its own
 * alert; the 1- and 3-streaks stay silent.
 */
export function buildAtsEmails(
  league: League,
  streak: CategoryStreak<AtsWinner>,
  gamesById: Map<string, Game>,
  nextGame?: Game | null,
): StreakEmail[] {
  const out: StreakEmail[] = [];
  for (const n of notifyMilestones(streak)) {
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
  for (const n of notifyMilestones(streak)) {
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

export function buildMoneylineEmails(
  league: League,
  streak: CategoryStreak<MoneylineWinner>,
  gamesById: Map<string, Game>,
  nextGame?: Game | null,
): StreakEmail[] {
  const out: StreakEmail[] = [];
  for (const n of notifyMilestones(streak)) {
    const side = streak.current?.toUpperCase();
    const header = `${league.toUpperCase()} MONEYLINE — ${side} has won ${n} bets in a row (straight up).`;
    out.push({
      league,
      category: "moneyline",
      subject: `Fade The Money — ${league.toUpperCase()} ${streak.current} on a ${n}-game moneyline streak`,
      text: withNextGame([header, "", ...buildLines("moneyline", streak, gamesById, n)], "moneyline", nextGame),
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
