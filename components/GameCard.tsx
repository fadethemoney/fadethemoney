import type { Game, Side } from "@/lib/types";
import { publicCovering } from "@/lib/calc";

function fmtSpread(n: number) {
  if (n === 0) return "PK";
  return n > 0 ? `+${n}` : `${n}`;
}

function fmtOdds(o: string | null) {
  if (!o) return "—";
  return o.startsWith("+") || o.startsWith("-") ? o : `+${o}`;
}

const HEAVY_THRESHOLD = 65;

function Pct({ n, dollar, market }: { n: number; dollar?: boolean; market: string }) {
  const cls = `or-cell or-pct${dollar ? " dollar" : ""}`;
  if (!Number.isFinite(n) || n === 0) {
    return <span className={cls} data-market={market}>—</span>;
  }
  const heavy = n >= HEAVY_THRESHOLD;
  return (
    <span className={`${cls}${heavy ? " heavy" : ""}`} data-market={market}>
      {heavy && <span className="heavy-dot" aria-hidden />}
      {Math.round(n)}%
    </span>
  );
}

function timeLabel(g: Game) {
  if (g.status === "live") return g.period ?? "LIVE";
  if (g.status === "final") return g.period ?? "Final";
  return new Date(g.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function GameCard({ game }: { game: Game }) {
  const t = game.trend;
  const publicSide: Side | null = t?.pickedSide ?? null;
  const covering = publicCovering(game);
  const isFinal = game.status === "final" && game.finalResult;

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
            isPublic={publicSide === "away"}
            odds={t.mlOddsAway}
            mlBet={t.mlBetPctAway}
            mlMoney={t.moneyPctAway}
            line={fmtSpread(-t.spread)}
            spreadBet={t.publicPctAway}
            spreadMoney={t.spreadMoneyPctAway}
            totalLabel={`o ${t.total}`}
            totalBet={t.totalOverBetPct}
            totalMoney={t.totalOverMoneyPct}
          />
          <OddsRow
            team={game.home}
            isPublic={publicSide === "home"}
            odds={t.mlOddsHome}
            mlBet={t.mlBetPctHome}
            mlMoney={t.moneyPctHome}
            line={fmtSpread(t.spread)}
            spreadBet={t.publicPctHome}
            spreadMoney={t.spreadMoneyPctHome}
            totalLabel={`u ${t.total}`}
            totalBet={t.totalUnderBetPct}
            totalMoney={t.totalUnderMoneyPct}
          />
        </div>
      ) : (
        <>
          <TeamLine team={game.away} />
          <TeamLine team={game.home} />
          <div className="no-trend">No betting trend yet</div>
        </>
      )}

      <div className="card-footer">
        <span>{t ? `Public: ${publicSide === "home" ? game.home.abbr : game.away.abbr} ${fmtSpread(publicSide === "home" ? t.spread : -t.spread)}` : "—"}</span>
        <ResultPill game={game} covering={covering} />
      </div>

      {isFinal && t && <ResultLine game={game} />}
    </article>
  );
}

function OddsRow({
  team, isPublic, odds, mlBet, mlMoney,
  line, spreadBet, spreadMoney,
  totalLabel, totalBet, totalMoney,
}: {
  team: Game["home"]; isPublic: boolean;
  odds: string | null; mlBet: number; mlMoney: number;
  line: string; spreadBet: number; spreadMoney: number;
  totalLabel: string; totalBet: number; totalMoney: number;
}) {
  return (
    <div className={`odds-row${isPublic ? " is-public" : ""}`}>
      <span className="or-cell or-team">
        <span className="team-abbr">{team.abbr}</span>
        <span className="team-name">{team.name}</span>
        <span className="team-score">{team.score ?? ""}</span>
        {isPublic && <span className="pub-tag">Pub</span>}
      </span>
      <span className="or-cell or-line" data-market="ml">{fmtOdds(odds)}</span>
      <Pct n={mlBet} market="ml" />
      <Pct n={mlMoney} dollar market="ml" />
      <span className="or-cell or-line" data-market="spread">{line}</span>
      <Pct n={spreadBet} market="spread" />
      <Pct n={spreadMoney} dollar market="spread" />
      <span className="or-cell or-line" data-market="total">{totalLabel}</span>
      <Pct n={totalBet} market="total" />
      <Pct n={totalMoney} dollar market="total" />
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
  if (game.status === "final" && game.finalResult) {
    const c = game.finalResult.publicCovered;
    if (c === true) return <span className="result-pill result-public">Public won</span>;
    if (c === false) return <span className="result-pill result-vegas">Vegas won</span>;
    return <span className="result-pill result-pending">Push</span>;
  }
  if (covering === true) return <span className="result-pill result-public">Public winning</span>;
  if (covering === false) return <span className="result-pill result-vegas">Vegas winning</span>;
  return <span className="result-pill result-pending">Push</span>;
}

function ResultLine({ game }: { game: Game }) {
  const r = game.finalResult!;
  const t = game.trend!;
  const covered = r.publicCovered;
  const totalText =
    r.totalGoOver === null
      ? `Total push ${t.total}`
      : `Total ${r.totalGoOver ? "OVER" : "UNDER"} ${t.total}`;
  if (covered === true) {
    return <div className="card-resultline public">✓ <em>Public covered</em> · {totalText}</div>;
  }
  if (covered === false) {
    return <div className="card-resultline">✗ <em>Public did not cover</em> · {totalText}</div>;
  }
  return <div className="card-resultline">— Push · {totalText}</div>;
}
