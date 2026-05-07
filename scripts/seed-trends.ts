import { readStore, writeStore } from "../lib/storage";
import { publicCovering } from "../lib/calc";
import type { BettingTrend, Side } from "../lib/types";

if (process.env.NODE_ENV === "production") {
  console.error(
    "[seed-trends] Refusing to run in production. " +
      "This script generates synthetic Math.random() betting data for local demos only."
  );
  process.exit(1);
}
if (process.env.ALLOW_SEED_TRENDS !== "1") {
  console.error(
    "[seed-trends] Disabled by default. To run locally, set ALLOW_SEED_TRENDS=1 in your shell."
  );
  process.exit(1);
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function roundHalf(n: number) {
  return Math.round(n * 2) / 2;
}

function fakeTrend(league: string): BettingTrend {
  const isMlb = league === "mlb";
  const spread = roundHalf(rand(isMlb ? -1.5 : -10, isMlb ? 1.5 : 10));
  const total = isMlb ? roundHalf(rand(7, 11)) : roundHalf(rand(205, 235));
  const pubHome = Math.round(rand(20, 80));
  const pubAway = 100 - pubHome;
  const monHome = Math.max(5, Math.min(95, pubHome + Math.round(rand(-15, 15))));
  const monAway = 100 - monHome;
  const pickedSide: Side = pubHome >= pubAway ? "home" : "away";
  const pubOver = Math.round(rand(20, 80));
  const totalSide = pubOver >= 50 ? "over" : "under";
  return {
    spread,
    total,
    publicPctHome: pubHome,
    publicPctAway: pubAway,
    moneyPctHome: monHome,
    moneyPctAway: monAway,
    mlOddsHome: null,
    mlOddsAway: null,
    mlBetPctHome: pubHome,
    mlBetPctAway: pubAway,
    spreadMoneyPctHome: monHome,
    spreadMoneyPctAway: monAway,
    pickedSide,
    totalSide,
    totalPublicPct: totalSide === "over" ? pubOver : 100 - pubOver,
    totalMoneyPct: Math.round(rand(20, 80)),
    totalOverBetPct: pubOver,
    totalUnderBetPct: 100 - pubOver,
    totalOverMoneyPct: Math.round(rand(20, 80)),
    totalUnderMoneyPct: Math.round(rand(20, 80)),
    source: "synthetic",
    trendUpdatedAt: new Date().toISOString(),
  };
}

async function run() {
  const store = await readStore();
  store.games = store.games.map((g) => {
    const trend = g.trend ?? fakeTrend(g.league);
    const next = { ...g, trend };
    next.publicCovering = publicCovering(next);
    if (next.status === "final") {
      const margin = (next.home.score ?? 0) + trend.spread - (next.away.score ?? 0);
      const total = (next.home.score ?? 0) + (next.away.score ?? 0);
      next.finalResult = {
        winnerSide: (next.home.score ?? 0) > (next.away.score ?? 0) ? "home" : "away",
        margin: Math.abs((next.home.score ?? 0) - (next.away.score ?? 0)),
        publicCovered: margin === 0 ? null : next.publicCovering ?? null,
        totalGoOver: total === trend.total ? null : total > trend.total,
      };
    }
    return next;
  });

  // Recompute today summary + streak from synthetic finals
  const today = new Date().toISOString().slice(0, 10);
  const todays = store.games.filter((g) => g.startTime.slice(0, 10) === today);
  let publicWins = 0, vegasWins = 0, pushes = 0;
  for (const g of todays) {
    if (g.status !== "final" || !g.finalResult) continue;
    const c = g.finalResult.publicCovered;
    if (c === null) pushes++;
    else if (c) publicWins++;
    else vegasWins++;
  }
  const idx = store.history.findIndex((h) => h.date === today);
  const rec = { date: today, publicWins, vegasWins, pushes, games: todays.map((g) => g.id) };
  if (idx >= 0) store.history[idx] = rec; else store.history.unshift(rec);

  // Build a simple streak from chronological finals
  const finals = todays
    .filter((g) => g.status === "final" && g.finalResult)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  let current: "public" | "vegas" | null = null;
  let count = 0;
  const history = [];
  for (const g of finals) {
    const c = g.finalResult!.publicCovered;
    if (c === null) continue;
    const w = c ? "public" : "vegas";
    if (current === w) count++; else { current = w; count = 1; }
    history.unshift({ date: `${today}:${g.id}`, winner: w as "public" | "vegas" });
  }
  store.streak = { current, count, lastNotifiedCount: count, history: history.slice(0, 50) };

  // Backfill 6 prior days of history so /results is populated
  const dayMs = 86_400_000;
  for (let i = 1; i <= 6; i++) {
    const d = new Date(Date.now() - i * dayMs).toISOString().slice(0, 10);
    if (store.history.find((h) => h.date === d)) continue;
    const pw = Math.floor(rand(2, 9));
    const vw = Math.floor(rand(2, 9));
    store.history.push({ date: d, publicWins: pw, vegasWins: vw, pushes: Math.random() < 0.3 ? 1 : 0, games: [] });
  }
  store.history.sort((a, b) => (a.date < b.date ? 1 : -1));
  store.history = store.history.slice(0, 30);

  await writeStore(store);
  console.log(`[seed-trends] enriched ${store.games.length} games, today: P${publicWins}-V${vegasWins}, streak ${current}x${count}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
