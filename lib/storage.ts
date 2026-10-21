import { promises as fs } from "fs";
import path from "path";
import { put, list } from "@vercel/blob";
import type {
  DataStore,
  Game,
  DailyRecord,
  StreakState,
  League,
  LeagueStreaks,
  FetchAlertState,
} from "./types";

/**
 * Storage layer.
 *
 * Two backends, picked at runtime by env:
 *   - BLOB_READ_WRITE_TOKEN set  → Vercel Blob   (production / deployed)
 *   - otherwise                  → local file    (dev)
 *
 * Reads are cached in-process for CACHE_TTL_MS so the dashboard doesn't hit
 * Blob on every page render. Writes invalidate the cache.
 *
 * Caveats:
 *   - In-memory cache is per-instance. With multiple Vercel Functions running
 *     in parallel, each gets its own copy — fine for our cron-driven model.
 *   - Concurrent writers can clobber each other (read-modify-write race). The
 *     lease in acquireLease keeps one tick off another's toes, but it is
 *     advisory and fail-open, so a truly simultaneous pair can still race.
 *   - A SINGLE tick could also clobber itself, which is not theoretical and was
 *     the duplicate-alert bug: see OWN_WRITE_TRUST_MS. Any read-modify-write on
 *     this store must go through readStoreFresh, never a bare readStore.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const BLOB_KEY = "store.json";
const CACHE_TTL_MS = 5_000;
/**
 * How long this instance keeps trusting a store IT wrote, for the
 * read-modify-write helpers only.
 *
 * CACHE_TTL_MS (5s) is far too short to hold a refresh tick together. A tick
 * does real network work between its store writes — seven league fetches, a
 * Supabase recipient lookup, a Resend send per alert — so the gap between two
 * writes routinely exceeds 5s. Once it did, readStoreFresh() fell through to a
 * fresh Blob read; Vercel Blob is eventually consistent, so that read could
 * hand back the PRE-write snapshot, and writing it back silently rolled the
 * tick's earlier writes off the blob. When the rolled-back field was a
 * just-advanced lastNotifiedCount, the next tick rebuilt the same milestone and
 * mailed it again: 38 of 249 alert batches between 2026-09-22 and 2026-10-21
 * went out twice (15%), most of them exactly one 2-minute cron tick apart. It
 * survived the per-send persist fix (56b103c, 2026-09-10) because the send was
 * always persisted — the persisted value was then overwritten.
 *
 * Bounded BELOW the 2-minute cron period so an instance reused by the next tick
 * always re-reads the blob and still sees another instance's writes.
 */
const OWN_WRITE_TRUST_MS = 90_000;

const EMPTY: DataStore = {
  games: [],
  history: [],
  streak: { current: null, count: 0, lastNotifiedCount: 0, history: [] },
  streaks: {},
  lock: null,
  fetchAlert: null,
  lastUpdated: new Date(0).toISOString(),
};

function useBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

// --- in-process read cache ---
// `written` marks a value this instance last WROTE, as opposed to one it read.
// Our own write is the freshest truth we have — fresher than a Blob re-read,
// which may still be serving the previous version.
let cache: { value: DataStore; at: number; written: boolean } | null = null;
function readCache(maxAgeMs: number = CACHE_TTL_MS): DataStore | null {
  if (!cache) return null;
  if (Date.now() - cache.at > maxAgeMs) return null;
  return cache.value;
}
function setCache(v: DataStore, written = false) {
  cache = { value: v, at: Date.now(), written };
}
function bustCache() {
  cache = null;
}

// --- local file backend ---
async function readFromFile(): Promise<DataStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return JSON.parse(raw) as DataStore;
  } catch {
    return EMPTY;
  }
}
async function writeToFile(store: DataStore): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

// --- Vercel Blob backend ---
async function readFromBlob(): Promise<DataStore> {
  // Find the current store blob. We use addRandomSuffix:false on writes so the
  // pathname is stable, but list() avoids hard-coding a URL.
  const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
  const target = blobs.find((b) => b.pathname === BLOB_KEY);
  if (!target) return EMPTY;
  const res = await fetch(target.url, { cache: "no-store" });
  if (!res.ok) return EMPTY;
  return (await res.json()) as DataStore;
}
async function writeToBlob(store: DataStore): Promise<void> {
  await put(BLOB_KEY, JSON.stringify(store), {
    access: "public",          // Blob requires public for now; data isn't sensitive
    addRandomSuffix: false,    // overwrite same key each time
    contentType: "application/json",
    allowOverwrite: true,
  });
}

// --- public API (signature-compatible with the previous file-only impl) ---

export async function readStore(): Promise<DataStore> {
  const cached = readCache();
  if (cached) return cached;
  const v = useBlob() ? await readFromBlob() : await readFromFile();
  setCache(v);
  return v;
}

export async function writeStore(store: DataStore): Promise<void> {
  store.lastUpdated = new Date().toISOString();
  if (useBlob()) await writeToBlob(store);
  else await writeToFile(store);
  setCache(store, true); // our own write is the freshest truth this instance has
}

