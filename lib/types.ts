export type League = "nba" | "mlb" | "nfl" | "nhl";

export type GameStatus = "scheduled" | "live" | "final";

export type Side = "home" | "away";

export interface Team {
  id: string;
  name: string;
  abbr: string;
  score?: number;
}

export type TotalSide = "over" | "under";

export interface BettingTrend {
  spread: number;          // home spread (e.g. -3.5)
  total: number;           // O/U

  // SPREAD splits — % of spread tickets on each side
  publicPctHome: number;   // 0-100
  publicPctAway: number;

  // MONEYLINE money — % of dollars on each team to win outright.
  // This is the "sharp action" signal the product is built around. SBD's
  // website displays this number next to the spread bet %, even though it's
  // a different market. We follow that convention.
  moneyPctHome: number;
  moneyPctAway: number;

  // MONEYLINE odds & ticket-count splits (full picture per side).
  mlOddsHome: string | null;   // e.g. "-150"
  mlOddsAway: string | null;   // e.g. "+125"
  mlBetPctHome: number;        // % of moneyline tickets on home
  mlBetPctAway: number;

  // Same numbers from the SPREAD market, kept for completeness/debug.
  // (% of dollars wagered on each side of the spread.)
  spreadMoneyPctHome: number;
  spreadMoneyPctAway: number;

  pickedSide: Side;        // public side (majority of spread bets)

  // Total / Over-Under — splits per side.
  totalSide: TotalSide | null;
  totalPublicPct: number;       // bet % on public total side (back-compat)
  totalMoneyPct: number;        // money % on public total side (back-compat)
  totalOverBetPct: number;
  totalUnderBetPct: number;
  totalOverMoneyPct: number;
  totalUnderMoneyPct: number;

  // Optional line-movement context (captured, not surfaced in UI yet)
  openingSpread?: number;
  openingTotal?: number;

  source: "sbd" | "synthetic";
  trendUpdatedAt: string;  // when the betting splits were last refreshed by the source
}

export interface Game {
  id: string;
  league: League;
  startTime: string;       // ISO
  status: GameStatus;
  period?: string;         // e.g. "Q3 4:21" / "Top 7"
  home: Team;
  away: Team;
  trend?: BettingTrend;
  publicCovering?: boolean | null; // null = push / unknown
  finalResult?: {
    winnerSide: Side;
    margin: number;
    publicCovered: boolean | null;
    totalGoOver: boolean | null;
  };
  updatedAt: string;
}

export interface StreakState {
  current: "public" | "vegas" | null;
  count: number;
  lastNotifiedCount: number;
  history: { date: string; winner: "public" | "vegas" }[];
}

export interface DailyRecord {
  date: string;            // YYYY-MM-DD
  publicWins: number;
  vegasWins: number;
  pushes: number;
  games: string[];         // game ids
}

export interface DataStore {
  games: Game[];
  history: DailyRecord[];
  streak: StreakState;
  lastUpdated: string;
}
