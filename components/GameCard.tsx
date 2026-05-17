import type { Game, Side } from "@/lib/types";
import { publicCovering, totalGoingOver, totalFavoriteSide, todayKey } from "@/lib/calc";
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
  const totalFav = totalFavoriteSide(t); // "over" | "under" | null
  const isFinal = game.status === "final" && game.finalResult;
  const totalOver = totalGoingOver(game);
  const covering = market === "total" ? totalOver : publicCovering(game);

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
            totalIsFavorite={totalFav === "over"}
          />
          <OddsRow
            team={game.home}
            isFavorite={favSide === "home"}
            ml={t.mlOddsHome}
            spread={fmtSpread(t.spread)}
            spreadOdds={t.spreadOddsHome}
            totalLabel={`u ${t.total}`}
            totalOdds={t.totalOddsUnder}
            totalIsFavorite={totalFav === "under"}
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
                ? <>Favorite: {totalFav ? totalFav.toUpperCase() : "—"} {t.total}</>
                : <>Public: {favSide === "home" ? game.home.abbr : game.away.abbr}{" "}
                    {fmtSpread(favSide === "home" ? t.spread : -t.spread)}</>}
            </>
          )}
        </span>
        <ResultPill game={game} covering={covering} market={market} />
      </div>

      {isFinal && t && <ResultLine game={game} market={market} />}
    </article>
  );
}

function OddsRow({
  team, isFavorite, ml, spread, spreadOdds, totalLabel, totalOdds, totalIsFavorite,
}: {
  team: Game["home"]; isFavorite: boolean;
  ml: string | null;
  spread: string; spreadOdds: string | null;
  totalLabel: string; totalOdds: string | null;
  totalIsFavorite: boolean;
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
      <span className="or-cell or-line" data-market="total">
        {totalLabel}
        {totalIsFavorite && <span className="pub-tag" style={{ marginLeft: 6 }}>Fav</span>}
      </span>
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

function ResultPill({ game, covering, market }: { game: Game; covering: boolean | null; market: Market }) {
  if (game.status === "scheduled") {
    return <span className="result-pill result-pending">Upcoming</span>;
  }
  if (market === "total") {
    // covering here is `totalGoingOver`: true = OVER, false = UNDER
    const live = game.status === "live";
    if (game.status === "final" && game.finalResult) {
      if (covering === true) return <span className="result-pill result-public">OVER won</span>;
      if (covering === false) return <span className="result-pill result-vegas">UNDER won</span>;
      return <span className="result-pill result-pending">Push</span>;
    }
    if (covering === true) return <span className="result-pill result-public">{live ? "OVER hit" : "OVER winning"}</span>;
    if (covering === false) return <span className="result-pill result-vegas">UNDER winning</span>;
    return <span className="result-pill result-pending">In play</span>;
  }
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
    const fav = totalFavoriteSide(t);
    const overUnder: "over" | "under" = r.totalGoOver ? "over" : "under";
    const favWon = fav !== null && fav === overUnder;
    const favTag = fav ? ` · Favorite was ${fav.toUpperCase()}` : "";
    return favWon
      ? <div className="card-resultline public">✓ <em>{overUnder.toUpperCase()} won</em> · Total {t.total}{favTag}</div>
      : <div className="card-resultline">✓ <em>{overUnder.toUpperCase()} won</em> · Total {t.total}{favTag}</div>;
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
