import { promises as fs } from "fs";
import path from "path";
import { put, list } from "@vercel/blob";
import type { DataStore, Game, DailyRecord, StreakState } from "./types";

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
 *   - Concurrent writers can clobber each other (read-modify-write race). Our
 *     pipeline is a single cron tick, so this is theoretical.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const BLOB_KEY = "store.json";
const CACHE_TTL_MS = 5_000;

const EMPTY: DataStore = {
  games: [],
  history: [],
  streak: { current: null, count: 0, lastNotifiedCount: 0, history: [] },
  lastUpdated: new Date(0).toISOString(),
};

function useBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

// --- in-process read cache ---
let cache: { value: DataStore; at: number } | null = null;
function readCache(): DataStore | null {
  if (!cache) return null;
  if (Date.now() - cache.at > CACHE_TTL_MS) return null;
  return cache.value;
}
function setCache(v: DataStore) {
  cache = { value: v, at: Date.now() };
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
  setCache(store); // keep cache warm with what we just wrote
}

export async function upsertGames(incoming: Game[]): Promise<DataStore> {
  const store = await readStoreFresh();
  const incomingIds = new Set(incoming.map((g) => g.id));
  const map = new Map<string, Game>();

  // Keep all finals (back the /results page) plus any recently-started game
  // even if the latest pull dropped it — completed games often disappear from
  // odds feeds before they're tagged "final", and we'd lose them otherwise.
  const RECENT_MS = 72 * 3600_000;
  const now = Date.now();
  for (const g of store.games) {
    const recent = now - new Date(g.startTime).getTime() < RECENT_MS;
    if (g.status === "final" || incomingIds.has(g.id) || recent) {
      map.set(g.id, g);
    }
  }
  for (const g of incoming) {
    const existing = map.get(g.id);
    map.set(g.id, { ...existing, ...g });
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

/**
 * Read-modify-write helper. Trusts the in-process cache so we read the state
 * we just wrote earlier in the same request — Vercel Blob has read-after-write
 * latency, and bypassing the cache here caused subsequent writes to clobber
 * fresh data with the pre-write blob snapshot.
 */
async function readStoreFresh(): Promise<DataStore> {
  return readStore();
}

/** Test/admin helper. */
export function _resetStorageCache() {
  bustCache();
}
