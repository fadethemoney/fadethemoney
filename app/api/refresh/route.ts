import { NextResponse } from "next/server";
import { fetchAllGames, SportsGameOddsError, type LeagueFetchError } from "@/lib/sportsgameodds";
import { attachFinalResult, finalizeGames } from "@/lib/merge";
import { upsertGames, recordDaily, setStreak, setLeagueStreaks, readStore, writeStore } from "@/lib/storage";
import { summarizeDay, todayKey } from "@/lib/calc";
import { etDateKeyOf } from "@/lib/time";
import { notifyAdmin } from "@/lib/mailer";
import {
  applyGameToLeagueStreaks,
  buildAtsEmails,
  buildTotalEmails,
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

  // Attach (or re-attach) finalResult on every stored final using the LOCKED
  // pregame trend. Idempotent: re-running fixes verdicts that were previously
  // computed against a live in-game total.
  const store0 = await readStore();
  store0.games = store0.games.map((g) => {
    if (g.status === "final" && g.trend) return attachFinalResult(g);
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

  // Pull from the store (post-upsert, post-finalResult-attach) so streak and
  // summary logic see locked-trend verdicts, not live-trend ones from `all`.
  const store = await readStore();
  const today = todayKey();
  const todays = store.games.filter((g) => etDateKeyOf(g.startTime) === today);
  const summary = summarizeDay(todays);
  await recordDaily(today, { ...summary, games: todays.map((g) => g.id) });
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
  // Use the locked, post-finalResult-attach data from `todays` (store-backed)
  // — never the live `all` array, whose verdicts may be stale.
  const perLeague: Partial<Record<League, LeagueStreaks>> = { ...(store.streaks ?? {}) };
  // One-time migration: stored Total streak history used to record winners
  // as "over"/"under" and was further corrupted by the live-trend verdict
  // bug. Drop any stale total streak so it rebuilds cleanly under the new
  // public/vegas convention from the corrected stored finals.
  for (const league of LEAGUES) {
    const ls = perLeague[league];
    if (!ls) continue;
    const hasLegacy = ls.total.history.some(
      (h) => (h.winner as string) === "over" || (h.winner as string) === "under",
    );
    const legacyCurrent = (ls.total.current as string | null) === "over"
      || (ls.total.current as string | null) === "under";
    if (hasLegacy || legacyCurrent) {
      perLeague[league] = {
        ...ls,
        total: { current: null, count: 0, lastNotifiedCount: 0, history: [] },
      };
    }
  }
  // Rebuild totals streak forward from corrected finalResults so any games
  // we already had stored (with the old buggy verdict) get re-counted with
  // the fixed totalGoOver. ATS history stays as-is.
  const finalsByDate = [...store.games]
    .filter((g) => g.status === "final" && g.finalResult)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  for (const league of LEAGUES) {
    const ls = perLeague[league];
    if (!ls || ls.total.count !== 0) continue;
    let rebuilt = ls;
    for (const g of finalsByDate) {
      if (g.league !== league) continue;
      const day = etDateKeyOf(g.startTime);
      const onlyTotal = applyGameToLeagueStreaks(
        { ats: rebuilt.ats, total: rebuilt.total },
        g,
        day,
      );
      rebuilt = { ats: rebuilt.ats, total: onlyTotal.total };
    }
    // Mark the rebuilt count as already-notified so we don't blast a wave
    // of historical milestone alerts during this migration tick.
    rebuilt = {
      ats: rebuilt.ats,
      total: { ...rebuilt.total, lastNotifiedCount: rebuilt.total.count },
    };
    perLeague[league] = rebuilt;
  }
  for (const g of todays.filter((g) => g.status === "final" && g.finalResult)) {
    const prev = getLeagueStreaks(perLeague, g.league);
    perLeague[g.league] = applyGameToLeagueStreaks(prev, g, today);
  }
  const afterPer = await readStore();
  const gameByIdPer = new Map(afterPer.games.map((g) => [g.id, g]));
  for (const league of LEAGUES) {
    const ls = perLeague[league];
    if (!ls) continue;
    for (const email of buildAtsEmails(league, ls.ats, gameByIdPer)) {
      try {
        await notifyAdmin({ subject: email.subject, text: email.text });
      } catch (e) {
        console.warn("[refresh] notifyAdmin (ats) failed:", (e as Error).message);
      }
      ls.ats = { ...ls.ats, lastNotifiedCount: email.newLastNotifiedCount };
    }
    for (const email of buildTotalEmails(league, ls.total, gameByIdPer)) {
      try {
        await notifyAdmin({ subject: email.subject, text: email.text });
      } catch (e) {
        console.warn("[refresh] notifyAdmin (total) failed:", (e as Error).message);
      }
      ls.total = { ...ls.total, lastNotifiedCount: email.newLastNotifiedCount };
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
