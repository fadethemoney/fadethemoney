import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { fetchAllGames, SportsGameOddsError, type LeagueFetchError } from "@/lib/sportsgameodds";
import { attachFinalResult, finalizeGames } from "@/lib/merge";
import {
  upsertGames,
  recordDaily,
  setStreak,
  setLeagueStreaks,
  setFetchAlert,
  acquireLease,
  releaseLease,
  readStore,
  writeStore,
} from "@/lib/storage";
import { summarizeDay, todayKey } from "@/lib/calc";
import { filterRankedAllLeagues } from "@/lib/rankings";
import { etDateKeyOf } from "@/lib/time";
import { notifyAdmin, sendStreakAlert, type NotifyResult } from "@/lib/mailer";
import {
  atsWinnerOf,
  buildAtsEmails,
  buildCorrectionEmail,
  buildMoneylineEmails,
  buildTotalEmails,
  findNextGame,
  getLeagueStreaks,
  moneylineWinnerOf,
  totalWinnerOf,
  updateCategoryStreak,
} from "@/lib/streak";
import type { FetchAlertState, League, LeagueStreaks } from "@/lib/types";

export const dynamic = "force-dynamic";

const LEAGUES: League[] = ["nba", "wnba", "mlb", "nfl", "nhl", "ncaab", "ncaaf"];

async function runRefresh(opts: { hoursBack?: number; hoursForward?: number } = {}) {
  // Serialize overlapping cron invocations: Vercel cron is best-effort and can
  // double-fire the same tick. A second run that can't take the lease skips
  // rather than racing the first (which would clobber Blob writes / double-send a
  // milestone email). The lease self-expires and acquisition is fail-open.
  const holder = randomUUID();
  if (!(await acquireLease(holder))) {
    return { ok: true, skipped: true, reason: "locked" as const };
  }
  // Fetch-alert bookkeeping is deliberately the LAST store write of the tick.
  // It shares the single store blob with the pipeline, and Blob reads are
  // eventually consistent: written up front (as it used to be), the pipeline's
  // own readStore → writeStore cycle can resurrect the pre-alert snapshot and
  // undo it, which is how RECOVERED went out twice on 2026-08-11. Running it
  // here also means a mid-pipeline crash still records the outage, and it stays
  // inside the lease so releaseLease (warm-cache read) preserves the write.
  const fetchErrors: LeagueFetchError[] = [];
  try {
    return await doRefresh(opts, fetchErrors);
  } finally {
    try {
      await alertOnFetchErrors(fetchErrors);
    } catch (e) {
      console.warn("[refresh] fetch-alert bookkeeping failed:", (e as Error).message);
    }
    await releaseLease(holder);
  }
}

