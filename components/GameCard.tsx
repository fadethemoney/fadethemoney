import type { Game, Side } from "@/lib/types";
import { publicCovering, publicCoveringTotal, todayKey } from "@/lib/calc";
import { etDateKeyOf } from "@/lib/time";

type Market = "ml" | "spread" | "total";

const ET_TZ = "America/New_York";

function fmtSpread(n: number) {
  if (n === 0) return "PK";
  return n > 0 ? `+${n}` : `${n}`;
}

function fmtOdds(o: string | null) {
  if (!o) return "—";
  return o.startsWith("+") || o.startsWith("-") ? o : `+${o}`;
}

function timeLabel(g: Game) {
  if (g.status === "live") return g.period ?? "LIVE";
  if (g.status === "final") return g.period ?? "Final";
  const d = new Date(g.startTime);
  const time = d.toLocaleTimeString("en-US", {
    timeZone: ET_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
  const gameKey = etDateKeyOf(g.startTime);
  if (gameKey === todayKey()) return `${time} ET`;
  const date = d.toLocaleDateString("en-US", {
    timeZone: ET_TZ,
    weekday: "short",
    month: "numeric",
    day: "numeric",
  });
  return `${date} · ${time} ET`;
}

export function GameCard({ game, market = "spread" }: { game: Game; market?: Market }) {
  const t = game.trend;
  const favSide: Side | null = t?.pickedSide ?? null;
  const isFinal = game.status === "final" && game.finalResult;
  const covering = market === "total" ? publicCoveringTotal(game) : publicCovering(game);

  return (
    <article className="card">
      <div className="card-header">
        <span className="league-pill">{game.league}</span>
        <span className={`game-status${game.status === "live" ? " live" : ""}`}>
          {timeLabel(game)}
        </span>
      </div>

      {t ? (
        <div className="odds-grid">
          <OddsRow
            team={game.away}
            isFavorite={favSide === "away"}
            ml={t.mlOddsAway}
            spread={fmtSpread(-t.spread)}
            spreadOdds={t.spreadOddsAway}
            totalLabel={`o ${t.total}`}
            totalOdds={t.totalOddsOver}
          />
          <OddsRow
            team={game.home}
            isFavorite={favSide === "home"}
            ml={t.mlOddsHome}
            spread={fmtSpread(t.spread)}
            spreadOdds={t.spreadOddsHome}
            totalLabel={`u ${t.total}`}
            totalOdds={t.totalOddsUnder}
          />
        </div>
      ) : (
        <>
          <TeamLine team={game.away} />
          <TeamLine team={game.home} />
          <div className="no-trend">No odds yet</div>
        </>
      )}

      <div className="card-footer">
        <span>
          <span className="game-time">{timeLabel(game)}</span>
          {t && (
            <>
              {" · "}
              {market === "total"
                ? <>Public: OVER {t.total}</>
                : <>Public: {favSide === "home" ? game.home.abbr : game.away.abbr}{" "}
                    {fmtSpread(favSide === "home" ? t.spread : -t.spread)}</>}
            </>
          )}
        </span>
        <ResultPill game={game} covering={covering} />
      </div>

      {isFinal && t && <ResultLine game={game} market={market} />}
    </article>
  );
}

function OddsRow({
  team, isFavorite, ml, spread, spreadOdds, totalLabel, totalOdds,
}: {
  team: Game["home"]; isFavorite: boolean;
  ml: string | null;
  spread: string; spreadOdds: string | null;
  totalLabel: string; totalOdds: string | null;
}) {
  return (
    <div className={`odds-row${isFavorite ? " is-public" : ""}`}>
      <span className="or-cell or-team">
        <span className="team-abbr">{team.abbr}</span>
        <span className="team-name">{team.name}</span>
        <span className="team-score">{team.score ?? ""}</span>
        {isFavorite && <span className="pub-tag">Public</span>}
      </span>
      <span className="or-cell or-line" data-market="ml">{fmtOdds(ml)}</span>
      <span className="or-cell or-line" data-market="spread">{spread}</span>
      <span className="or-cell or-line" data-market="spread">{fmtOdds(spreadOdds)}</span>
      <span className="or-cell or-line" data-market="total">{totalLabel}</span>
      <span className="or-cell or-line" data-market="total">{fmtOdds(totalOdds)}</span>
    </div>
  );
}

function TeamLine({ team }: { team: Game["home"] }) {
  return (
    <div className="team-row">
      <span className="team-abbr">{team.abbr}</span>
      <span><span className="team-name">{team.name}</span></span>
      <span className="team-score">{team.score ?? 0}</span>
    </div>
  );
}

function ResultPill({ game, covering }: { game: Game; covering: boolean | null }) {
  if (game.status === "scheduled") {
    return <span className="result-pill result-pending">Upcoming</span>;
  }
  // Finals: `covering` is already market-aware (spread vs total) via the
  // helper picked in GameCard, so we use it for finals too rather than
  // hard-coding the spread verdict.
  if (game.status === "final" && game.finalResult) {
    if (covering === true) return <span className="result-pill result-public">Public covered</span>;
    if (covering === false) return <span className="result-pill result-vegas">Vegas covered</span>;
    return <span className="result-pill result-pending">Push</span>;
  }
  if (covering === true) return <span className="result-pill result-public">Public covering</span>;
  if (covering === false) return <span className="result-pill result-vegas">Vegas covering</span>;
  return <span className="result-pill result-pending">Push</span>;
}

function ResultLine({ game, market }: { game: Game; market: Market }) {
  const r = game.finalResult!;
  const t = game.trend!;
  if (market === "total") {
    if (r.totalGoOver === null) {
      return <div className="card-resultline">— Total push {t.total}</div>;
    }
    const publicWon = r.totalGoOver; // public = OVER
    const overUnder = r.totalGoOver ? "OVER" : "UNDER";
    return publicWon
      ? <div className="card-resultline public">✓ <em>Public covered</em> · Total {overUnder} {t.total}</div>
      : <div className="card-resultline">✗ <em>Vegas covered</em> · Total {overUnder} {t.total}</div>;
  }
  const covered = r.publicCovered;
  const totalText =
    r.totalGoOver === null
      ? `Total push ${t.total}`
      : `Total ${r.totalGoOver ? "OVER" : "UNDER"} ${t.total}`;
  if (covered === true) {
    return <div className="card-resultline public">✓ <em>Public covered</em> · {totalText}</div>;
  }
  if (covered === false) {
    return <div className="card-resultline">✗ <em>Vegas covered</em> · {totalText}</div>;
  }
  return <div className="card-resultline">— Push · {totalText}</div>;
}
