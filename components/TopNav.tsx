"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGrid, IconTarget, IconNews, IconTrophy, IconInfo } from "@/components/icons";

// Mobile-only nav row shown directly under the logo (replaces a hamburger).
// Horizontally scrollable so every item stays reachable on narrow phones.
const ITEMS = [
  { href: "/", label: "Dashboard", Icon: IconGrid, match: (p: string) => p === "/" },
  { href: "/results", label: "Results", Icon: IconTarget, match: (p: string) => p.startsWith("/results") },
  { href: "/blog", label: "News", Icon: IconNews, match: (p: string) => p.startsWith("/blog") },
  { href: "/#games", label: "Leagues", Icon: IconTrophy, match: () => false },
  { href: "/about", label: "About", Icon: IconInfo, match: (p: string) => p.startsWith("/about") },
];

export function TopNav() {
  const pathname = usePathname() || "/";

  return (
    <div className="topnav-mobile">
      <div className="container topnav-scroll">
        {ITEMS.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={label}
              href={href}
              className={`topnav-link${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon />
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
