import "server-only";
import { NextResponse } from "next/server";

/**
 * Shared auth for scheduled routes.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that env var
 * exists, which is the only signal here that a caller can't forge — the
 * x-vercel-cron header is accepted for the long-standing refresh route, but
 * jobs that write billing state must not rely on it.
 *
 * Returns a 401 response to return as-is, or null when the caller is allowed.
 */
export function requireCronAuth(req: Request): NextResponse | null {
  const secrets = [process.env.CRON_SECRET, process.env.REFRESH_TOKEN].filter(Boolean) as string[];
  if (secrets.length === 0) {
    console.error("[cron] refusing to run: neither CRON_SECRET nor REFRESH_TOKEN is set");
    return NextResponse.json({ ok: false, error: "cron secret not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (secrets.some((s) => auth === `Bearer ${s}`)) return null;
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
