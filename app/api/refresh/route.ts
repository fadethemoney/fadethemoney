import { NextResponse } from "next/server";
import { fetchAllGames, SportsGameOddsError, type LeagueFetchError } from "@/lib/sportsgameodds";
import { attachFinalResult, finalizeGames } from "@/lib/merge";
import { upsertGames, recordDaily, setStreak, setLeagueStreaks, readStore, writeStore } from "@/lib/storage";
import { summarizeDay, todayKey } from "@/lib/calc";
import { etDateKeyOf } from "@/lib/time";
import { notifyAdmin } from "@/lib/mailer";
import {
  atsWinnerOf,
  buildAtsEmails,
  buildMoneylineEmails,
  buildTotalEmails,
  findNextGame,
  getLeagueStreaks,
  moneylineWinnerOf,
  totalWinnerOf,
  updateCategoryStreak,
} from "@/lib/streak";
import type { League, LeagueStreaks } from "@/lib/types";

export const dynamic = "force-dynamic";

const LEAGUES: League[] = ["nba", "wnba", "mlb", "nfl", "nhl"];

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
  // Confirmed finals only — a game we've carried as final with a settled box
  // score across at least two refreshes (see upsertGames). Grading the instant
  // the odds feed first flags a game final risks locking an in-progress score the
  // feed sent as if final (the LAD 2-1 / real 12-3 bug); waiting one cycle lets
  // it settle.
  const confirmedFinals = store.games.filter(
    (g) => g.status === "final" && g.finalResult && g.confirmedFinal,
  );
  const gameById = new Map(store.games.map((g) => [g.id, g]));

  // Global cross-league ATS streak (homepage hero eyebrow + StreakBanner). The
  // detail-less global email was retired earlier; the per-league emails below
  // carry the formatted alerts. Re-graded from current stored scores each tick,
  // so a verdict that changes after a late box-score correction self-heals.
  const globalStreak = updateCategoryStreak(store.streak, confirmedFinals, gameById, atsWinnerOf);
  await setStreak(globalStreak);

  // Per-league × per-category (ATS + Total + Moneyline) streaks with emails.
  const perLeague: Partial<Record<League, LeagueStreaks>> = { ...(store.streaks ?? {}) };
  for (const league of LEAGUES) {
    const prev = getLeagueStreaks(perLeague, league);
    const lf = confirmedFinals.filter((g) => g.league === league);
    const ls: LeagueStreaks = {
      ats: updateCategoryStreak(prev.ats, lf, gameById, atsWinnerOf),
      total: updateCategoryStreak(prev.total, lf, gameById, totalWinnerOf),
      moneyline: updateCategoryStreak(prev.moneyline, lf, gameById, moneylineWinnerOf),
    };
    const nextGame = findNextGame(store.games, league);
    for (const email of buildAtsEmails(league, ls.ats, gameById, nextGame)) {
      try {
        await notifyAdmin({ subject: email.subject, text: email.text });
      } catch (e) {
        console.warn("[refresh] notifyAdmin (ats) failed:", (e as Error).message);
      }
      ls.ats = { ...ls.ats, lastNotifiedCount: email.newLastNotifiedCount };
    }
    for (const email of buildTotalEmails(league, ls.total, gameById, nextGame)) {
      try {
        await notifyAdmin({ subject: email.subject, text: email.text });
      } catch (e) {
        console.warn("[refresh] notifyAdmin (total) failed:", (e as Error).message);
      }
      ls.total = { ...ls.total, lastNotifiedCount: email.newLastNotifiedCount };
    }
    // Moneyline streak EMAILS disabled 2026-06-22 at the client's request. We
    // still advance lastNotifiedCount so the on-site moneyline streak keeps
    // tracking and re-enabling later won't dump a backlog. To re-enable, restore
    // the notifyAdmin call inside this loop.
    for (const email of buildMoneylineEmails(league, ls.moneyline, gameById, nextGame)) {
      ls.moneyline = { ...ls.moneyline, lastNotifiedCount: email.newLastNotifiedCount };
    }
    perLeague[league] = ls;
  }
  await setLeagueStreaks(perLeague);

  return { ok: true, count: all.length, streak: globalStreak, streaks: perLeague, fetchErrors };
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
