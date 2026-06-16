import type { ReactNode } from "react";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/auth";

/**
 * Shared chrome for every admin screen (dashboard / notifications / users).
 * This async Server Component is the server-side authorization boundary for the
 * whole /admin area — middleware is only a redirect convenience. In mock mode
 * (no Supabase wired) requireAdmin() returns a demo super_admin so the UI stays
 * reviewable; once Supabase is live it enforces the real role and the badge
 * reflects it.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await requireAdmin();
  const badge = profile.role === "super_admin" ? "Super Admin" : "Admin";

  return (
    <div className="admin">
      <div className="admin-bar">
        <div className="admin-bar-inner">
          <Link href="/admin" className="admin-brand">
            Fade The Money <span>Admin</span>
          </Link>
          <span className="role-badge">{badge}</span>
        </div>
      </div>
      <AdminNav />
      <div className="admin-body">{children}</div>
    </div>
  );
}
