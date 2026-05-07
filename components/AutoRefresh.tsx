"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the current server page on an interval so visitors see fresh
 * scores and splits without reloading. The page is `force-dynamic`, so each
 * router.refresh() reads the latest store.
 *
 * Data ingestion (calling /api/refresh) is handled separately:
 *   - prod: Vercel cron in vercel.json hits /api/refresh on a schedule
 *   - dev:  run `npm run update-data` (or hit /api/refresh manually)
 */
export function AutoRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
