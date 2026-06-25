"use client";

import { useEffect, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { deleteUser, getVerifiedMap, setOptIn, setUserRole } from "./actions";

type Role = "customer" | "admin" | "super_admin";
type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  role: Role;
  email_opt_in: boolean;
  created_at: string;
  // undefined while the verification status is still loading.
  verified?: boolean;
};

const ROLE_LABEL: Record<Role, string> = {
  customer: "User",
  admin: "Admin",
  super_admin: "Super admin",
};

const SELECT = "id, name, email, phone, address, role, email_opt_in, created_at";

function fromRow(r: {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  role: Role;
  email_opt_in: boolean;
  created_at: string;
}): User {
  return { ...r, name: r.name ?? "", phone: r.phone ?? "", address: r.address ?? "" };
}

function joined(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function downloadCsv(users: User[]) {
  const header = ["Name", "Email", "Phone", "Address", "Role", "Email opt-in", "Verified", "Joined"];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const verifiedLabel = (v?: boolean) => (v === undefined ? "" : v ? "Verified" : "Not verified");
  const rows = users.map((u) =>
    [
      u.name,
      u.email,
      u.phone,
      u.address,
      ROLE_LABEL[u.role],
      u.email_opt_in ? "Subscribed" : "Unsubscribed",
      verifiedLabel(u.verified),
      joined(u.created_at),
    ]
      .map((c) => esc(String(c)))
      .join(","),
  );
  const csv = [header.map(esc).join(","), ...rows].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "fadethemoney-users.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function UsersPage() {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [users, setUsers] = useState<User[]>([]);
  const [myRole, setMyRole] = useState<Role>("admin");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string }>();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [optInFilter, setOptInFilter] = useState<"all" | "subscribed" | "unsubscribed">("all");

  const isSuper = myRole === "super_admin";

  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("profiles")
        .select(SELECT)
        .order("created_at", { ascending: true });
      if (!active) return;
      if (error) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      const list = (data ?? []).map(fromRow);
      setUsers(list);
      const me = list.find((u) => u.id === user?.id);
      if (me) setMyRole(me.role);
      setLoading(false);

      // Verification status comes from auth.users (not profiles), so fetch it
      // via a privileged server action and merge it in once it arrives.
      const verified = await getVerifiedMap();
      if (!active) return;
      setUsers((cur) => cur.map((u) => ({ ...u, verified: verified[u.id] })));
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  const subscribed = users.filter((u) => u.email_opt_in).length;

  // Search + filter happen client-side over the already-loaded list (no extra
  // queries). Search matches name or email; filters narrow by role and opt-in.
  const filtered = users.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (optInFilter === "subscribed" && !u.email_opt_in) return false;
    if (optInFilter === "unsubscribed" && u.email_opt_in) return false;
    const q = query.trim().toLowerCase();
    if (
      q &&
      !u.name.toLowerCase().includes(q) &&
      !u.email.toLowerCase().includes(q) &&
      !u.phone.toLowerCase().includes(q)
    )
      return false;
    return true;
  });

  // Run a server action, then apply `onOk` to local state when it succeeds.
  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onOk: () => void) {
    setNotice(undefined);
    startTransition(async () => {
      const res = await action();
      if (res.ok) onOk();
      else setNotice({ kind: "error", text: res.error });
    });
  }

  function unsubscribe(id: string) {
    run(
      () => setOptIn(id, false),
      () => setUsers((list) => list.map((u) => (u.id === id ? { ...u, email_opt_in: false } : u))),
    );
  }
  function changeRole(id: string, role: Role) {
    run(
      () => setUserRole(id, role),
      () => setUsers((list) => list.map((u) => (u.id === id ? { ...u, role } : u))),
    );
  }
  function remove(id: string) {
    run(
      () => deleteUser(id),
      () => setUsers((list) => list.filter((u) => u.id !== id)),
    );
  }
  function exportCsv() {
    // Export what's currently shown (respects any active search/filter).
    downloadCsv(filtered);
    setNotice({ kind: "info", text: `Exported ${filtered.length} users to CSV.` });
  }

  return (
    <>
      <div className="nm-head">
        <div>
          <h1 className="admin-h1">Users</h1>
          <p className="admin-sub" style={{ marginBottom: 0 }}>
            {users.length} registered · {subscribed} subscribed
          </p>
        </div>
        {isSuper ? (
          <button className="account-btn" onClick={exportCsv} disabled={loading || filtered.length === 0}>
            Export CSV
          </button>
        ) : null}
      </div>

      {notice ? (
        <div className={`auth-banner ${notice.kind}`} style={{ marginBottom: 16 }} role="status">
          {notice.text}
        </div>
      ) : null}

      {!loading && !loadError && users.length > 0 ? (
        <div className="ul-toolbar">
          <input
            className="field-input ul-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or phone…"
            aria-label="Search users"
          />
          <select
            className="ul-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as "all" | Role)}
            aria-label="Filter by role"
          >
            <option value="all">All roles</option>
            <option value="customer">Users</option>
            <option value="admin">Admins</option>
            <option value="super_admin">Super admins</option>
          </select>
          <select
            className="ul-filter"
            value={optInFilter}
            onChange={(e) => setOptInFilter(e.target.value as "all" | "subscribed" | "unsubscribed")}
            aria-label="Filter by email"
          >
            <option value="all">All email</option>
            <option value="subscribed">Subscribed</option>
            <option value="unsubscribed">Unsubscribed</option>
          </select>
        </div>
      ) : null}

      {loading ? (
        <div className="nm-empty">Loading…</div>
      ) : loadError ? (
        <div className="nm-empty">Couldn&apos;t load users. Refresh to try again.</div>
      ) : users.length === 0 ? (
        <div className="nm-empty">No registered users yet.</div>
      ) : filtered.length === 0 ? (
        <div className="nm-empty">No users match your search.</div>
      ) : (
        <div className="ul-table" aria-busy={pending}>
          <div className="ul-head">
            <div>Name</div>
            <div>Email</div>
            <div>Role</div>
            <div>Email</div>
            <div>Actions</div>
          </div>

          {filtered.map((u) => {
            const manageable = isSuper && u.role !== "super_admin";
            const actions: React.ReactNode[] = [];

            if (u.email_opt_in) {
              actions.push(
                <button key="unsub" className="ul-sm-btn" disabled={pending} onClick={() => unsubscribe(u.id)}>
                  Unsubscribe
                </button>,
              );
            }
            if (manageable && u.role === "customer") {
              actions.push(
                <button key="mk" className="ul-sm-btn" disabled={pending} onClick={() => changeRole(u.id, "admin")}>
                  Make admin
                </button>,
              );
            }
            if (manageable && u.role === "admin") {
              actions.push(
                <button key="rm" className="ul-sm-btn" disabled={pending} onClick={() => changeRole(u.id, "customer")}>
                  Remove admin
                </button>,
              );
            }
            if (manageable) {
              actions.push(
                <button key="del" className="ul-sm-btn danger" disabled={pending} onClick={() => remove(u.id)}>
                  Delete
                </button>,
              );
            }

            return (
              <div className="ul-row" key={u.id}>
                <div className="ul-cell ul-name">
                  <span className="ul-k">Name</span>
                  <span>{u.name || "—"}</span>
                  {u.phone ? (
                    <span style={{ display: "block", fontSize: 12, color: "#888780" }}>{u.phone}</span>
                  ) : null}
                  {u.address ? (
                    <span style={{ display: "block", fontSize: 12, color: "#888780" }}>{u.address}</span>
                  ) : null}
                </div>
                <div className="ul-cell">
                  <span className="ul-k">Email</span>
                  <span className="ul-email">{u.email}</span>
                  {u.verified === undefined ? null : (
                    <span className={`verify-tag ${u.verified ? "yes" : "no"}`}>
                      {u.verified ? "Verified" : "Not verified"}
                    </span>
                  )}
                </div>
                <div className="ul-cell">
                  <span className="ul-k">Role</span>
                  <span className={`role-pill ${u.role}`}>{ROLE_LABEL[u.role]}</span>
                </div>
                <div className="ul-cell">
                  <span className="ul-k">Email</span>
                  <span className={`optin ${u.email_opt_in ? "yes" : "no"}`}>
                    {u.email_opt_in ? "Subscribed" : "Unsubscribed"}
                  </span>
                </div>
                <div className="ul-cell ul-actions">
                  <span className="ul-k">Actions</span>
                  {actions.length ? actions : <span className="muted">—</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
