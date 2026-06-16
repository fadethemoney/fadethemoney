import Link from "next/link";

// MOCK data — replaced by real Supabase queries once the DB is wired.
const STATS = [
  { label: "Total users", value: "248", trend: "+12 this week" },
  { label: "Active tips", value: "3", trend: "live now" },
  { label: "Tips sent (30d)", value: "41", trend: "via email" },
  { label: "Streak alerts (30d)", value: "12", trend: "auto-sent" },
];

const RECENT_TIPS = [
  { title: "Lakers ML vs Suns", meta: "NBA · 2h ago", status: "active" as const },
  { title: "Over 47.5 — Chiefs / Bills", meta: "NFL · Yesterday", status: "active" as const },
  { title: "Yankees -1.5 vs Red Sox", meta: "MLB · 2 days ago", status: "active" as const },
  { title: "Celtics ML (draft)", meta: "NBA · not sent", status: "draft" as const },
];

export default function AdminDashboardPage() {
  return (
    <>
      <h1 className="admin-h1">Dashboard</h1>
      <p className="admin-sub">Overview of accounts and the tips you&apos;ve sent.</p>

      <div className="stat-grid">
        {STATS.map((s) => (
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
          {RECENT_TIPS.map((t) => (
            <div className="tip-row" key={t.title}>
              <div className="tip-main">
                <div className="tip-title">{t.title}</div>
                <div className="tip-meta">{t.meta}</div>
              </div>
              <span className={`tip-status ${t.status}`}>{t.status}</span>
            </div>
          ))}
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
