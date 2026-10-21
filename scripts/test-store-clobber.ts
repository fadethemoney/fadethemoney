/**
 * Regression test for the duplicate streak alert.
 *
 *   npx tsx scripts/test-store-clobber.ts
 *
 * The store is a single JSON blob mutated by read-modify-write. Vercel Blob is
 * eventually consistent, so a re-read inside a refresh tick can hand back the
 * snapshot from BEFORE that tick's own earlier write; writing it back rolls the
 * earlier write off the store. When the rolled-back field is a lastNotifiedCount
 * the tick advanced after mailing a milestone, the next tick rebuilds that
 * milestone and mails it again — 38 of 249 alert batches between 2026-09-22 and
 * 2026-10-21 went out twice this way, most exactly one 2-minute cron tick apart.
 *
 * The guard is OWN_WRITE_TRUST_MS in lib/storage.ts: a read-modify-write prefers
 * the value THIS instance last wrote over a re-read, for longer than the 5s
 * dashboard cache but less than the cron period. These two scenarios fail
 * against a storage.ts that routes read-modify-writes through a bare readStore.
 *
 * Uses the file backend as a stand-in for Blob; staleness is simulated by
 * overwriting the file behind the cache's back.
 */
import fs from "fs/promises";
import path from "path";
import {
  writeStore,
  setLeagueStreaks,
  releaseLease,
  _resetStorageCache,
} from "@/lib/storage";
import type { DataStore } from "@/lib/types";

const STORE = path.join(process.cwd(), "data", "store.json");
const realNow = Date.now;
const HOLDER = "tick-A";

const nhl = (notified: number) => ({
  ats: { current: "public", count: 4, lastNotifiedCount: notified, history: [] },
  total: { current: null, count: 0, lastNotifiedCount: 0, history: [] },
  moneyline: { current: null, count: 0, lastNotifiedCount: 0, history: [] },
});

function store(notified: number, opts: { games?: number; locked?: boolean } = {}): DataStore {
  return {
    games: Array.from({ length: opts.games ?? 0 }, (_, i) => ({ id: `g${i}`, league: "nhl" })),
    history: [],
    streak: { current: null, count: 0, lastNotifiedCount: 0, history: [] },
    streaks: { nhl: nhl(notified) },
    lock: opts.locked
      ? { holder: HOLDER, expiresAt: new Date(realNow() + 90_000).toISOString() }
      : null,
    fetchAlert: null,
    lastUpdated: new Date(0).toISOString(),
  } as never as DataStore;
}

const notifiedOf = (s: DataStore) =>
  (s.streaks as never as Record<string, { ats: { lastNotifiedCount: number } }>).nhl.ats
    .lastNotifiedCount;

async function onDisk(): Promise<DataStore> {
  return JSON.parse(await fs.readFile(STORE, "utf8")) as DataStore;
}

/** A mid-tick read-modify-write must not resurrect the pre-write snapshot. */
async function midTickWrite(skewMs: number) {
  _resetStorageCache();
  Date.now = realNow;
  await writeStore(store(4, { games: 1 }));
  await fs.writeFile(STORE, JSON.stringify(store(2), null, 2), "utf8");
  Date.now = () => realNow() + skewMs;
  await setLeagueStreaks({ nhl: nhl(4) } as never);
  Date.now = realNow;
  return (await onDisk()).games.length;
}

/** releaseLease is the tick's LAST write — the one that re-opened the milestone. */
async function lastWriteOfTick(skewMs: number) {
  _resetStorageCache();
  Date.now = realNow;
  await writeStore(store(4, { locked: true }));
  await fs.writeFile(STORE, JSON.stringify(store(2, { locked: true }), null, 2), "utf8");
  Date.now = () => realNow() + skewMs;
  await releaseLease(HOLDER);
  Date.now = realNow;
  return notifiedOf(await onDisk());
}

(async () => {
  const backup = await fs.readFile(STORE, "utf8").catch(() => null);
  const results: [string, boolean, string][] = [];
  try {
    // 10s: past the 5s dashboard cache, well inside a single tick.
    const games = await midTickWrite(10_000);
    results.push([
      "mid-tick write keeps the tick's own games",
      games === 1,
      `${games} game(s) on disk, expected 1`,
    ]);

    const notified = await lastWriteOfTick(10_000);
    results.push([
      "releaseLease keeps the mailed milestone",
      notified === 4,
      `lastNotifiedCount ${notified}, expected 4 (a rollback re-sends the alert)`,
    ]);

    // A full cron period later this instance must go back to the store, or one
    // warm instance would serve a frozen copy and never see another's writes.
    const stale = await midTickWrite(120_000);
    results.push([
      "beyond the trust window we re-read the store",
      stale === 0,
      `${stale} game(s) on disk, expected 0`,
    ]);
  } finally {
    if (backup !== null) await fs.writeFile(STORE, backup, "utf8");
    else await fs.rm(STORE, { force: true });
  }

  for (const [name, ok, detail] of results) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        ${detail}`}`);
  }
  const failed = results.filter(([, ok]) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
})();
