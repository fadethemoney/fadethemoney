import type { BettingTrend, League, Side, TotalSide } from "./types";

/**
 * SportsBettingDime data source.
 *
 * Hits the same internal JSON endpoint that powers the
 * <srwc-public-betting-trends> widget on sportsbettingdime.com.
 * Discovered by inspecting the live page's network requests
 * (chunk-72 url builder + headless Edge net-log capture):
 *
 *   GET /wp-json/adpt/v1/{league}-odds
 *       ?books=sr:book:7612,sr:book:31520,sr:book:28901,sr:book:32784
 *       &format=us
 *
 * NOTE: undocumented internal endpoint — could change without warning.
 * Treat empty (204) as "no current matchups", not an error.
 */

const ENDPOINT = (league: League) =>
  `https://www.sportsbettingdime.com/wp-json/adpt/v1/${league}-odds`;

const DEFAULT_BOOKS = [
  "sr:book:7612",   // DraftKings (per page config)
  "sr:book:31520",  // FanDuel
  "sr:book:28901",  // BetMGM
  "sr:book:32784",  // Caesars
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface ScrapedMatchup {
  awayAbbr: string;
  homeAbbr: string;
  trend: BettingTrend;
}

// --- raw shape (subset we use) ---
interface SbdSplit { betsPercentage: number; stakePercentage: number }
interface SbdEvent {
  id: string;
  scheduled: string;
  status: string;
  competitors: {
    home: { abbreviation: string };
    away: { abbreviation: string };
  };
  markets?: {
    spread?: { books: Array<{ home?: { spread?: string }; away?: { spread?: string } }> };
    total?: { books: Array<{ total?: string | number; opening_total?: string | number }> };
    moneyline?: { books: Array<{ home?: { odds?: string }; away?: { odds?: string } }> };
  };
  bettingSplits?: {
    updated?: string;
    spread?: { updated?: string; home: SbdSplit; away: SbdSplit };
    total?: { updated?: string; over: SbdSplit; under: SbdSplit };
    moneyline?: { updated?: string; home: SbdSplit; away: SbdSplit };
  };
}
interface SbdResponse { data?: SbdEvent[] }

function parseNum(v: string | number | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

function toMatchup(ev: SbdEvent): ScrapedMatchup | null {
  const homeAbbr = ev.competitors?.home?.abbreviation;
  const awayAbbr = ev.competitors?.away?.abbreviation;
  const splits = ev.bettingSplits;
  if (!homeAbbr || !awayAbbr || !splits?.spread) return null;

  // Average spread across books that report a numeric home spread.
  const homeSpreads = (ev.markets?.spread?.books ?? [])
    .map((b) => parseNum(b.home?.spread))
    .filter((n): n is number => n !== null);
  const spreadAvg = avg(homeSpreads);
  if (spreadAvg === null) return null; // no spread available — skip
  const spread = roundHalf(spreadAvg);

  // Average total across books.
  const totalsRaw = (ev.markets?.total?.books ?? [])
    .map((b) => parseNum(b.total))
    .filter((n): n is number => n !== null);
  const totalAvg = avg(totalsRaw);
  const total = totalAvg !== null ? roundHalf(totalAvg) : 0;

  // Opening lines (for context)
  const openingSpreads = (ev.markets?.spread?.books ?? [])
    .map((b) => parseNum((b as { home?: { opening_spread?: string | number } }).home?.opening_spread))
    .filter((n): n is number => n !== null);
  const openingTotals = (ev.markets?.total?.books ?? [])
    .map((b) => parseNum(b.opening_total))
    .filter((n): n is number => n !== null);
  const openingSpread = avg(openingSpreads);
  const openingTotal = avg(openingTotals);

  // SPREAD splits — public bet % comes from this market.
  const sHome = splits.spread.home;
  const sAway = splits.spread.away;
  const publicPctHome = parseNum(sHome.betsPercentage as unknown as string | number) ?? 0;
  const publicPctAway = parseNum(sAway.betsPercentage as unknown as string | number) ?? 0;
  // If SBD hasn't published spread splits yet (early-morning lines), the
  // betsPercentage fields come back empty/zero. Don't pretend we have data.
  if (publicPctHome === 0 && publicPctAway === 0) return null;
  const spreadMoneyPctHome = parseNum(sHome.stakePercentage as unknown as string | number) ?? 0;
  const spreadMoneyPctAway = parseNum(sAway.stakePercentage as unknown as string | number) ?? 0;
  const pickedSide: Side = publicPctHome >= publicPctAway ? "home" : "away";

  // MONEYLINE money — sharp-action signal. Falls back to spread money if
  // moneyline splits aren't published (rare).
  const ml = splits.moneyline;
  const moneyPctHome = ml ? ml.home.stakePercentage : spreadMoneyPctHome;
  const moneyPctAway = ml ? ml.away.stakePercentage : spreadMoneyPctAway;
  const mlBetPctHome = ml ? ml.home.betsPercentage : publicPctHome;
  const mlBetPctAway = ml ? ml.away.betsPercentage : publicPctAway;

  // Moneyline odds — pull "best" book or first available per side.
  const mlBooks = ev.markets?.moneyline?.books ?? [];
  const firstOdds = (k: "home" | "away"): string | null => {
    for (const b of mlBooks) {
      const o = b[k]?.odds;
      if (o && o.trim() !== "") return o;
    }
    return null;
  };
  const mlOddsHome = firstOdds("home");
  const mlOddsAway = firstOdds("away");

  // Total splits (may be absent for a particular game)
  let totalSide: TotalSide | null = null;
  let totalPublicPct = 0;
  let totalMoneyPct = 0;
  let totalOverBetPct = 0;
  let totalUnderBetPct = 0;
  let totalOverMoneyPct = 0;
  let totalUnderMoneyPct = 0;
  if (splits.total) {
    const over = splits.total.over;
    const under = splits.total.under;
    totalSide = over.betsPercentage >= under.betsPercentage ? "over" : "under";
    totalPublicPct = totalSide === "over" ? over.betsPercentage : under.betsPercentage;
    totalMoneyPct = totalSide === "over" ? over.stakePercentage : under.stakePercentage;
    totalOverBetPct = over.betsPercentage;
    totalUnderBetPct = under.betsPercentage;
    totalOverMoneyPct = over.stakePercentage;
    totalUnderMoneyPct = under.stakePercentage;
  }

  const trendUpdatedAt =
    splits.spread.updated ?? splits.total?.updated ?? splits.updated ?? new Date().toISOString();

  const trend: BettingTrend = {
    spread,
    total,
    publicPctHome: round1(publicPctHome),
    publicPctAway: round1(publicPctAway),
    moneyPctHome: round1(moneyPctHome),
    moneyPctAway: round1(moneyPctAway),
    mlOddsHome,
    mlOddsAway,
    mlBetPctHome: round1(mlBetPctHome),
    mlBetPctAway: round1(mlBetPctAway),
    spreadMoneyPctHome: round1(spreadMoneyPctHome),
    spreadMoneyPctAway: round1(spreadMoneyPctAway),
    pickedSide,
    totalSide,
    totalPublicPct: round1(totalPublicPct),
    totalMoneyPct: round1(totalMoneyPct),
    totalOverBetPct: round1(totalOverBetPct),
    totalUnderBetPct: round1(totalUnderBetPct),
    totalOverMoneyPct: round1(totalOverMoneyPct),
    totalUnderMoneyPct: round1(totalUnderMoneyPct),
    openingSpread: openingSpread !== null ? roundHalf(openingSpread) : undefined,
    openingTotal: openingTotal !== null ? roundHalf(openingTotal) : undefined,
    source: "sbd",
    trendUpdatedAt,
  };

  return {
    homeAbbr: homeAbbr.toUpperCase(),
    awayAbbr: awayAbbr.toUpperCase(),
    trend,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function scrapeLeagueTrends(league: League): Promise<ScrapedMatchup[]> {
  const url =
    `${ENDPOINT(league)}?books=${DEFAULT_BOOKS.join(",")}&format=us`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: `https://www.sportsbettingdime.com/${league}/public-betting-trends/`,
      Origin: "https://www.sportsbettingdime.com",
    },
    // Cache lightly — SBD updates splits ~every few minutes.
    next: { revalidate: 180 },
  });

  if (res.status === 204) return []; // no current matchups in window
  if (!res.ok) throw new Error(`SBD ${league} ${res.status} ${res.statusText}`);

  const data = (await res.json()) as SbdResponse;
  const events = data.data ?? [];
  return events
    .map(toMatchup)
    .filter((m): m is ScrapedMatchup => m !== null);
}
