import { readFileSync } from "fs";
import { join } from "path";

// Load .env.local (Next.js does this at runtime; tsx scripts don't).
try {
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch {}

import { fetchAllGames } from "../lib/sportsgameodds";
import { finalizeGames } from "../lib/merge";
import { readStore, upsertGames, recordDaily, setStreak, setLeagueStreaks } from "../lib/storage";
import { summarizeDay, todayKey } from "../lib/calc";
import { etDateKeyOf } from "../lib/time";
import { notifyAdmin } from "../lib/mailer";
import {
  applyGameToLeagueStreaks,
  buildAtsEmails,
  buildTotalEmails,
  getLeagueStreaks,
} from "../lib/streak";
import type { League, LeagueStreaks, StreakState } from "../lib/types";

const LEAGUES: League[] = ["nba", "mlb", "nfl", "nhl"];

async function run() {
  const fetched = await fetchAllGames(LEAGUES);
  const all = finalizeGames(fetched);
  console.log(`[update] fetched ${all.length} games across ${LEAGUES.length} leagues`);

  await upsertGames(all);

  const today = todayKey();
  // Group every game by its ET date and record per-day so prior days backfill
  // (the API window covers ~36h back, so yesterday's finals reach us too).
  const byDay = new Map<string, typeof all>();
  for (const g of all) {
    const d = etDateKeyOf(g.startTime);
    const arr = byDay.get(d) ?? [];
    arr.push(g);
    byDay.set(d, arr);
  }
  for (const [date, games] of byDay) {
    const summary = summarizeDay(games);
    await recordDaily(date, { ...summary, games: games.map((g) => g.id) });
  }
  const todays = all.filter((g) => etDateKeyOf(g.startTime) === today);

  const store = await readStore();
  const finals = todays.filter((g) => g.status === "final" && g.finalResult);
  const streak: StreakState = { ...store.streak };
  for (const g of finals) {
    if (streak.history.find((h) => h.date === `${today}:${g.id}`)) continue;
    const c = g.finalResult!.publicCovered;
    if (c === null) continue;
    const winner = c ? "public" : "vegas";
    if (streak.current === winner) streak.count += 1;
    else {
      streak.current = winner;
      streak.count = 1;
      streak.lastNotifiedCount = 0;
    }
    streak.history.unshift({ date: `${today}:${g.id}`, winner });
  }
  streak.history = streak.history.slice(0, 50);

  if (streak.count >= 2 && streak.count > streak.lastNotifiedCount) {
    const after = await readStore();
    const gameById = new Map(after.games.map((g) => [g.id, g]));
    const contributing = streak.history.slice(0, streak.count);
    const lines = contributing.map((h) => {
      const id = h.date.split(":").slice(1).join(":");
      const g = gameById.get(id);
      if (!g) return `• (game ${id})`;
      const favSide = g.trend?.pickedSide;
      const fav = favSide === "home" ? g.home : favSide === "away" ? g.away : null;
      const dog = favSide === "home" ? g.away : favSide === "away" ? g.home : null;
      const covered = h.winner === "public" ? fav : dog;
      const homeSpread = g.trend?.spread;
      let spreadStr = "";
      if (typeof homeSpread === "number" && favSide) {
        const favSpread = favSide === "home" ? homeSpread : -homeSpread; // negative
        const shown = h.winner === "public" ? favSpread : -favSpread;
        spreadStr = ` ${shown > 0 ? "+" : ""}${shown}`;
      }
      const matchup = `${g.away.abbr} @ ${g.home.abbr}`;
      const coveredName = covered?.abbr ?? (h.winner === "public" ? "favorite" : "underdog");
      return `• ${g.league.toUpperCase()} — ${matchup} → ${coveredName} covered${spreadStr}`;
    });
    const side = streak.current?.toUpperCase();
    const header = `${side} has won ${streak.count} bets in a row (spread / ATS).`;
    const text = [header, "", ...lines].join("\n");
    await notifyAdmin({
      subject: `Fade The Money — ${streak.current} on a ${streak.count}-game streak`,
      text,
    });
    streak.lastNotifiedCount = streak.count;
  }
  await setStreak(streak);

  // Per-league × per-category (ATS + Total) streaks with separate emails.
  const perLeague: Partial<Record<League, LeagueStreaks>> = { ...(store.streaks ?? {}) };
  for (const g of finals) {
    const prev = getLeagueStreaks(perLeague, g.league);
    perLeague[g.league] = applyGameToLeagueStreaks(prev, g, today);
  }
  const afterPer = await readStore();
  const gameByIdPer = new Map(afterPer.games.map((g) => [g.id, g]));
  for (const league of LEAGUES) {
    const ls = perLeague[league];
    if (!ls) continue;
    for (const email of buildAtsEmails(league, ls.ats, gameByIdPer)) {
      await notifyAdmin({ subject: email.subject, text: email.text });
      ls.ats = { ...ls.ats, lastNotifiedCount: email.newLastNotifiedCount };
    }
    for (const email of buildTotalEmails(league, ls.total, gameByIdPer)) {
      await notifyAdmin({ subject: email.subject, text: email.text });
      ls.total = { ...ls.total, lastNotifiedCount: email.newLastNotifiedCount };
    }
  }
  await setLeagueStreaks(perLeague);

  console.log("[update] done", {
    games: all.length,
    streak: `${streak.current ?? "—"} x${streak.count}`,
    perLeague: Object.fromEntries(
      LEAGUES.map((l) => {
        const ls = perLeague[l];
        return [
          l,
          ls
            ? `ats ${ls.ats.current ?? "—"} x${ls.ats.count} · tot ${ls.total.current ?? "—"} x${ls.total.count}`
            : "—",
        ];
      }),
    ),
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
