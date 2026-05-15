import { NextResponse } from "next/server";
import { fetchAllGames, SportsGameOddsError, type LeagueFetchError } from "@/lib/sportsgameodds";
import { attachFinalResult, finalizeGames } from "@/lib/merge";
import { upsertGames, recordDaily, setStreak, setLeagueStreaks, readStore, writeStore } from "@/lib/storage";
import { summarizeDay, todayKey } from "@/lib/calc";
import { etDateKeyOf } from "@/lib/time";
import { notifyAdmin } from "@/lib/mailer";
import {
  applyGameToLeagueStreaks,
  buildAtsEmail,
  buildTotalEmail,
  getLeagueStreaks,
} from "@/lib/streak";
import type { League, LeagueStreaks, StreakState } from "@/lib/types";

export const dynamic = "force-dynamic";

const LEAGUES: League[] = ["nba", "mlb", "nfl", "nhl"];

async function runRefresh(opts: { hoursBack?: number; hoursForward?: number } = {}) {
  const fetchErrors: LeagueFetchError[] = [];
  const fetched = await fetchAllGames(LEAGUES, fetchErrors, opts);
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
  // Always re-summarize history from current store state. Drop stale
  // history rows whose referenced games no longer exist in the store
  // (left over from earlier failed/partial refreshes).
  const liveIds = new Set(store0.games.map((g) => g.id));
  store0.history = store0.history
    .map((day) => {
      const dayGames = store0.games.filter(
        (g) => g.status === "final" && etDateKeyOf(g.startTime) === day.date,
      );
      const s = summarizeDay(dayGames);
      return {
        ...day,
        publicWins: s.publicWins,
        vegasWins: s.vegasWins,
        pushes: s.pushes,
        games: Array.from(new Set([
          ...day.games.filter((id) => liveIds.has(id)),
          ...dayGames.map((g) => g.id),
        ])),
      };
    })
    .filter((day) => day.games.length > 0);
  await writeStore(store0);

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

  // Per-league × per-category (ATS + Total) streaks with separate emails.
  const perLeague: Partial<Record<League, LeagueStreaks>> = { ...(store.streaks ?? {}) };
  for (const g of todays.filter((g) => g.status === "final" && g.finalResult)) {
    const prev = getLeagueStreaks(perLeague, g.league);
    perLeague[g.league] = applyGameToLeagueStreaks(prev, g, today);
  }
  const afterPer = await readStore();
  const gameByIdPer = new Map(afterPer.games.map((g) => [g.id, g]));
  for (const league of LEAGUES) {
    const ls = perLeague[league];
    if (!ls) continue;
    const atsEmail = buildAtsEmail(league, ls.ats, gameByIdPer);
    if (atsEmail) {
      try {
        await notifyAdmin({ subject: atsEmail.subject, text: atsEmail.text });
      } catch (e) {
        console.warn("[refresh] notifyAdmin (ats) failed:", (e as Error).message);
      }
      ls.ats = { ...ls.ats, lastNotifiedCount: atsEmail.newLastNotifiedCount };
    }
    const totalEmail = buildTotalEmail(league, ls.total, gameByIdPer);
    if (totalEmail) {
      try {
        await notifyAdmin({ subject: totalEmail.subject, text: totalEmail.text });
      } catch (e) {
        console.warn("[refresh] notifyAdmin (total) failed:", (e as Error).message);
      }
      ls.total = { ...ls.total, lastNotifiedCount: totalEmail.newLastNotifiedCount };
    }
  }
  await setLeagueStreaks(perLeague);

  return { ok: true, count: all.length, streak, streaks: perLeague, fetchErrors };
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
  const days = Number(url.searchParams.get("days"));
  const opts = Number.isFinite(days) && days > 0
    ? { hoursBack: days * 24, hoursForward: 48 }
    : {};
  if (!force) {
    const store = await readStore();
    const ageMs = Date.now() - new Date(store.lastUpdated).getTime();
    if (Number.isFinite(ageMs) && ageMs < MIN_INTERVAL_MS) {
      return { ok: true, skipped: true, ageMs, count: store.games.length };
    }
  }
  return runRefresh(opts);
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
