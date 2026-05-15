export type League = "nba" | "mlb" | "nfl" | "nhl";

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

  pickedSide: Side;        // favored side (derived from spread)

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
  finalResult?: {
    winnerSide: Side;
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

export type BetCategory = "ats" | "total";

export type AtsWinner = "public" | "vegas";
export type TotalWinner = "over" | "under";

export interface CategoryStreak<W extends string> {
  current: W | null;
  count: number;
  lastNotifiedCount: number;
  history: { date: string; winner: W }[];
}

export interface LeagueStreaks {
  ats: CategoryStreak<AtsWinner>;
  total: CategoryStreak<TotalWinner>;
}

export interface DailyRecord {
  date: string;
  publicWins: number;
  vegasWins: number;
  pushes: number;
  games: string[];
}

export interface DataStore {
  games: Game[];
  history: DailyRecord[];
  streak: StreakState;
  streaks?: Partial<Record<League, LeagueStreaks>>;
  lastUpdated: string;
}
