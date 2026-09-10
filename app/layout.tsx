import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { BillingAlert } from "@/components/BillingAlert";
import { BottomNav } from "@/components/BottomNav";
import { getActiveNotifications } from "@/lib/notifications";
import { getSessionUser } from "@/lib/auth";
import { getMemberAccess } from "@/lib/subscription";

// Render per request so the announcement bar always reflects the latest active
// tips (no stale build-time snapshot).
export const dynamic = "force-dynamic";

/** Google Analytics 4 measurement id. */
const GA_ID = "G-4KY36FX9B2";

export const metadata: Metadata = {
  title: "Fade The Money — When the Public is Wrong, We Track It",
  description:
    "Live sports betting dashboard tracking whether the public or Vegas is winning. Public streaks and live scores.",
  // Renders <meta name="google-site-verification" ...> — Next's own field for it,
  // so it can't be dropped by a future <head> edit.
  verification: { google: "ewr78ml2vxa9MH2gMk23hsIt_gYm_eSCSY7C7fIDRaA" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The announcement bar carries the picks the admin sends out, so it is
  // member-only content: fetched only once the paywall says this visitor is
  // entitled. With the paywall switched off getMemberAccess() lets everyone
  // through, which keeps today's behaviour for signed-in users.
  const [user, access] = await Promise.all([getSessionUser(), getMemberAccess()]);
  const tips = user && access.isMember ? await getActiveNotifications() : [];

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* Google Analytics 4. next/script rather than a raw <script> so Next
            loads it after hydration instead of blocking first paint. */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
        </Script>
      </head>
      <body>
        {user && <BillingAlert status={access.status} />}
        <AnnouncementBar tips={tips} />
        <SiteHeader />
        {children}
        <SiteFooter />
        <BottomNav loggedIn={!!user} />
      </body>
    </html>
  );
}
