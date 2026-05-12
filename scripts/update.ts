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
import { readStore, upsertGames, recordDaily, setStreak } from "../lib/storage";
import { summarizeDay, todayKey } from "../lib/calc";
import { etDateKeyOf } from "../lib/time";
import { notifyAdmin } from "../lib/mailer";
import type { League, StreakState } from "../lib/types";

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
    await notifyAdmin({
      subject: `Fade The Money — ${streak.current} on a ${streak.count}-game streak`,
      text: `${streak.current?.toUpperCase()} has won ${streak.count} bets in a row.`,
    });
    streak.lastNotifiedCount = streak.count;
  }
  await setStreak(streak);

  console.log("[update] done", {
    games: all.length,
    streak: `${streak.current ?? "—"} x${streak.count}`,
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
