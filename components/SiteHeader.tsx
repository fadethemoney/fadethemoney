import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { landingPathForRole } from "@/lib/landing";
import { UserMenu } from "@/components/UserMenu";
import { TopNav } from "@/components/TopNav";

export async function SiteHeader() {
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const dashboardHref = landingPathForRole(profile?.role);

  return (
    <header className="site">
      <div className="container">
        <nav className="nav-inner">
          <Link href="/" className="logo" aria-label="Fade The Money">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-header-new.jpg" alt="Fade The Money" className="logo-img" />
          </Link>

          {/* Desktop nav links (collapsed into the drawer on mobile). */}
          <div className="nav-links">
            <Link href="/">Dashboard</Link>
            <Link href="/results">Results</Link>
            <Link href="/blog">News</Link>
            <Link href="/about">About</Link>
          </div>

          {/* Account avatar / login (right, both layouts). */}
          <div className="nav-account">
            {profile ? (
              <UserMenu
                name={profile.name || profile.email}
                email={profile.email}
                dashboardHref={dashboardHref}
                isAdmin={isAdmin}
              />
            ) : (
              <Link href="/login" className="nav-cta">
                Log in
              </Link>
            )}
          </div>
        </nav>
      </div>

      {/* Mobile-only nav row under the logo (replaces the hamburger drawer). */}
      <TopNav />
    </header>
  );
}
