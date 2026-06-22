import { readStore } from "@/lib/storage";
import { todayKey } from "@/lib/calc";
import { etDateKeyOf } from "@/lib/time";
import { GamesSection } from "@/components/GamesSection";
import { AutoRefresh } from "@/components/AutoRefresh";
import { StreakBanner } from "@/components/StreakBanner";
import { LeagueFilter } from "@/components/LeagueFilter";
import { NewsSection } from "@/components/NewsSection";
import { getPublishedArticles } from "@/lib/articles";
import type { Game } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LEAGUE_LABEL: Record<string, string> = {
  nba: "NBA",
  wnba: "WNBA",
  mlb: "MLB",
  nfl: "NFL",
  nhl: "NHL",
};

function emptyMessage(league: string | undefined, totalGames: number): React.ReactNode {
  if (league && totalGames > 0) {
    return `No ${LEAGUE_LABEL[league] ?? league.toUpperCase()} games today — likely offseason or an off-day for the league. Try another tab.`;
  }
  return <>No games loaded yet. Run <code>npm run update-data</code> to fetch.</>;
}

function eyebrowText(streak: { current: "public" | "vegas" | null; count: number }) {
  if (!streak.current || streak.count === 0) {
    return "Live · Tracking Public vs Vegas across NBA, MLB, NFL, NHL";
  }
  const who = streak.current === "public" ? "Public" : "Vegas";
  return `Live · ${who} on a ${streak.count}-game ATS run`;
}

