"use client";
import { useState } from "react";
import type { Game } from "@/lib/types";
import { GameCard } from "./GameCard";

type Market = "ml" | "spread" | "total";

export function GamesSection({ label, games }: { label: string; games: Game[] }) {
  const [market, setMarket] = useState<Market>("spread");

  return (
    <section className="games-section" data-market={market}>
      <div className="section-label">{label}</div>

      <div className="market-tabs" role="tablist" aria-label="Market">
        {(["ml", "spread", "total"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={market === m}
            className={`market-tab${market === m ? " active" : ""}`}
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
        {games.map((g) => <GameCard key={g.id} game={g} market={market} />)}
      </div>
    </section>
  );
}
