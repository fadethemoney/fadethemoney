import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { landingPathForRole } from "@/lib/landing";
import { UserMenu } from "@/components/UserMenu";

export async function SiteHeader() {
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  return (
    <header className="site">
      <div className="container">
        <nav className="nav-inner">
          <Link href="/" className="logo">
            <span className="logo-mark" aria-hidden />
            <span className="logo-name">Fade The Money</span>
          </Link>
          <div className="nav-links">
            <Link href="/">Dashboard</Link>
            <Link href="/results">Results</Link>
            <Link href="/about">About</Link>
            {profile ? (
              <UserMenu
                name={profile.name || profile.email}
                email={profile.email}
                dashboardHref={landingPathForRole(profile.role)}
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
    </header>
  );
}
