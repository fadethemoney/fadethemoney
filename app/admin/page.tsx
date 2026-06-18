import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

type RecentTip = { id: string; title: string; team_pick: string; status: "draft" | "active"; created_at: string };

type Dashboard = {
  totalUsers: number;
  subscribed: number;
  totalTips: number;
  activeTips: number;
  recent: RecentTip[];
};

const EMPTY: Dashboard = { totalUsers: 0, subscribed: 0, totalTips: 0, activeTips: 0, recent: [] };

/** Real counts + recent tips. Runs as the logged-in admin, so RLS lets it read
 *  every profile and notification. Falls back to zeros in mock mode (no env). */
async function loadDashboard(): Promise<Dashboard> {
  if (!isSupabaseConfigured) return EMPTY;
  const supabase = await createSupabaseServerClient();
  const [users, subs, tips, active, recent] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("email_opt_in", true),
    supabase.from("notifications").select("id", { count: "exact", head: true }),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase
      .from("notifications")
      .select("id, title, team_pick, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  return {
    totalUsers: users.count ?? 0,
    subscribed: subs.count ?? 0,
    totalTips: tips.count ?? 0,
    activeTips: active.count ?? 0,
    recent: (recent.data as RecentTip[] | null) ?? [],
  };
}

function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default async function AdminDashboardPage() {
  const d = await loadDashboard();
  const stats = [
    { label: "Total users", value: String(d.totalUsers), trend: "registered" },
    { label: "Subscribed", value: String(d.subscribed), trend: "email opt-in" },
    { label: "Tips posted", value: String(d.totalTips), trend: "all time" },
    { label: "Active tips", value: String(d.activeTips), trend: "live now" },
  ];

  return (
    <>
      <h1 className="admin-h1">Dashboard</h1>
      <p className="admin-sub">Overview of accounts and the tips you&apos;ve posted.</p>

      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-trend">{s.trend}</div>
          </div>
        ))}
      </div>

      <div className="admin-grid-2">
        <div className="admin-panel">
          <div className="admin-panel-title">Recent tips</div>
          {d.recent.length === 0 ? (
            <div className="nm-empty">No tips yet.</div>
          ) : (
            d.recent.map((t) => (
              <div className="tip-row" key={t.id}>
                <div className="tip-main">
                  <div className="tip-title">{t.title}</div>
                  <div className="tip-meta">
                    {t.team_pick} · {ago(t.created_at)}
                  </div>
                </div>
                <span className={`tip-status ${t.status}`}>{t.status}</span>
              </div>
            ))
          )}
        </div>

        <div className="admin-panel">
          <div className="admin-panel-title">Quick actions</div>
          <div className="admin-quick">
            <Link className="quick-link" href="/admin/notifications">
              Post a new tip <span className="arrow">→</span>
            </Link>
            <Link className="quick-link" href="/admin/users">
              Manage users <span className="arrow">→</span>
            </Link>
            <Link className="quick-link" href="/">
              View public dashboard <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
