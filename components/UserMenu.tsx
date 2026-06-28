"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { IconGrid, IconUser, IconBell, IconNews, IconUsers, IconLogout } from "@/components/icons";

function initials(s: string) {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

type Props = {
  name: string;
  email: string;
  dashboardHref: string;
  isAdmin: boolean;
};

/** Account dropdown shown in the header once a user is signed in:
 *  Dashboard (role-based) · Account & profile · Log out. */
export function UserMenu({ name, email, dashboardHref, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.assign("/");
  }

  return (
    <div className="usermenu" ref={ref}>
      <button
        type="button"
        className="usermenu-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="usermenu-avatar" aria-hidden>
          {initials(name)}
        </span>
        <span className="usermenu-name">{name}</span>
        <span className="usermenu-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div className="usermenu-pop" role="menu">
          <div className="usermenu-head">
            <div className="usermenu-head-name">{name}</div>
            <div className="usermenu-head-email">{email}</div>
          </div>
          <Link role="menuitem" className="usermenu-item" href={isAdmin ? dashboardHref : "/"} onClick={() => setOpen(false)}>
            <IconGrid />
            {isAdmin ? "Admin dashboard" : "Dashboard"}
          </Link>
          {isAdmin ? (
            <>
              <Link role="menuitem" className="usermenu-item" href="/admin/notifications" onClick={() => setOpen(false)}>
                <IconBell />
                Notifications
              </Link>
              <Link role="menuitem" className="usermenu-item" href="/admin/news" onClick={() => setOpen(false)}>
                <IconNews />
                News
              </Link>
              <Link role="menuitem" className="usermenu-item" href="/admin/users" onClick={() => setOpen(false)}>
                <IconUsers />
                Users
              </Link>
            </>
          ) : null}
          <Link role="menuitem" className="usermenu-item" href="/account" onClick={() => setOpen(false)}>
            <IconUser />
            Account &amp; profile
          </Link>
          <button type="button" role="menuitem" className="usermenu-item danger" onClick={logout}>
            <IconLogout />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