/**
 * How long a final's box score must hold still before we grade it. Two 2-minute
 * cron ticks clear this comfortably, so an alert lands ~4 minutes after the last
 * out. Env-tunable if the feed ever needs a longer settle window.
 */
const FINAL_SETTLE_MS = Number(process.env.FINAL_SETTLE_MS) || 90_000;

export async function upsertGames(
  incoming: Game[],
  opts: { prunableLeagues?: readonly League[] } = {},
): Promise<DataStore> {
  const store = await readStoreFresh();
  const incomingIds = new Set(incoming.map((g) => g.id));
  const map = new Map<string, Game>();

  // Keep all finals (back the /results page) plus any recently-started game
  // even if the latest pull dropped it — completed games often disappear from
  // odds feeds before they're tagged "final", and we'd lose them otherwise.
  const RECENT_MS = 72 * 3600_000;
  const now = Date.now();
  // Leagues whose fetch succeeded this tick, so an absence from `incoming` is
  // real information rather than a failed request. Empty = prune nothing.
  const prunable = new Set(opts.prunableLeagues ?? []);
  for (const g of store.games) {
    // "Recent" has to mean STARTED within the last 72h. It used to be a bare
    // `now - startTime < RECENT_MS`, which is also true of every FUTURE game
    // (a negative age), so a scheduled game could never leave the store once
    // stored — and `toGame` returns null for a cancelled event, so a game the
    // feed cancels simply vanishes from `incoming` and the stale copy lived on
    // forever. That is how a cancelled MLB "if necessary" playoff game stayed
    // in the store for days and surfaced in a streak email's Next-up line on
    // 2026-10-08 (Padres @ Brewers, two days after Milwaukee clinched).
    const ageMs = now - new Date(g.startTime).getTime();
    const recent = ageMs >= 0 && ageMs < RECENT_MS;
    if (g.status === "final" || incomingIds.has(g.id) || recent) {
      map.set(g.id, g);
      continue;
    }
    // Absent from this tick's payload and not recently started. Drop it only if
    // we know this league actually answered — otherwise one failed request
    // would wipe the league's entire upcoming slate.
    if (!prunable.has(g.league)) map.set(g.id, g);
  }
  for (const g of incoming) {
    const existing = map.get(g.id);
    // Lock the betting trend at kickoff. The line (spread + total) moves
    // significantly once a game is in progress, so once start time has
    // passed we keep whatever trend we last captured pre-game and refuse
    // any further updates. Status alone isn't reliable — feeds can flip
    // scheduled→live late, by which point the incoming line is already
    // live-adjusted.
    //
    // If a game first appears in our store after kickoff (no prior trend
    // snapshot exists), we deliberately leave trend `undefined` rather
    // than accept the live line. A game with no captured pregame line
    // can't be scored fairly against public/Vegas, so it's excluded from
    // streaks and from the verdict pill on the dashboard.
    const startMs = new Date(g.startTime).getTime();
    const started = Number.isFinite(startMs) && startMs <= now;
    // Before kickoff, keep taking the newest line, falling back to the last one
    // we held if this tick's payload carries no odds. Commit 46b9772 set out to
    // fix only the post-kickoff first-sighting case but rewrote this expression
    // as `existing?.trend ?? g.trend`, which also froze the line at FIRST
    // SIGHTING instead of at kickoff — so a game seen early was graded on a
    // stale number that never caught up to the line it actually closed at. That
    // stayed mild while we only looked 48h ahead; at 192h it would grade NFL
    // games on a line posted eight days before kickoff.
    const lockedTrend = started ? existing?.trend : (g.trend ?? existing?.trend);
    // Confirm a final once its box score has SETTLED, so streaks (and the
    // member alerts they fire) grade within minutes of the last out.
    //
    // This used to wait on the feed's `finalized` flag, but that flag lands
    // 1-4 hours after a game ends and is staggered game by game — a 9:20pm
    // final alerted at 11:00pm. What we can trust immediately is
    // `periodsComplete` (every period ended, game no longer live) plus the
    // score holding still: the failure this guards against — the feed flagging
    // a game complete while the box score shows a mid-game number (the
    // NYY@BOS 4-2 / real 3-6 bug) — is exactly a game that is still live with
    // a moving score, and it fails both tests.
    //
    // So a final is confirmed when it has been reported final with an
    // UNCHANGED score across at least two refreshes AND for at least
    // FINAL_SETTLE_MS, or (fast path) the feed has already finalized it.
    // Confirmation is sticky: once graded, a later flag flip can't drop the
    // game back out of a running streak. A genuinely corrected score is still
    // re-graded every tick — see updateCategoryStreak in lib/streak.ts.
    const isFinal = g.status === "final";
    const scoreKey = `${g.away.score ?? "?"}-${g.home.score ?? "?"}`;
    const heldScore = Boolean(existing?.finalSince && existing?.finalScoreKey === scoreKey);
    const finalSince = isFinal
      ? heldScore
        ? existing!.finalSince
        : new Date(now).toISOString()
      : undefined;
    const settledMs = finalSince ? now - new Date(finalSince).getTime() : 0;
    const settled =
      isFinal &&
      g.periodsComplete === true &&
      existing?.status === "final" &&
      heldScore &&
      settledMs >= FINAL_SETTLE_MS;
    const confirmedFinal =
      existing?.confirmedFinal === true ||
      (isFinal && (settled || (g.finalized === true && existing?.status === "final")));
    map.set(g.id, {
      ...existing,
      ...g,
      trend: lockedTrend,
      confirmedFinal,
      finalSince,
      finalScoreKey: isFinal ? scoreKey : undefined,
    });
  }
  store.games = Array.from(map.values()).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  await writeStore(store);
  return store;
}

