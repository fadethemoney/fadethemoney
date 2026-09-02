export type League = "nba" | "wnba" | "mlb" | "nfl" | "nhl" | "ncaab" | "ncaaf";

export type GameStatus = "scheduled" | "live" | "final";

export type Side = "home" | "away";

export interface Team {
  id: string;
  name: string;
  abbr: string;
  score?: number;
}

/**
 * Odds-only betting trend, sourced from SportsGameOdds.com.
 *
 * `pickedSide` is the favored side derived from the spread sign (home <= 0).
 * The streak / "covering" logic tracks whether the favorite covers vs. the
 * underdog covers, since we no longer have public-action splits.
 */
export interface BettingTrend {
  spread: number;          // home spread (e.g. -3.5)
  total: number;           // O/U

  mlOddsHome: string | null;
  mlOddsAway: string | null;

  spreadOddsHome: string | null;
  spreadOddsAway: string | null;

  totalOddsOver: string | null;
  totalOddsUnder: string | null;

  /**
   * Favored side (derived from spread). Optional because the Phase 3 free
   * tier has it stripped server-side before render — see lib/paywall.ts.
   * Absent means "not entitled to see it", never "no favorite".
   */
  pickedSide?: Side;

  openingSpread?: number;
  openingTotal?: number;

  source: "sportsgameodds";
  trendUpdatedAt: string;
}

export interface Game {
  id: string;
  league: League;
  startTime: string;
  status: GameStatus;
  period?: string;
  home: Team;
  away: Team;
  trend?: BettingTrend;
  publicCovering?: boolean | null; // null = push / unknown; true = favorite covers
  /**
   * True once we've seen this game reported final with a stable box score across
   * at least two refreshes. Streaks only grade confirmed finals — this guards
   * against the odds feed flagging a game final while its score is still catching
   * up to the true final (a mid-game number sent as if final). Set in
   * upsertGames (lib/storage.ts).
   */
  confirmedFinal?: boolean;
  /**
   * True when the odds feed reports the game's results as FINALIZED (official),
   * not merely "completed". Useful as a fast path, but NOT something grading can
   * wait on: the feed sets it 1-4 hours after the last out, staggered per game.
   * Set from status.finalized in lib/sportsgameodds.ts.
   */
  finalized?: boolean;
  /**
   * True when every period of the game has actually ended (feed reports
   * ended + not live + whole-game markers in periods.ended). This lands the
   * moment the game is over, so it — not `finalized` — is what lets a final be
   * confirmed and graded promptly. See periodsComplete in lib/sportsgameodds.ts.
   */
  periodsComplete?: boolean;
  /**
   * When we FIRST saw this game reported final with the score it currently
   * shows, ISO. Reset whenever the score moves, so it measures how long the box
   * score has been settled rather than how long the game has read "Final".
   * Set in upsertGames (lib/storage.ts).
   */
  finalSince?: string;
  /** Score ("away-home") observed at finalSince, so a moving box score resets it. */
  finalScoreKey?: string;
  finalResult?: {
    // "tie" = a genuine draw (only the NFL regular season can tie). Kept as its
    // own value so a tie is NOT silently collapsed into an "away" win — the
    // moneyline grader treats it as a no-decision (null), like an ATS/Total push.
    winnerSide: Side | "tie";
    margin: number;
    publicCovered: boolean | null; // true = favorite covered; preserves storage shape
    totalGoOver: boolean | null;
  };
  updatedAt: string;
}

export interface StreakState {
  current: "public" | "vegas" | null; // "public" = favorite covered; "vegas" = underdog covered
  count: number;
  lastNotifiedCount: number;
  history: { date: string; winner: "public" | "vegas" }[];
}

export type BetCategory = "ats" | "total" | "moneyline";

export type AtsWinner = "public" | "vegas";

// Moneyline streak tracks favorite-vs-dog on the straight-up result. The client
// confirmed "betting favorites is public": the favorite (pickedSide, derived
// from the spread) winning the game outright is a "public" win; the underdog
// winning outright is a "vegas" win. A draw (NFL regular-season tie) is a
// no-decision — graded null, same as an ATS/Total push — and does not touch the
// streak. Same shape as AtsWinner so all three categories read identically.
export type MoneylineWinner = "public" | "vegas";
// Totals streak tracks favorite-vs-dog on the total, NOT over-vs-under — the
// client cares whether the juice-favorite side keeps winning, not whether the
// game went Over five nights running. The favorite side of the total (over or
// under) is the juice favorite from totalOddsOver / totalOddsUnder — see
// totalFavoriteSide in lib/calc.ts. "public" = favorite side won; "vegas" =
// dog side won. Same shape as AtsWinner so spreads + totals read identically.
export type TotalWinner = "public" | "vegas";

export interface CategoryStreak<W extends string> {
  current: W | null;
  count: number;
  lastNotifiedCount: number;
  history: { date: string; winner: W }[];
}

export interface LeagueStreaks {
  ats: CategoryStreak<AtsWinner>;
  total: CategoryStreak<TotalWinner>;
  moneyline: CategoryStreak<MoneylineWinner>;
}

export interface DailyRecord {
  date: string;
  publicWins: number;
  vegasWins: number;
  pushes: number;
  games: string[];
}

/**
 * Persisted state machine for the SportsGameOdds fetch-outage alert.
 *
 * The first version emailed on the FIRST failing tick and cleared on the FIRST
 * clean one. That only deduped a *sustained* outage; a league that flaps (mlb,
 * 2026-08-11) produced a FAILING + RECOVERED pair per hiccup, to every admin,
 * on a 2-minute cron. Now a failure must persist for FETCH_ALERT_FAIL_TICKS
 * consecutive ticks before anyone is paged, the recovery notice needs
 * FETCH_ALERT_OK_TICKS clean ticks AND an alert that actually went out, and a
 * league that drops out again right after recovering is treated as flapping
 * rather than as a new outage (see app/api/refresh/route.ts).
 */
export interface FetchAlertState {
  leagues: string[];        // sorted leagues failing on the latest failing tick
  failingSince: string;     // ISO: first tick of the current failing run
  failStreak: number;       // consecutive ticks this set has failed (0 = healthy)
  okStreak: number;         // consecutive clean ticks since the last failure
  alertedAt: string | null; // ISO of the last FAILING email; null = never paged
  alertedLeagues: string[]; // the failing set that email named
  clearedAt: string | null; // ISO of the last RECOVERED email (re-fail cooldown)
}

export interface DataStore {
  games: Game[];
  history: DailyRecord[];
  streak: StreakState;
  streaks?: Partial<Record<League, LeagueStreaks>>;
  /**
   * Advisory lease so two overlapping cron invocations (Vercel cron is
   * best-effort and can double-fire) don't run the refresh pipeline at once and
   * clobber each other's Blob writes or double-send a milestone email. Set in
   * acquireLease / cleared in releaseLease (lib/storage.ts). Self-expires.
   */
  lock?: { holder: string; expiresAt: string } | null;
  fetchAlert?: FetchAlertState | null;
  lastUpdated: string;
}
