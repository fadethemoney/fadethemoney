"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/users", label: "Users" },
];

/** Sticky tab nav shared by every admin screen. Highlights the active section. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav">
      <div className="admin-nav-inner">
        {TABS.map((t) => {
          const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={`admin-tab${active ? " active" : ""}`}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
