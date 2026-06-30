import type { Game, League, GameStatus, Team, BettingTrend, Side } from "./types";

/**
 * SportsGameOdds.com v2 API client.
 *
 * Auth: `apiKey` query param.
 * Base: https://api.sportsgameodds.com/v2/events
 *
 * We fetch events for a window around "today" per league, then collapse the
 * odds payload down to the slim shape the rest of the app expects.
 */

const BASE = "https://api.sportsgameodds.com/v2";

const LEAGUE_TO_API: Record<League, string> = {
  nba: "NBA",
  wnba: "WNBA",
  mlb: "MLB",
  nfl: "NFL",
  nhl: "NHL",
};

export class SportsGameOddsError extends Error {}

function apiKey(): string {
  const k = process.env.SPORTSGAMEODDS_API_KEY;
  if (!k) {
    throw new SportsGameOddsError(
      "SPORTSGAMEODDS_API_KEY is not set. Add it to .env.local and to Vercel env vars.",
    );
  }
  return k;
}

interface ApiEvent {
  eventID: string;
  sportID?: string;
  leagueID?: string;
  type?: string;
  teams?: {
    home?: ApiTeam;
    away?: ApiTeam;
  };
  status?: {
    startsAt?: string;
    started?: boolean;
    live?: boolean;
    completed?: boolean;
    finalized?: boolean;
    cancelled?: boolean;
    periodID?: string;
    displayShort?: string;
    displayLong?: string;
    oddsPresent?: boolean;
  };
  odds?: Record<string, ApiOdd>;
  results?: {
    game?: {
      home?: { points?: number; total?: number };
      away?: { points?: number; total?: number };
    };
  };
}

interface ApiTeam {
  teamID?: string;
  name?: string;
  longName?: string;
  shortName?: string;
  mascot?: string;
  abbreviation?: string;
  names?: { long?: string; medium?: string; short?: string };
  score?: number;
}

interface ApiOdd {
  oddID?: string;
  marketName?: string;
  statID?: string;
  statEntityID?: string;     // "all" (game) | "home" | "away" | a playerID (prop)
  betTypeID?: string;        // "ml" | "sp" | "ou"
  sideID?: string;           // "home" | "away" | "over" | "under"
  periodID?: string;         // "game" | "1q" | ...
  bookOddsAvailable?: boolean;
  bookSpreadAvailable?: boolean;
  bookOverUnderAvailable?: boolean;
  fairOdds?: string;
  bookOdds?: string;
  fairSpread?: string;
  bookSpread?: string;
  fairOverUnder?: string;
  bookOverUnder?: string;
  openFairOdds?: string;
  openBookOdds?: string;
  openFairSpread?: string;
  openBookSpread?: string;
  openFairOverUnder?: string;
  openBookOverUnder?: string;
}

interface ApiResponse {
  success?: boolean;
  data?: ApiEvent[];
  nextCursor?: string | null;
}

const MAX_429_RETRIES = 2;

