import { NextResponse } from "next/server";
import { fetchLeagueGamesHistorical } from "@/lib/sportsgameodds";
import { attachFinalResult } from "@/lib/merge";
import { readStore, writeStore } from "@/lib/storage";
import { summarizeDay } from "@/lib/calc";
import { etDateKeyOf } from "@/lib/time";
import type { DailyRecord, Game, League } from "@/lib/types";

export const dynamic = "force-dynamic";
// One-time historical pulls run longer than a normal refresh; Pro allows 300s.
export const maxDuration = 300;

const LEAGUES: League[] = ["nba", "wnba", "mlb", "nfl", "nhl"];
const CHUNK_DAYS = 10;     // keep each league call under the pagination cap
const MAX_DAYS = 30;       // the store retains ~30 days of daily history
const DAY_MS = 86_400_000;

/**
 * Backfill old finished games into the daily ledger using the Pro plan's
 * historical-data access, graded against the OPENING line (the only safe
 * pregame number — closing fields are live-contaminated on finals).
 *
 * Deliberately separate from /api/refresh: it must NOT run the streak/email
 * pipeline (that would blast alerts for month-old games). It only fills gaps —
 * games the live cron already locked at kickoff are left untouched — then
 * rebuilds store.history. Idempotent: re-running only adds still-missing games.
 */
function authorize(req: Request): NextResponse | null {
  const token = process.env.REFRESH_TOKEN;
  if (!token) return null; // no token configured → open, same as /api/refresh
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${token}`) return null;
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

async function runBackfill(days: number) {
  const now = Date.now();

  // Split the look-back into chunks; each chunk is fetched for all 5 leagues in
  // parallel (Pro = 300 req/min, so concurrency is safe).
  const fetched: Game[] = [];
  const errors: { league: League; message: string }[] = [];
  for (let start = 0; start < days; start += CHUNK_DAYS) {
    const end = Math.min(start + CHUNK_DAYS, days);
    const after = new Date(now - end * DAY_MS).toISOString();
    const before = new Date(now - start * DAY_MS).toISOString();
    const results = await Promise.allSettled(
      LEAGUES.map((l) => fetchLeagueGamesHistorical(l, after, before)),
    );
    results.forEach((r, i) => {
      if (r.status === "fulfilled") fetched.push(...r.value);
      else errors.push({ league: LEAGUES[i], message: (r.reason as Error).message });
    });
  }

  const store = await readStore();
  const games = new Map(store.games.map((g) => [g.id, g]));
  let added = 0;
  for (const g of fetched) {
    // Never override a game the live cron already locked at kickoff — only fill
    // gaps. Score the opening-line trend now so the verdict persists.
    if (games.get(g.id)?.trend) continue;
    games.set(g.id, attachFinalResult(g));
    added += 1;
  }
  store.games = Array.from(games.values()).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  // Rebuild the daily ledger from every stored final; keep the most recent days.
  const byDay = new Map<string, Game[]>();
  for (const g of store.games) {
    if (g.status !== "final" || !g.finalResult) continue;
    const d = etDateKeyOf(g.startTime);
    const arr = byDay.get(d) ?? [];
    arr.push(g);
    byDay.set(d, arr);
  }
  const history: DailyRecord[] = [];
  for (const [date, dayGames] of byDay) {
    history.push({ ...summarizeDay(dayGames), date, games: dayGames.map((g) => g.id) });
  }
  history.sort((a, b) => (a.date < b.date ? 1 : -1));
  store.history = history.slice(0, MAX_DAYS);

  await writeStore(store);

  const graded = store.history.reduce(
    (n, d) => n + d.publicWins + d.vegasWins + d.pushes,
    0,
  );
  return {
    ok: true,
    days,
    fetchedFinals: fetched.length,
    added,
    historyDays: store.history.length,
    gradedGames: graded,
    errors,
  };
}

async function handle(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;
  try {
    const d = Number(new URL(req.url).searchParams.get("days"));
    const days = Number.isFinite(d) && d > 0 ? Math.min(d, MAX_DAYS) : MAX_DAYS;
    return NextResponse.json(await runBackfill(days));
  } catch (e) {
    const err = e as Error;
    console.error("[backfill] failed:", err.stack ?? err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