export async function recordDaily(date: string, rec: Partial<DailyRecord>): Promise<void> {
  const store = await readStoreFresh();
  const idx = store.history.findIndex((h) => h.date === date);
  const base: DailyRecord = idx >= 0
    ? store.history[idx]
    : { date, publicWins: 0, vegasWins: 0, pushes: 0, games: [] };
  const merged: DailyRecord = {
    ...base,
    ...rec,
    games: Array.from(new Set([...base.games, ...(rec.games ?? [])])),
  };
  if (idx >= 0) store.history[idx] = merged;
  else store.history.push(merged);
  store.history.sort((a, b) => (a.date < b.date ? 1 : -1));
  store.history = store.history.slice(0, 30);
  await writeStore(store);
}

export async function setStreak(streak: StreakState): Promise<void> {
  const store = await readStoreFresh();
  store.streak = streak;
  await writeStore(store);
}

export async function setLeagueStreaks(
  streaks: Partial<Record<League, LeagueStreaks>>,
): Promise<void> {
  const store = await readStoreFresh();
  store.streaks = streaks;
  await writeStore(store);
}

export async function setFetchAlert(state: FetchAlertState | null): Promise<void> {
  const store = await readStoreFresh();
  store.fetchAlert = state;
  await writeStore(store);
}

/**
 * Best-effort advisory lease over the single store blob so two overlapping cron
 * invocations (Vercel cron is best-effort and can double-fire) don't run the
 * refresh pipeline concurrently and clobber each other's writes or double-send a
 * milestone email.
 *
 * Deliberately simple and FAIL-OPEN: this is a read → check → write, not a true
 * compare-and-swap (Vercel Blob is last-writer-wins and eventually consistent).
 * It catches the common staggered overlap (run B starts after run A's lock has
 * propagated); a truly simultaneous race may still let both through — that residual
 * is backstopped by advancing lastNotifiedCount only on a confirmed send. If
 * acquisition itself errors we return true (proceed) rather than freeze refreshes
 * over a lock-infra hiccup. The lease self-expires so a crashed run can't block
 * the cron forever.
 */
const LEASE_MS = 90_000; // > a normal run, < the 2-min cron period; stale lease self-expires

export async function acquireLease(holder: string): Promise<boolean> {
  try {
    bustCache(); // lock decisions must ignore the per-instance read cache
    const store = useBlob() ? await readFromBlob() : await readFromFile();
    const now = Date.now();
    const held = store.lock && new Date(store.lock.expiresAt).getTime() > now;
    if (held && store.lock!.holder !== holder) return false; // someone else holds a live lease
    store.lock = { holder, expiresAt: new Date(now + LEASE_MS).toISOString() };
    await writeStore(store);
    return true;
  } catch (e) {
    console.warn("[storage] acquireLease failed, proceeding without lock:", (e as Error).message);
    return true; // fail-open — a lease error must not freeze refreshes
  }
}

export async function releaseLease(holder: string): Promise<void> {
  try {
    // Read our OWN last write, not a fresh Blob read. By the time we release,
    // doRefresh's writes this tick have left the cache holding the correct final
    // state; Vercel Blob has read-after-write latency, so re-reading here would
    // resurrect a pre-write snapshot and clobber this tick's games/streaks (the
    // exact hazard documented on readStoreFresh). We only clear our lock field.
    //
    // This must be readStoreFresh, not readStore: this is the LAST write of the
    // tick and it lands well after the 5s CACHE_TTL_MS, so readStore would have
    // gone to the blob anyway and written back a stale store — re-opening an
    // already-sent milestone for the next tick to mail a second time.
    const store = await readStoreFresh();
    if (store.lock?.holder === holder) {
      store.lock = null;
      await writeStore(store);
    }
  } catch (e) {
    console.warn("[storage] releaseLease failed:", (e as Error).message);
  }
}

/**
 * Read-modify-write helper. Prefers a store THIS instance wrote — for up to
 * OWN_WRITE_TRUST_MS, deliberately NOT the 5s dashboard TTL — over a fresh Blob
 * read, so a tick always modifies the state it last wrote rather than a
 * pre-write snapshot the Blob is still serving. Falls back to readStore() when
 * this instance has not written, which is every dashboard render.
 */
async function readStoreFresh(): Promise<DataStore> {
  if (cache?.written) {
    const own = readCache(OWN_WRITE_TRUST_MS);
    if (own) return own;
  }
  return readStore();
}

/** Test/admin helper. */
export function _resetStorageCache() {
  bustCache();
}