async function fetchPage(
  params: URLSearchParams,
  attempt = 0,
): Promise<ApiResponse> {
  const url = `${BASE}/events/?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  // The API returns 429 with no Retry-After header; back off briefly and retry
  // so a transient burst past 300 req/min self-heals instead of dropping a
  // whole league for the cycle.
  if (res.status === 429 && attempt < MAX_429_RETRIES) {
    await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
    return fetchPage(params, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SportsGameOddsError(
      `SportsGameOdds ${res.status} ${res.statusText}: ${body.slice(0, 300)}`,
    );
  }
  return (await res.json()) as ApiResponse;
}

async function fetchEvents(params: URLSearchParams, max = 500): Promise<ApiEvent[]> {
  const events: ApiEvent[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const p = new URLSearchParams(params);
    if (cursor) p.set("cursor", cursor);
    const json = await fetchPage(p);
    if (Array.isArray(json.data)) events.push(...json.data);
    cursor = json.nextCursor ?? null;
    pages += 1;
  } while (cursor && events.length < max && pages < 10);
  return events;
}

function pickStatus(s: ApiEvent["status"]): GameStatus {
  if (!s) return "scheduled";
  if (s.completed || s.finalized) return "final";
  if (s.live || s.started) return "live";
  return "scheduled";
}

function pickPeriod(s: ApiEvent["status"]): string | undefined {
  return s?.displayShort || s?.displayLong || undefined;
}

function teamFrom(t: ApiTeam | undefined, fallback: string): Team {
  const id = t?.teamID ?? fallback;
  const abbr = (t?.abbreviation || t?.names?.short || t?.shortName || fallback)
    .toString()
    .toUpperCase()
    .slice(0, 4);
  const name =
    t?.names?.medium ||
    t?.names?.long ||
    t?.longName ||
    t?.name ||
    t?.mascot ||
    abbr;
  return { id, abbr, name, score: t?.score };
}

function parseNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtAmerican(v: string | number | null | undefined): string | null {
  const n = parseNum(v);
  if (n === null) return null;
  if (n > 0) return `+${Math.round(n)}`;
  return `${Math.round(n)}`;
}

/**
 * Pick the main full-game market for the given betType+side from the odds map.
 * SportsGameOdds keys odds by composite IDs that vary by sport, so we scan
 * rather than assume a fixed key shape.
 *
 * We pin BOTH statID "points" (the normalized scoring stat — runs/points/goals
 * — across all 5 leagues) AND the expected stat entity. Without the entity pin
 * we can match a player prop that shares betType/side/period: e.g. a "player
 * scores a run" O/U of 0.5 (statID "points", statEntityID = a playerID) gets
 * mistaken for the game total and a bogus 0.5 line freezes into the streak
 * (the TEX@CLE "Total 0.5" bug). The game total is the aggregate entity "all";
 * spreads/moneylines are per side (entity == sideID, home/away).
 */
function findOdd(
  odds: Record<string, ApiOdd> | undefined,
  betType: string,
  side: string,
): ApiOdd | null {
  if (!odds) return null;
  const wantEntity = betType === "ou" ? "all" : side;
  for (const o of Object.values(odds)) {
    if (o.periodID && o.periodID !== "game") continue;
    if (o.betTypeID !== betType) continue;
    if (o.sideID !== side) continue;
    if (o.statID !== "points") continue;
    if (o.statEntityID !== wantEntity) continue;
    return o;
  }
  return null;
}

function trendFromOdds(ev: ApiEvent): BettingTrend | undefined {
  if (!ev.status?.oddsPresent) return undefined;
  const spHome = findOdd(ev.odds, "sp", "home");
  const spAway = findOdd(ev.odds, "sp", "away");
  const mlHome = findOdd(ev.odds, "ml", "home");
  const mlAway = findOdd(ev.odds, "ml", "away");
  const ouOver = findOdd(ev.odds, "ou", "over");

  const spread =
    parseNum(spHome?.bookSpread) ??
    parseNum(spHome?.fairSpread) ??
    (parseNum(spAway?.bookSpread) !== null ? -(parseNum(spAway!.bookSpread)!) : null) ??
    (parseNum(spAway?.fairSpread) !== null ? -(parseNum(spAway!.fairSpread)!) : null);

  const total =
    parseNum(ouOver?.bookOverUnder) ??
    parseNum(ouOver?.fairOverUnder);

  if (spread === null || total === null) return undefined;

  const openingSpread =
    parseNum(spHome?.openBookSpread) ?? parseNum(spHome?.openFairSpread) ?? undefined;
  const openingTotal =
    parseNum(ouOver?.openBookOverUnder) ?? parseNum(ouOver?.openFairOverUnder) ?? undefined;

  const pickedSide: Side = spread <= 0 ? "home" : "away";

  return {
    spread,
    total,
    mlOddsHome: fmtAmerican(mlHome?.bookOdds ?? mlHome?.fairOdds),
    mlOddsAway: fmtAmerican(mlAway?.bookOdds ?? mlAway?.fairOdds),
    spreadOddsHome: fmtAmerican(spHome?.bookOdds ?? spHome?.fairOdds),
    spreadOddsAway: fmtAmerican(spAway?.bookOdds ?? spAway?.fairOdds),
    totalOddsOver: fmtAmerican(ouOver?.bookOdds ?? ouOver?.fairOdds),
    totalOddsUnder: fmtAmerican(findOdd(ev.odds, "ou", "under")?.bookOdds ?? findOdd(ev.odds, "ou", "under")?.fairOdds),
    pickedSide,
    openingSpread: openingSpread ?? undefined,
    openingTotal: openingTotal ?? undefined,
    source: "sportsgameodds",
    trendUpdatedAt: new Date().toISOString(),
  };
}

function toGame(ev: ApiEvent, league: League): Game | null {
  if (ev.status?.cancelled) return null;
  if (ev.type && ev.type !== "match") return null;
  const home = teamFrom(ev.teams?.home, "HOME");
  const away = teamFrom(ev.teams?.away, "AWAY");
  const status = pickStatus(ev.status);
  if (status !== "scheduled") {
    // Prefer the official settled result (results.game.*.points) over the live
    // ticker (teams.*.score). The ticker can freeze on a mid-game number when the
    // feed flags a game complete before the box score settles; results carries
    // the authoritative final. They agree once the game is finalized.
    const homePts = ev.results?.game?.home?.points ?? ev.teams?.home?.score;
    const awayPts = ev.results?.game?.away?.points ?? ev.teams?.away?.score;
    if (typeof homePts === "number") home.score = homePts;
    if (typeof awayPts === "number") away.score = awayPts;
  } else {
    home.score = undefined;
    away.score = undefined;
  }

  const startTime = ev.status?.startsAt;
  if (!startTime) return null;

  return {
    id: ev.eventID,
    league,
    startTime,
    status,
    period: pickPeriod(ev.status),
    home,
    away,
    trend: trendFromOdds(ev),
    finalized: ev.status?.finalized === true,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Fetch games for one league across a window centered on today (US-ET).
 *
 * Defaults to ~36h back through ~48h forward so the dashboard can show recent
 * finals, live, and upcoming/tomorrow games in a single pull.
 */
export async function fetchLeagueGames(
  league: League,
  opts: { hoursBack?: number; hoursForward?: number } = {},
): Promise<Game[]> {
  const hoursBack = opts.hoursBack ?? 36;
  const hoursForward = opts.hoursForward ?? 48;
  const now = Date.now();
  const startsAfter = new Date(now - hoursBack * 3600_000).toISOString();
  const startsBefore = new Date(now + hoursForward * 3600_000).toISOString();

  const params = new URLSearchParams({
    apiKey: apiKey(),
    leagueID: LEAGUE_TO_API[league],
    type: "match",
    startsAfter,
    startsBefore,
    limit: "100",
  });

  const events = await fetchEvents(params);
  const games: Game[] = [];
  for (const ev of events) {
    const g = toGame(ev, league);
    if (g) games.push(g);
  }
  return games;
}

/**
 * Build a pregame-locked trend from the OPENING line only.
 *
 * Backfill-only. On a FINAL event, `bookSpread`/`bookOverUnder` carry the LAST
 * live-updated line — a 13-3 blowout reports bookSpread +9.5 / total 16.5 — so
 * they must never grade a historical game. The `open*` fields preserve the true
 * pregame number; we lock and score against those.
 */
function openingTrendFromOdds(ev: ApiEvent): BettingTrend | undefined {
  const spHome = findOdd(ev.odds, "sp", "home");
  const spAway = findOdd(ev.odds, "sp", "away");
  const ouOver = findOdd(ev.odds, "ou", "over");
  const ouUnder = findOdd(ev.odds, "ou", "under");
  const mlHome = findOdd(ev.odds, "ml", "home");
  const mlAway = findOdd(ev.odds, "ml", "away");

  const spread =
    parseNum(spHome?.openBookSpread) ??
    parseNum(spHome?.openFairSpread) ??
    (parseNum(spAway?.openBookSpread) !== null ? -(parseNum(spAway!.openBookSpread)!) : null) ??
    (parseNum(spAway?.openFairSpread) !== null ? -(parseNum(spAway!.openFairSpread)!) : null);
  const total =
    parseNum(ouOver?.openBookOverUnder) ?? parseNum(ouOver?.openFairOverUnder);
  if (spread === null || total === null) return undefined;

  const pickedSide: Side = spread <= 0 ? "home" : "away";
  return {
    spread,
    total,
    mlOddsHome: fmtAmerican(mlHome?.openBookOdds ?? mlHome?.openFairOdds),
    mlOddsAway: fmtAmerican(mlAway?.openBookOdds ?? mlAway?.openFairOdds),
    spreadOddsHome: fmtAmerican(spHome?.openBookOdds ?? spHome?.openFairOdds),
    spreadOddsAway: fmtAmerican(spAway?.openBookOdds ?? spAway?.openFairOdds),
    totalOddsOver: fmtAmerican(ouOver?.openBookOdds ?? ouOver?.openFairOdds),
    totalOddsUnder: fmtAmerican(ouUnder?.openBookOdds ?? ouUnder?.openFairOdds),
    pickedSide,
    openingSpread: spread,
    openingTotal: total,
    source: "sportsgameodds",
    trendUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Backfill builder: only FINAL events that have both an opening line and a final
 * score, graded against the opening (pregame) line. Returns null for anything
 * that can't be fairly scored.
 */
function toHistoricalGame(ev: ApiEvent, league: League): Game | null {
  if (ev.status?.cancelled) return null;
  if (ev.type && ev.type !== "match") return null;
  if (pickStatus(ev.status) !== "final") return null;
  const startTime = ev.status?.startsAt;
  if (!startTime) return null;

  const home = teamFrom(ev.teams?.home, "HOME");
  const away = teamFrom(ev.teams?.away, "AWAY");
  // Prefer the official settled result over the live ticker — see toGame.
  const homePts = ev.results?.game?.home?.points ?? ev.teams?.home?.score;
  const awayPts = ev.results?.game?.away?.points ?? ev.teams?.away?.score;
  if (typeof homePts !== "number" || typeof awayPts !== "number") return null;
  home.score = homePts;
  away.score = awayPts;

  const trend = openingTrendFromOdds(ev);
  if (!trend) return null;

  return {
    id: ev.eventID,
    league,
    startTime,
    status: "final",
    period: pickPeriod(ev.status),
    home,
    away,
    trend,
    finalized: ev.status?.finalized === true,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Backfill fetch: historical FINAL games for one league across an explicit
 * [startsAfter, startsBefore] window, graded against the opening line. Uses the
 * Pro plan's historical-data access. Callers chunk wide ranges so a single call
 * stays under the events pagination cap.
 */
export async function fetchLeagueGamesHistorical(
  league: League,
  startsAfter: string,
  startsBefore: string,
): Promise<Game[]> {
  const params = new URLSearchParams({
    apiKey: apiKey(),
    leagueID: LEAGUE_TO_API[league],
    type: "match",
    startsAfter,
    startsBefore,
    limit: "100",
  });
  const events = await fetchEvents(params, 1000);
  const games: Game[] = [];
  for (const ev of events) {
    const g = toHistoricalGame(ev, league);
    if (g) games.push(g);
  }
  return games;
}

export interface LeagueFetchError {
  league: League;
  message: string;
}

/**
 * Pro plan = 300 req/min, so fetching all leagues concurrently is well within
 * the limit (5 leagues × a few paginated requests each). fetchPage retries on
 * 429, so a transient burst over the cap self-heals rather than dropping a
 * league. Per-league failures stay isolated via allSettled.
 */
export async function fetchAllGames(
  leagues: League[],
  errorsOut?: LeagueFetchError[],
  opts: { hoursBack?: number; hoursForward?: number } = {},
): Promise<Game[]> {
  const out: Game[] = [];
  const results = await Promise.allSettled(
    leagues.map((l) => fetchLeagueGames(l, opts)),
  );
  results.forEach((r, i) => {
    const l = leagues[i];
    if (r.status === "fulfilled") {
      out.push(...r.value);
    } else {
      const msg = (r.reason as Error).message;
      console.warn(`[sportsgameodds] ${l} failed:`, msg);
      errorsOut?.push({ league: l, message: msg });
    }
  });
  return out;
}
