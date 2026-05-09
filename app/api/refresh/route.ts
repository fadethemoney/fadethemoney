import { NextResponse } from "next/server";
import { fetchEspnScoreboard } from "@/lib/espn";
import { scrapeLeagueTrends } from "@/lib/sportsbettingdime";
import { mergeTrends, attachFinalResult } from "@/lib/merge";
import { upsertGames, recordDaily, setStreak, setTotalsStreak, readStore, writeStore } from "@/lib/storage";
import { summarizeDay, todayKey } from "@/lib/calc";
import { etDateKeyOf } from "@/lib/time";
import { notifyAdmin } from "@/lib/mailer";
import type { League, StreakState, TotalsStreakState, Game } from "@/lib/types";

export const dynamic = "force-dynamic";

const LEAGUES: League[] = ["nba", "mlb", "nfl", "nhl"];

async function runRefresh() {
  const all = [];
  for (const league of LEAGUES) {
    try {
      const espn = await fetchEspnScoreboard(league);
      const trends = await scrapeLeagueTrends(league).catch(() => []);
      all.push(...mergeTrends(espn, trends));
    } catch (e) {
      console.warn("[refresh]", league, (e as Error).message);
    }
  }
  await upsertGames(all);

  // Backfill finalResult on any stored final that has a trend but is missing
  // it (older data from before the merge.ts fix). Then re-summarize history
  // so the results page reflects the corrected counts.
  const store0 = await readStore();
  let backfilled = false;
  store0.games = store0.games.map((g) => {
    if (g.status === "final" && g.trend && !g.finalResult) {
      backfilled = true;
      return attachFinalResult(g);
    }
    return g;
  });
  if (backfilled) {
    for (const day of store0.history) {
      const dayGames = store0.games.filter((g) => day.games.includes(g.id));
      const s = summarizeDay(dayGames);
      day.publicWins = s.publicWins;
      day.vegasWins = s.vegasWins;
      day.pushes = s.pushes;
    }
    await writeStore(store0);
  }

  const today = todayKey();
  const todays = all.filter((g) => etDateKeyOf(g.startTime) === today);
  const summary = summarizeDay(todays);
  await recordDaily(today, { ...summary, games: todays.map((g) => g.id) });

  const store = await readStore();
  const streak: StreakState = { ...store.streak };
  for (const g of todays.filter((g) => g.status === "final" && g.finalResult)) {
    const c = g.finalResult!.publicCovered;
    if (c === null) continue;
    const winner = c ? "public" : "vegas";
    if (streak.history.find((h) => h.date === `${today}:${g.id}`)) continue;
    if (streak.current === winner) streak.count += 1;
    else { streak.current = winner; streak.count = 1; streak.lastNotifiedCount = 0; }
    streak.history.unshift({ date: `${today}:${g.id}`, winner });
  }
  streak.history = streak.history.slice(0, 50);
  if (streak.count >= 2 && streak.count > streak.lastNotifiedCount) {
    try {
      await notifyAdmin({
        subject: `Fade The Money — ${streak.current} on a ${streak.count}-game streak`,
        text: `${streak.current} has won ${streak.count} bets in a row.`,
      });
    } catch (e) {
      console.warn("[refresh] notifyAdmin failed:", (e as Error).message);
    }
    streak.lastNotifiedCount = streak.count;
  }
  await setStreak(streak);

  // ---- Totals (over/under) streak ----
  const totalsStreak: TotalsStreakState = store.totalsStreak ?? {
    current: null,
    count: 0,
    lastNotifiedCount: 0,
    history: [],
  };
  const finalsForTotals = todays.filter(
    (g): g is Game & { trend: NonNullable<Game["trend"]>; finalResult: NonNullable<Game["finalResult"]> } =>
      g.status === "final" && !!g.finalResult && !!g.trend && !!g.trend.totalSide,
  );
  for (const g of finalsForTotals) {
    const went = g.finalResult.totalGoOver; // true=over, false=under, null=push
    if (went === null) continue;
    const publicSide = g.trend.totalSide; // "over" | "under"
    const publicHit = (publicSide === "over" && went) || (publicSide === "under" && !went);
    const winner: "public" | "vegas" = publicHit ? "public" : "vegas";
    const key = `${today}:${g.id}`;
    if (totalsStreak.history.find((h) => h.date === key)) continue;
    if (totalsStreak.current === winner) totalsStreak.count += 1;
    else { totalsStreak.current = winner; totalsStreak.count = 1; totalsStreak.lastNotifiedCount = 0; }
    totalsStreak.history.unshift({ date: key, winner });
  }
  totalsStreak.history = totalsStreak.history.slice(0, 50);
  if (totalsStreak.count >= 2 && totalsStreak.count > totalsStreak.lastNotifiedCount) {
    try {
      await notifyAdmin({
        subject: `Fade The Money — Totals · ${totalsStreak.current} on a ${totalsStreak.count}-game O/U streak`,
        text: `${totalsStreak.current} has won ${totalsStreak.count} over/under bets in a row.`,
      });
    } catch (e) {
      console.warn("[refresh] totals notifyAdmin failed:", (e as Error).message);
    }
    totalsStreak.lastNotifiedCount = totalsStreak.count;
  }
  await setTotalsStreak(totalsStreak);

  return { ok: true, count: all.length, streak, totalsStreak };
}

function authorize(req: Request): NextResponse | null {
  const token = process.env.REFRESH_TOKEN;
  if (!token) return null; // unguarded in dev
  const auth = req.headers.get("authorization") ?? "";
  // Vercel cron sets a "x-vercel-cron" header on its GET pings; honor that too.
  if (auth === `Bearer ${token}`) return null;
  if (req.headers.get("x-vercel-cron")) return null;
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

/**
 * Skip the upstream fetch if the store was updated within MIN_INTERVAL_MS.
 * Cheap protection against client-poll storms hammering ESPN/SBD; the cron
 * and explicit ?force=1 calls bypass this.
 */
const MIN_INTERVAL_MS = 60_000;

async function maybeRefresh(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1" || !!req.headers.get("x-vercel-cron");
  if (!force) {
    const store = await readStore();
    const ageMs = Date.now() - new Date(store.lastUpdated).getTime();
    if (Number.isFinite(ageMs) && ageMs < MIN_INTERVAL_MS) {
      return { ok: true, skipped: true, ageMs, count: store.games.length };
    }
  }
  return runRefresh();
}

async function handle(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await maybeRefresh(req));
  } catch (e) {
    const err = e as Error;
    console.error("[refresh] failed:", err.stack ?? err.message);
    return NextResponse.json(
      {
        ok: false,
        error: err.message,
        hint:
          "If this mentions BLOB_READ_WRITE_TOKEN or 'put is not a function', set up Vercel Blob and redeploy.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
