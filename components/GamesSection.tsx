"use client";
import { useState } from "react";
import type { Game } from "@/lib/types";
import { isTotalsOnlyLeague } from "@/lib/leagues";
import { GameCard } from "./GameCard";

type Market = "ml" | "spread" | "total";

export function GamesSection({
  label,
  games,
  locked = false,
}: {
  label: string;
  games: Game[];
  /** Free tier — see GameCard. Picks are already stripped from `games`. */
  locked?: boolean;
}) {
  const [market, setMarket] = useState<Market>("spread");

  // A totals-only league (La Liga) has no spread or moneyline pick to show: on a
  // level handicap the favored side is arbitrary, which is exactly why the
  // client asked for totals alone. On that league's own tab we offer the Total
  // market only; in a mixed view its games drop out of the other two markets
  // rather than displaying a line nothing grades. See lib/leagues.ts.
  const totalsOnly = games.length > 0 && games.every((g) => isTotalsOnlyLeague(g.league));
  const active: Market = totalsOnly ? "total" : market;
  const markets: readonly Market[] = totalsOnly ? ["total"] : ["ml", "spread", "total"];
  const shown = active === "total" ? games : games.filter((g) => !isTotalsOnlyLeague(g.league));

  return (
    <section className="games-section" data-market={active}>
      <div className="section-label">{label}</div>

      <div className="market-tabs" role="tablist" aria-label="Market">
        {markets.map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={active === m}
            className={`market-tab${active === m ? " active" : ""}`}
            onClick={() => setMarket(m)}
          >
            {m === "ml" ? "Moneyline" : m === "spread" ? "Spread" : "Total"}
          </button>
        ))}
      </div>

      <div className="odds-grid-head">
        <span className="oh-team">Matchup</span>
        <span className="oh-col" data-market="ml">Moneyline</span>
        <span className="oh-col" data-market="spread">Spread</span>
        <span className="oh-col" data-market="spread">Odds</span>
        <span className="oh-col" data-market="total">Total</span>
        <span className="oh-col" data-market="total">Odds</span>
      </div>

      <div className="games-grid">
        {shown.map((g) => <GameCard key={g.id} game={g} market={active} locked={locked} />)}
      </div>

      {shown.length === 0 && games.length > 0 && (
        <div className="no-trend">
          These games are graded on totals only — switch to the Total tab.
        </div>
      )}
    </section>
  );
}
