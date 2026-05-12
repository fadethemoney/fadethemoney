import { NextResponse } from "next/server";
import { fetchAllGames, SportsGameOddsError, type LeagueFetchError } from "@/lib/sportsgameodds";
import { attachFinalResult, finalizeGames } from "@/lib/merge";
import { upsertGames, recordDaily, setStreak, readStore, writeStore } from "@/lib/storage";
import { summarizeDay, todayKey } from "@/lib/calc";
import { etDateKeyOf } from "@/lib/time";
import { notifyAdmin } from "@/lib/mailer";
import type { League, StreakState } from "@/lib/types";

export const dynamic = "force-dynamic";

const LEAGUES: League[] = ["nba", "mlb", "nfl", "nhl"];

async function runRefresh() {
  const fetchErrors: LeagueFetchError[] = [];
  const fetched = await fetchAllGames(LEAGUES, fetchErrors);
  const all = finalizeGames(fetched);
  await upsertGames(all);

  // Backfill finalResult on any stored final missing it, then re-summarize
  // history so the results page reflects corrected counts.
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

  return { ok: true, count: all.length, streak, fetchErrors };
}

function authorize(req: Request): NextResponse | null {
  const token = process.env.REFRESH_TOKEN;
  if (!token) return null;
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${token}`) return null;
  if (req.headers.get("x-vercel-cron")) return null;
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

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
    const isAuthIssue = err instanceof SportsGameOddsError && err.message.includes("API_KEY");
    return NextResponse.json(
      {
        ok: false,
        error: err.message,
        hint: isAuthIssue
          ? "Set SPORTSGAMEODDS_API_KEY in .env.local (dev) or Vercel env vars (prod)."
          : "If this mentions BLOB_READ_WRITE_TOKEN, set up Vercel Blob and redeploy.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
