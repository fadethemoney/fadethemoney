import type { DataStore, Game, StreakState } from "@/lib/types";

/**
 * Phase 3 — free-tier redaction.
 *
 * The paywall is a *data* lock, not a CSS blur: these helpers run on the
 * server and strip the paid fields before the store ever reaches a client
 * component, the RSC payload or /api/games. A non-member's browser never
 * receives the pick, so there is nothing to un-hide in devtools.
 *
 * What free visitors keep (per the agreed free/paid split):
 *   - every game, team, start time, score and status
 *   - the full odds board: moneyline, spread, total and their prices
 *   - finished games with their result, on the home page and /results —
 *     past performance is the marketing, so it stays public
 *
 * What members pay for:
 *   - the pick indicators on games still in play (which side is "Public",
 *     which side of the total is the juice favorite, live cover verdicts)
 *   - streak state: what is running, how long, and per-league detail
 *   - the streak alert emails those streaks trigger
 */

const EMPTY_STREAK: StreakState = {
  current: null,
  count: 0,
  lastNotifiedCount: 0,
  history: [],
};

/**
 * Strip pick data from a single game. Finished games pass through untouched;
 * anything still to come (or in progress) loses the favored side, which is
 * what every downstream verdict is computed from.
 */
export function redactGameForFreeTier(game: Game): Game {
  if (game.status === "final") return game;

  const { publicCovering: _dropped, ...rest } = game;
  if (!game.trend) return rest as Game;

  const { pickedSide: _pick, ...trend } = game.trend;
  return { ...rest, trend } as Game;
}

/** Store-wide redaction: per-game picks plus all streak state. */
export function redactStoreForFreeTier(store: DataStore): DataStore {
  return {
    ...store,
    games: store.games.map(redactGameForFreeTier),
    streak: EMPTY_STREAK,
    streaks: {},
  };
}
