import type { MetadataRoute } from "next";
import { getPublishedArticles } from "@/lib/articles";
import { siteOrigin } from "@/lib/site-url";

/**
 * Sitemap served at /sitemap.xml — the URL submitted to Google Search Console.
 *
 * Generated per request, not frozen at build time: blog articles are published
 * from the admin CMS whenever the client likes, and a build-time sitemap would
 * not list a new article until the next deploy.
 *
 * Members-only and account pages are deliberately absent — Google can't see
 * behind the paywall, and indexing /login or /account wastes crawl budget on
 * pages that redirect. /results-30 is the internal backfill comparison page and
 * must never be indexed.
 */
export const dynamic = "force-dynamic";

const SITE = siteOrigin();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE}`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/results`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/register`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/disclaimer`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Never throws and returns [] if Supabase is unreachable, so a DB blip
  // degrades the sitemap to its static pages rather than 500-ing at Googlebot.
  const articles = await getPublishedArticles();

  return [
    ...pages,
    ...articles.map((a) => ({
      url: `${SITE}/blog/${a.slug}`,
      lastModified: a.publishedAt ? new Date(a.publishedAt) : now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