function shiftDayKey(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function nextDayKey(key: string): string { return shiftDayKey(key, 1); }
function prevDayKey(key: string): string { return shiftDayKey(key, -1); }

const RECENT_FINAL_WINDOW_MS = 36 * 3600_000;

function group(games: Game[]) {
  const now = Date.now();
  return {
    live: games.filter((g) => g.status === "live"),
    upcoming: games.filter((g) => g.status === "scheduled"),
    finals: games.filter((g) => {
      if (g.status !== "final") return false;
      const startedMs = new Date(g.startTime).getTime();
      if (!Number.isFinite(startedMs)) return false;
      return now - startedMs < RECENT_FINAL_WINDOW_MS;
    }),
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const { league } = await searchParams;
  const [store, latestNews] = await Promise.all([readStore(), getPublishedArticles(8)]);
  const today = todayKey();
  const tomorrow = nextDayKey(today);
  const leagueFiltered = league ? store.games.filter((g) => g.league === league) : store.games;
  const todays = leagueFiltered.filter((g) => etDateKeyOf(g.startTime) === today);
  const tomorrows = leagueFiltered.filter((g) => etDateKeyOf(g.startTime) === tomorrow);
  // Include any final from the last 36h so Recent Results survives the ET
  // midnight rollover — group() will apply the 36h window itself.
  const finalsPool = leagueFiltered.filter((g) => g.status === "final");
  const groups = group([...todays, ...finalsPool.filter((g) => !todays.includes(g))]);
  const tomorrowUpcoming = tomorrows.filter((g) => g.status === "scheduled");
  const filtered = leagueFiltered;

  // Fallback: if today + tomorrow are both empty, surface the next upcoming
  // games so the page never looks blank between schedule days.
  const nothingInWindow =
    groups.live.length === 0 &&
    groups.upcoming.length === 0 &&
    groups.finals.length === 0 &&
    tomorrowUpcoming.length === 0;
  const upcomingPool = league
    ? store.games.filter((g) => g.league === league)
    : store.games;
  const upcomingFallback = nothingInWindow
    ? upcomingPool
        .filter((g) => g.status === "scheduled" && new Date(g.startTime).getTime() > Date.now())
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(0, 12)
    : [];

  return (
    <>
      <AutoRefresh
        intervalMs={60_000}
        refreshDataMs={180_000}
        staleAtMs={new Date(store.lastUpdated).getTime()}
      />
      <section className="hero">
        <div className="container">
          <div className="eyebrow">
            <span className="pulse" />
            {eyebrowText(store.streak)}
          </div>
          <h1 className="serif">
            Favorites don&apos;t always cover.<br />
            <em>We track when they don&apos;t.</em>
          </h1>
          <p className="lede">
            Live odds, spreads, totals, and ATS results for every game across the major
            US leagues. Favorite-vs-underdog streaks updated in real time. Free.
          </p>
          <div className="secondary-link">
            <a href="#games">Scroll for live games ↓</a>
          </div>
        </div>
      </section>

      <div className="container" id="games">
        <StreakBanner streak={store.streak} />
        <LeagueFilter active={league} />

        {groups.live.length > 0 && (
          <GamesSection
            label={`Live · ${groups.live.length} game${groups.live.length === 1 ? "" : "s"}`}
            games={groups.live}
          />
        )}
        {groups.finals.length > 0 && (
          <GamesSection
            label={`Recent results · ${groups.finals.length} game${groups.finals.length === 1 ? "" : "s"}`}
            games={groups.finals}
          />
        )}
        {groups.upcoming.length > 0 && (
          <GamesSection
            label={`Upcoming · ${groups.upcoming.length} game${groups.upcoming.length === 1 ? "" : "s"}`}
            games={groups.upcoming}
          />
        )}
        {tomorrowUpcoming.length > 0 && (
          <GamesSection
            label={`Tomorrow · ${tomorrowUpcoming.length} game${tomorrowUpcoming.length === 1 ? "" : "s"}`}
            games={tomorrowUpcoming}
          />
        )}

        {upcomingFallback.length > 0 && (
          <GamesSection
            label={`Next up · ${upcomingFallback.length} game${upcomingFallback.length === 1 ? "" : "s"}`}
            games={upcomingFallback}
          />
        )}

        {filtered.length === 0 && upcomingFallback.length === 0 && (
          <>
            <div className="section-label">Today</div>
            <div className="empty-state">
              {emptyMessage(league, store.games.length)}
            </div>
          </>
        )}
      </div>

      <NewsSection articles={latestNews} />

      <section className="editorial">
        <div className="container">
          <div className="section-h">How the spread plays out</div>
          <h2 className="section-title serif">
            The line is the question.<br />
            <em>The cover is the answer.</em>
          </h2>

          <Thesis n="01" title="The line gets set">
            Books open a spread and a total. The favorite gives points;
            the underdog takes them. The total is the over/under on combined score.
          </Thesis>
          <Thesis n="02" title="The game plays out">
            The favorite has to win by more than the spread to cover.
            The underdog covers by losing close — or just winning outright.
          </Thesis>
          <Thesis n="03" title="We tally the run">
            We track which side covered every game, every day,
            and surface streaks the moment they form.
          </Thesis>
        </div>
      </section>

      <section className="editorial">
        <div className="container">
          <div className="section-h">What&apos;s different</div>
          <h2 className="section-title serif">
            Lines on every site.<br />
            <em>Results in one place.</em>
          </h2>

          <div className="compare">
            <div className="compare-card">
              <div className="compare-name">Most odds sites</div>
              <CompareRow label="Live odds & spreads" yes />
              <CompareRow label="Cover results after each game" />
              <CompareRow label="Favorite/underdog streak counter" />
              <CompareRow label="7-day history" />
            </div>
            <div className="compare-card ours">
              <div className="compare-name">Fade The Money</div>
              <CompareRow label="Live odds & spreads" yes />
              <CompareRow label="Cover results after each game" yes />
              <CompareRow label="Favorite/underdog streak counter" yes />
              <CompareRow label="7-day history" yes />
            </div>
          </div>
        </div>
      </section>

    </>
  );
}

function Thesis({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="thesis-row">
      <div className="thesis-num mono">{n}</div>
      <div>
        <div className="thesis-title">{title}</div>
        <p className="thesis-body">{children}</p>
      </div>
    </div>
  );
}

function CompareRow({ label, yes }: { label: string; yes?: boolean }) {
  return (
    <div className="compare-row">
      <span className="compare-key">{label}</span>
      {yes ? <span className="check-yes">✓</span> : <span className="check-no">—</span>}
    </div>
  );
}
