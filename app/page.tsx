import { readStore } from "@/lib/storage";
import { todayKey } from "@/lib/calc";
import { etDateKeyOf } from "@/lib/time";
import { GamesSection } from "@/components/GamesSection";
import { AutoRefresh } from "@/components/AutoRefresh";
import { StreakBanner } from "@/components/StreakBanner";
import { LeagueFilter } from "@/components/LeagueFilter";
import type { Game } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LEAGUE_LABEL: Record<string, string> = {
  nba: "NBA",
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
    return "Live · Tracking public vs Vegas across NBA, MLB, NFL, NHL";
  }
  const who = streak.current === "public" ? "Public" : "Vegas";
  return `Live · ${who} on a ${streak.count}-game run`;
}

function nextDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function group(games: Game[]) {
  return {
    live: games.filter((g) => g.status === "live"),
    upcoming: games.filter((g) => g.status === "scheduled"),
    finals: games.filter((g) => g.status === "final"),
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const { league } = await searchParams;
  const store = await readStore();
  const today = todayKey();
  const tomorrow = nextDayKey(today);
  const inWindow = store.games.filter((g) => {
    const k = etDateKeyOf(g.startTime);
    return k === today || k === tomorrow;
  });
  const filtered = league ? inWindow.filter((g) => g.league === league) : inWindow;
  const todays = filtered.filter((g) => etDateKeyOf(g.startTime) === today);
  const tomorrows = filtered.filter((g) => etDateKeyOf(g.startTime) === tomorrow);
  const groups = group(todays);
  const tomorrowUpcoming = tomorrows.filter((g) => g.status === "scheduled");

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
            The public is wrong<br />
            more than they&apos;re right.<br />
            <em>We track when.</em>
          </h1>
          <p className="lede">
            For every game across the major US leagues, we capture what the public bet,
            then check whether they actually won. Public streaks and live scores. Free.
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
        {groups.upcoming.length > 0 && (
          <GamesSection
            label={`Upcoming · ${groups.upcoming.length} game${groups.upcoming.length === 1 ? "" : "s"}`}
            games={groups.upcoming}
          />
        )}
        {groups.finals.length > 0 && (
          <GamesSection
            label={`Final · ${groups.finals.length} game${groups.finals.length === 1 ? "" : "s"}`}
            games={groups.finals}
          />
        )}
        {tomorrowUpcoming.length > 0 && (
          <GamesSection
            label={`Tomorrow · ${tomorrowUpcoming.length} game${tomorrowUpcoming.length === 1 ? "" : "s"}`}
            games={tomorrowUpcoming}
          />
        )}

        {filtered.length === 0 && (
          <>
            <div className="section-label">Today</div>
            <div className="empty-state">
              {emptyMessage(league, store.games.length)}
            </div>
          </>
        )}
      </div>

      <section className="editorial">
        <div className="container">
          <div className="section-h">How fading works</div>
          <h2 className="section-title serif">
            Three steps the books bank on,<br />
            <em>game after game.</em>
          </h2>

          <Thesis n="01" title="The public piles in">
            When 70%+ of bets land on one side, that&apos;s &ldquo;public action&rdquo; — usually
            the favorite, or the over. People bet with their hearts, hometowns,
            and highlight reels.
          </Thesis>
          <Thesis n="02" title="Vegas adjusts the line">
            Books shade the spread to balance the action. The public still bets
            the same obvious side. The line keeps moving against them.
          </Thesis>
          <Thesis n="03" title="The fade wins long-term">
            Public bettors win <strong>~47%</strong> of spread bets — well below
            the <strong>52.4%</strong> break-even. That gap is where the fade lives.
          </Thesis>
        </div>
      </section>

      <section className="editorial">
        <div className="container">
          <div className="section-h">What&apos;s different</div>
          <h2 className="section-title serif">
            Most sites show the public %.<br />
            <em>We show whether they won.</em>
          </h2>

          <div className="compare">
            <div className="compare-card">
              <div className="compare-name">Covers · Action</div>
              <CompareRow label="Live public %" yes />
              <CompareRow label="Data after game ends" />
              <CompareRow label="Public streak counter" />
              <CompareRow label="7-day history" />
            </div>
            <div className="compare-card ours">
              <div className="compare-name">Fade The Money</div>
              <CompareRow label="Live public %" yes />
              <CompareRow label="Data after game ends" yes />
              <CompareRow label="Public streak counter" yes />
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
