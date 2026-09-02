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
  ncaab: "NCAAB",
  ncaaf: "NCAAF",
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
    ended?: boolean;
    periods?: { started?: string[]; ended?: string[] };
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

/**
 * The six odds we actually read (see findOdd/trendFromOdds): game-period
 * points spread, moneyline and total for each side.
 *
 * Passing these as `oddIDs` is the difference between a request we can afford
 * and one that kills the function. A full MLB event carries ~1,170 odds — every
 * market, period and player prop, each with a per-bookmaker breakdown — about
 * 2.2 MB per event, so one 100-event page is ~200 MB of JSON. Seven leagues
 * fetched concurrently is what OOM-killed /api/refresh on roughly half its runs.
 * Filtered, an event is ~66 KB: a 32x cut, with the six odds we read returned
 * byte-identical (verified against unfiltered payloads for MLB, NFL and NCAAF).
 *
 * Caveat: the API omits events that carry NONE of these odds. In season that is
 * only D-II/D-III college filler (MLB and NFL had zero such events; the seven in
 * NCAAF were Lock Haven, Erskine, Johnson C. Smith and the like), which the AP
 * Top 25 filter discards anyway.
 */
const ODD_IDS = [
  "points-home-game-sp-home",
  "points-away-game-sp-away",
  "points-home-game-ml-home",
  "points-away-game-ml-away",
  "points-all-game-ou-over",
  "points-all-game-ou-under",
].join(",");

/**
 * Page through events, converting each page to its final shape and dropping the
 * raw page before requesting the next. Accumulating raw ApiEvents across pages
 * (as this used to) held an entire slate of fully-populated events in memory at
 * once; mapping per page keeps only the small Game objects.
 */
async function fetchEventPages<T>(
  params: URLSearchParams,
  map: (ev: ApiEvent) => T | null,
  max = 500,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let seen = 0;
  do {
    const p = new URLSearchParams(params);
    if (cursor) p.set("cursor", cursor);
    const json = await fetchPage(p);
    const data = Array.isArray(json.data) ? json.data : [];
    seen += data.length;
    for (const ev of data) {
      const mapped = map(ev);
      if (mapped) out.push(mapped);
    }
    cursor = json.nextCursor ?? null;
    pages += 1;
    // `json` falls out of scope here, so the raw page is collectable before the
    // next one is fetched.
  } while (cursor && seen < max && pages < 10);
  return out;
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

/**
 * Has every period of this game actually finished?
 *
 * The feed sets `finalized` (results official) hours after a game ends, and
 * grading used to wait on it — which is why a 9:20pm final only alerted at
 * 11:00pm. This is the signal we can trust immediately instead: a genuinely
 * finished game reports ended + not-live + a `periods.ended` list containing
 * the whole-game markers, whereas a game the feed has merely flagged
 * "completed" mid-play (the LAD 2-1 / real 12-3 bug) is still live:true with
 * only the innings so far in periods.ended.
 *
 *   live, 9th inning → ended:false live:true  periods.ended [1i…8i]
 *   real final       → ended:true  live:false periods.ended [1i…9i, game, reg]
 */
function periodsComplete(s: ApiEvent["status"]): boolean {
  if (!s) return false;
  if (s.live === true) return false;
  if (s.ended !== true) return false;
  const ended = s.periods?.ended ?? [];
  return ended.includes("game") || ended.includes("reg");
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
    periodsComplete: periodsComplete(ev.status),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Fetch games for one league across a window centered on today (US-ET).
 *
 * Defaults to ~96h back through ~48h forward. The 96h back-window keeps already-
 * FINAL games re-fetchable long enough for official post-final scoring
 * corrections to land — MLB scorer reviews routinely post a day-plus after first
 * pitch, past the old 36h window, which silently froze a stale score into the
 * streak. The refresh re-grades each tick, so a corrected score self-heals the
 * streak (see updateCategoryStreak in lib/streak.ts).
 */
export async function fetchLeagueGames(
  league: League,
  opts: { hoursBack?: number; hoursForward?: number } = {},
): Promise<Game[]> {
  const hoursBack = opts.hoursBack ?? 96;
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
    oddIDs: ODD_IDS,
  });

  return fetchEventPages(params, (ev) => toGame(ev, league));
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
    periodsComplete: periodsComplete(ev.status),
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
    // Same trim as the live fetch. Backfill walks up to 1000 events over a wide
    // date range, so it is the most memory-hungry caller of the two; the opening
    // line openingTrendFromOdds reads (openBookSpread etc.) lives on these same
    // six odds, and an event carrying none of them can't be graded anyway.
    oddIDs: ODD_IDS,
  });
  return fetchEventPages(params, (ev) => toHistoricalGame(ev, league), 1000);
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
