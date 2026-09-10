/**
 * Canonical public origin for absolute URLs we publish (sitemap, robots.txt).
 *
 * NEXT_PUBLIC_SITE_URL is `http://localhost:3000` in .env.local, and a sitemap
 * full of localhost URLs is worse than no sitemap at all — so a local, empty or
 * malformed value falls back to the real domain rather than being trusted.
 */
export function siteOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  if (!raw || /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/i.test(raw)) {
    return "https://fadethemoney.com";
  }
  return raw;
}
