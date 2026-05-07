"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the page fresh.
 *
 *   - Every `intervalMs` (default 60s): re-renders the server page so
 *     visitors pick up whatever the latest store has.
 *   - Every `refreshDataMs` (default 3min): pings /api/refresh in the
 *     background. The route short-circuits if the store is <60s old, so
 *     this is cheap when the cron is keeping things warm and self-heals
 *     when the cron lags (e.g. between hourly cron ticks on Hobby plan).
 *
 * Data ingestion in production is also driven by the Vercel cron in
 * vercel.json; this client logic is a fallback, not the primary path.
 */
export function AutoRefresh({
  intervalMs = 60_000,
  refreshDataMs = 180_000,
  staleAtMs,
}: {
  intervalMs?: number;
  refreshDataMs?: number;
  /** Server-rendered store.lastUpdated as ms since epoch — triggers an immediate fetch if old. */
  staleAtMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const triggerDataRefresh = async () => {
      try {
        await fetch("/api/refresh", { method: "POST", cache: "no-store" });
        if (!cancelled) router.refresh();
      } catch {
        /* ignore — next tick will retry */
      }
    };

    // If the SSR'd page was rendered from stale data, kick a refresh now.
    if (staleAtMs !== undefined && Date.now() - staleAtMs > refreshDataMs) {
      triggerDataRefresh();
    }

    const renderTick = setInterval(() => router.refresh(), intervalMs);
    const dataTick = setInterval(triggerDataRefresh, refreshDataMs);

    return () => {
      cancelled = true;
      clearInterval(renderTick);
      clearInterval(dataTick);
    };
  }, [router, intervalMs, refreshDataMs, staleAtMs]);

  return null;
}
