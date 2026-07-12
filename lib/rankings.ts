import type { Game, League, Team } from "./types";

/**
 * AP Top 25 filter for the college leagues.
 *
 * The client only wants RANKED college games on the site and in streak alerts
 * ("just ranked", 2026-07-12) — full NCAAB slates run 100+ games/day and would
 * flood both the dashboard and the 2/4-count email cadence. SportsGameOdds has
 * no rankings data, so we pull the AP Top 25 from ESPN's public JSON API
 * (an API, not a scraper — the client's API-only rule holds) and keep a game
 * only when at least ONE side is ranked.
 */

export const COLLEGE_LEAGUES: readonly League[] = ["ncaab", "ncaaf"];

export function isCollegeLeague(league: League): boolean {
  return COLLEGE_LEAGUES.includes(league);
}

const RANKINGS_URL: Partial<Record<League, string>> = {
  ncaab:
    "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/rankings",
  ncaaf:
    "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings",
};

interface EspnRankEntry {
  team?: {
    location?: string; // "Michigan"
    name?: string; // "Wolverines"
    nickname?: string;
    abbreviation?: string; // "MICH"
  };
}

interface EspnRankings {
  rankings?: {
    name?: string; // "AP Top 25"
    shortName?: string;
    ranks?: EspnRankEntry[];
  }[];
}

export interface RankedTeam {
  location: string;
  abbreviation: string;
  fullName: string; // "Michigan Wolverines"
}

/** Lowercase, strip punctuation/diacritic noise, collapse whitespace. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// In-memory cache per serverless instance. Rankings change weekly; re-fetching
// on every 2-minute cron tick would be pure waste. TTL 1h.
const CACHE_TTL_MS = 3600_000;
const cache = new Map<League, { at: number; teams: RankedTeam[] }>();

/**
 * Fetch the current AP Top 25 for a college league. Prefers the poll whose
 * name mentions "AP"; falls back to the first poll ESPN returns. Fails CLOSED
 * (empty list → no game counts as ranked) so an ESPN outage can't flood the
 * site/emails with the full unranked slate — the fetch-outage alerting on the
 * odds side doesn't cover this, so we log loudly instead.
 */
export async function fetchRankedTeams(league: League): Promise<RankedTeam[]> {
  const url = RANKINGS_URL[league];
  if (!url) return [];
  const hit = cache.get(league);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.teams;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`ESPN rankings HTTP ${res.status}`);
    const data = (await res.json()) as EspnRankings;
    const polls = data.rankings ?? [];
    const ap =
      polls.find((p) => `${p.name ?? ""} ${p.shortName ?? ""}`.toLowerCase().includes("ap")) ??
      polls[0];
    const teams: RankedTeam[] = (ap?.ranks ?? [])
      .map((r) => {
        const location = r.team?.location ?? r.team?.nickname ?? "";
        const name = r.team?.name ?? "";
        return {
          location,
          abbreviation: (r.team?.abbreviation ?? "").toUpperCase(),
          fullName: `${location} ${name}`.trim(),
        };
      })
      .filter((t) => t.location.length > 0);
    if (teams.length > 0) cache.set(league, { at: Date.now(), teams });
    return teams;
  } catch (e) {
    console.warn(`[rankings] ${league} AP fetch failed:`, (e as Error).message);
    // Serve a stale cache over nothing — a week-old Top 25 is far better than
    // silently blanking the college slate for the TTL window.
    return hit?.teams ?? [];
  }
}

/**
 * Build a matcher that decides whether a SportsGameOdds team is AP-ranked.
 * SGO and ESPN don't share IDs, so this is name-based and EXACT-only: an
 * abbreviation match, or the normalized SGO name equal to the ESPN
 * "Location Mascot" full name or bare location. A looser starts-with rule was
 * tried and rejected — ranked "Michigan" must not match "Michigan State".
 */
export function buildRankedMatcher(ranked: RankedTeam[]): (t: Team) => boolean {
  const abbrs = new Set(ranked.map((t) => t.abbreviation).filter(Boolean));
  const names = new Set<string>();
  for (const r of ranked) {
    names.add(normalize(r.fullName));
    if (r.location) names.add(normalize(r.location));
  }
  return (t: Team) => abbrs.has(t.abbr.toUpperCase()) || names.has(normalize(t.name));
}

/**
 * Filter a college league's games down to matchups where at least one side is
 * AP-ranked. Non-college leagues pass through untouched.
 */
export async function filterRankedGames(league: League, games: Game[]): Promise<Game[]> {
  if (!isCollegeLeague(league) || games.length === 0) return games;
  const ranked = await fetchRankedTeams(league);
  if (ranked.length === 0) {
    console.warn(`[rankings] no AP poll available for ${league} — dropping ${games.length} game(s)`);
    return [];
  }
  const isRanked = buildRankedMatcher(ranked);
  return games.filter((g) => isRanked(g.home) || isRanked(g.away));
}

/**
 * Apply the ranked-only college filter to a mixed-league fetch result. Pro
 * leagues pass through untouched; ncaab/ncaaf keep only AP-ranked matchups.
 * This runs BEFORE upsert, so unranked college games never enter the store,
 * the dashboard, or the streak pipeline.
 */
export async function filterRankedAllLeagues(games: Game[]): Promise<Game[]> {
  const college = games.filter((g) => isCollegeLeague(g.league));
  if (college.length === 0) return games;
  const pro = games.filter((g) => !isCollegeLeague(g.league));
  const kept: Game[] = [];
  for (const league of COLLEGE_LEAGUES) {
    kept.push(...(await filterRankedGames(league, college.filter((g) => g.league === league))));
  }
  return [...pro, ...kept];
}
