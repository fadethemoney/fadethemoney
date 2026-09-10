import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site-url";

/**
 * robots.txt — points crawlers at the sitemap and keeps them out of the areas
 * that either redirect (admin, account), are one-time token links (auth flows),
 * or are internal (/results-30, the backfill comparison page).
 */
const SITE = siteOrigin();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/account",
          "/api/",
          "/auth/",
          "/results-30",
          "/welcome",
          "/verify-email",
          "/reset-password",
          "/forgot-password",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