async function doRefresh(
  opts: { hoursBack?: number; hoursForward?: number } = {},
  fetchErrors: LeagueFetchError[] = [],
) {
  const fetched = await fetchAllGames(LEAGUES, fetchErrors, opts);
  // College leagues: keep AP-ranked matchups only (client: "just ranked",
  // 2026-07-12). Full NCAA slates would flood the dashboard and streak emails.
  const rankedOnly = await filterRankedAllLeagues(fetched);
  const all = finalizeGames(rankedOnly);
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

    // A re-grade (e.g. an official post-final score correction now reachable via
    // the wider fetch window) can shrink or flip a streak whose milestone we
    // ALREADY emailed. A sent email can't be unsent, so send one corrective
    // notice. Best-effort: a failed send is warned, not retried — the on-site
    // streak has already self-healed via updateCategoryStreak.
    for (const corr of [
      buildCorrectionEmail(league, "ats", prev.ats, gameById, atsWinnerOf),
      buildCorrectionEmail(league, "total", prev.total, gameById, totalWinnerOf),
    ]) {
      if (!corr) continue;
      try {
        await sendStreakAlert({ league, subject: corr.subject, text: corr.text });
      } catch (e) {
        console.warn(`[refresh] alert (${corr.category} correction) failed:`, (e as Error).message);
      }
    }

    // Milestone emails (counts 2 and 4). Advance lastNotifiedCount ONLY after a
    // confirmed send; on failure, break so this milestone stays in the notify
    // window and retries next tick (instead of being silently skipped) and a
    // later milestone can't leapfrog an un-sent earlier one.
    //
    // Phase 3: these now fan out to every entitled member who has this league
    // switched on (lib/alert-recipients.ts), not just ADMIN_EMAIL. A delivery
    // failure holds the milestone open for the next tick; "skipped" (no mail
    // provider, or nobody subscribed to this league) does not — there is
    // nothing to retry, so the streak moves on.
    for (const email of buildAtsEmails(league, ls.ats, gameById, nextGame)) {
      let res;
      try {
        res = await sendStreakAlert({ league, subject: email.subject, text: email.text });
      } catch (e) {
        console.warn("[refresh] alert (ats) threw:", (e as Error).message);
        break;
      }
      if (!res.ok && !res.skipped) {
        console.warn("[refresh] alert (ats) undelivered:", res.error);
        break;
      }
      ls.ats = { ...ls.ats, lastNotifiedCount: email.newLastNotifiedCount };
    }
    for (const email of buildTotalEmails(league, ls.total, gameById, nextGame)) {
      let res;
      try {
        res = await sendStreakAlert({ league, subject: email.subject, text: email.text });
      } catch (e) {
        console.warn("[refresh] alert (total) threw:", (e as Error).message);
        break;
      }
      if (!res.ok && !res.skipped) {
        console.warn("[refresh] alert (total) undelivered:", res.error);
        break;
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

/**
 * Alert thresholds. Tick counts assume the 2-minute refresh cron in
 * vercel.json; all four are env-tunable so they can be loosened without a code
 * change.
 */
const FAIL_TICKS_TO_ALERT = Number(process.env.FETCH_ALERT_FAIL_TICKS) || 3; // ~6 min down
const OK_TICKS_TO_CLEAR = Number(process.env.FETCH_ALERT_OK_TICKS) || 3; // ~6 min clean
const ALERT_REALERT_MS = Number(process.env.FETCH_ALERT_REALERT_MS) || 6 * 3600_000;
const REFAIL_COOLDOWN_MS = Number(process.env.FETCH_ALERT_REFAIL_COOLDOWN_MS) || 3600_000;

function msSince(iso: string | null | undefined, now: number): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? now - t : Infinity;
}

/** notifyAdmin resolves {ok:false} on a Resend error rather than throwing; the
 *  Resend client itself can still throw on a malformed key. Normalize both. */
async function sendAdmin(opts: { subject: string; text: string }): Promise<NotifyResult> {
  try {
    return await notifyAdmin(opts);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Tolerate the pre-2026-08-12 shape ({leagues, alertedAt}) still sitting in the
 *  production blob: read it as an incident that has already paged, so the first
 *  clean stretch after deploy closes it out with one RECOVERED. */
function normalizeFetchAlert(
  raw: Partial<FetchAlertState> | null | undefined,
): FetchAlertState | null {
  if (!raw) return null;
  const leagues = raw.leagues ?? [];
  return {
    leagues,
    failingSince: raw.failingSince ?? raw.alertedAt ?? new Date().toISOString(),
    failStreak: raw.failStreak ?? FAIL_TICKS_TO_ALERT,
    okStreak: raw.okStreak ?? 0,
    alertedAt: raw.alertedAt ?? null,
    alertedLeagues: raw.alertedLeagues ?? leagues,
    clearedAt: raw.clearedAt ?? null,
  };
}

/**
 * SportsGameOdds per-league fetches are isolated (Promise.allSettled), so a
 * provider outage returns ok:true with zero games and never throws — grading
 * silently freezes with no signal. Page an admin, but only for a failure that
 * has survived FAIL_TICKS_TO_ALERT consecutive ticks: a single flaky tick is
 * noise, not an outage, and paging on it is what buried the admins in
 * FAILING/RECOVERED pairs. State is persisted (DataStore.fetchAlert) and only
 * advanced on a CONFIRMED send, so an undeliverable alert retries next tick
 * instead of being silently swallowed.
 */
async function alertOnFetchErrors(errors: LeagueFetchError[]) {
  const store = await readStore();
  const prev = normalizeFetchAlert(store.fetchAlert);
  const failing = Array.from(new Set(errors.map((e) => e.league))).sort();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  if (failing.length === 0) return clearFetchAlert(prev, now, nowIso);

  const sig = failing.join(",");
  const sameSet = prev !== null && prev.leagues.join(",") === sig;
  const next: FetchAlertState = {
    leagues: failing,
    failingSince: sameSet ? prev!.failingSince : nowIso,
    failStreak: sameSet ? prev!.failStreak + 1 : 1,
    okStreak: 0,
    alertedAt: prev?.alertedAt ?? null,
    alertedLeagues: prev?.alertedLeagues ?? [],
    clearedAt: prev?.clearedAt ?? null,
  };

  // A league that drops out again within the hour of recovering is flapping,
  // not a fresh outage. Keep counting (so a genuine one still pages once the
  // window passes) but stay quiet. Worst case this delays a real page by
  // REFAIL_COOLDOWN_MS; the alternative is the every-hiccup spam.
  const cooling = msSince(next.clearedAt, now) < REFAIL_COOLDOWN_MS;
  const alreadyPaged = next.alertedAt !== null && next.alertedLeagues.join(",") === sig;
  const stale = msSince(next.alertedAt, now) >= ALERT_REALERT_MS;
  const shouldSend =
    next.failStreak >= FAIL_TICKS_TO_ALERT && !cooling && (!alreadyPaged || stale);

  if (!shouldSend) {
    await setFetchAlert(next);
    return;
  }

  const downMin = Math.max(1, Math.round(msSince(next.failingSince, now) / 60_000));
  const lines = errors.map((e) => `• ${e.league}: ${e.message}`).join("\n");
  const res = await sendAdmin({
    subject: `[Fade The Money] SportsGameOdds fetch FAILING (${sig})`,
    text:
      `Grading is starved of data. ${failing.length} league fetch(es) have now failed ` +
      `${next.failStreak} refreshes in a row (about ${downMin} min).\n\n${lines}\n\n` +
      `Streak emails cannot fire while this persists. Check SportsGameOdds status / API quota.`,
  });
  if (!res.ok) {
    if (!res.skipped) console.warn("[refresh] notifyAdmin (fetch-fail) undelivered:", res.error);
    await setFetchAlert(next); // hold the incident open; retry on the next tick
    return;
  }
  await setFetchAlert({ ...next, alertedAt: nowIso, alertedLeagues: failing, clearedAt: null });
}

/** Healthy tick. Only worth an email if we actually paged about this incident
 *  and the feed has stayed up for OK_TICKS_TO_CLEAR ticks. A failure that
 *  cleared before it ever paged is forgotten in silence. */
async function clearFetchAlert(prev: FetchAlertState | null, now: number, nowIso: string) {
  if (!prev) return; // healthy with nothing tracked: no send, no write

  // Post-recovery cooldown record. Nothing left to count, just let it expire.
  if (prev.failStreak === 0) {
    if (msSince(prev.clearedAt, now) >= REFAIL_COOLDOWN_MS) await setFetchAlert(null);
    return;
  }

  const okStreak = prev.okStreak + 1;

  if (!prev.alertedAt) {
    // Never paged: this is the flap that used to cost a FAILING + RECOVERED pair.
    await setFetchAlert(okStreak >= OK_TICKS_TO_CLEAR ? null : { ...prev, okStreak });
    return;
  }
  if (okStreak < OK_TICKS_TO_CLEAR) {
    await setFetchAlert({ ...prev, okStreak }); // not convinced yet, keep watching
    return;
  }

  const downMin = Math.max(1, Math.round(msSince(prev.failingSince, now) / 60_000));
  const res = await sendAdmin({
    subject: "[Fade The Money] SportsGameOdds fetch RECOVERED",
    text:
      `League fetches are succeeding again (was failing: ${prev.leagues.join(", ") || "?"}).\n\n` +
      `Down for about ${downMin} min; clean for the last ${okStreak} refreshes.`,
  });
  if (!res.ok) {
    if (!res.skipped) console.warn("[refresh] notifyAdmin (fetch-recover) undelivered:", res.error);
    await setFetchAlert({ ...prev, okStreak }); // retry on the next tick
    return;
  }
  await setFetchAlert({
    leagues: [],
    failingSince: prev.failingSince,
    failStreak: 0,
    okStreak,
    alertedAt: null,
    alertedLeagues: [],
    clearedAt: nowIso,
  });
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
  // Routine cron uses a 96h back-window (not fetchLeagueGames' bare default) so
  // already-FINAL games stay re-fetchable long enough for official post-final
  // scoring corrections to land and self-heal the streak. An explicit ?days=
  // override still wins.
  const opts = Number.isFinite(days) && days > 0
    ? { hoursBack: days * 24, hoursForward: 48 }
    : { hoursBack: 96, hoursForward: 48 };
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
