"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconLive, IconTrophy, IconTicket, IconUser } from "@/components/icons";

/** App-like bottom tab bar (mobile only). "My Bets" / "Profile" route to the
 *  account area when signed in, otherwise to login. */
export function BottomNav({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname() || "/";
  const account = loggedIn ? "/account" : "/login";

  const tabs = [
    { href: "/", label: "Home", Icon: IconHome, active: pathname === "/" },
    { href: "/#games", label: "Live", Icon: IconLive, active: false },
    { href: "/results", label: "Leagues", Icon: IconTrophy, active: pathname.startsWith("/results") },
    { href: account, label: "My Bets", Icon: IconTicket, active: false },
    { href: account, label: "Profile", Icon: IconUser, active: pathname.startsWith("/account") },
  ];

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {tabs.map(({ href, label, Icon, active }) => (
        <Link
          key={label}
          href={href}
          className={`bottom-tab${active ? " active" : ""}`}
          aria-current={active ? "page" : undefined}
        >
          <Icon />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
