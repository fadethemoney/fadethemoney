"use client";

import { useEffect, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { deleteUser, setOptIn, setUserRole } from "./actions";

type Role = "customer" | "admin" | "super_admin";
type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  email_opt_in: boolean;
  created_at: string;
};

const ROLE_LABEL: Record<Role, string> = {
  customer: "User",
  admin: "Admin",
  super_admin: "Super admin",
};

const SELECT = "id, name, email, role, email_opt_in, created_at";

function fromRow(r: {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  email_opt_in: boolean;
  created_at: string;
}): User {
  return { ...r, name: r.name ?? "" };
}

function joined(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function downloadCsv(users: User[]) {
  const header = ["Name", "Email", "Role", "Email opt-in", "Joined"];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = users.map((u) =>
    [u.name, u.email, ROLE_LABEL[u.role], u.email_opt_in ? "Subscribed" : "Unsubscribed", joined(u.created_at)]
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
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  const subscribed = users.filter((u) => u.email_opt_in).length;

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
    downloadCsv(users);
    setNotice({ kind: "info", text: `Exported ${users.length} users to CSV.` });
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
          <button className="account-btn" onClick={exportCsv} disabled={loading || users.length === 0}>
            Export CSV
          </button>
        ) : null}
      </div>

      {notice ? (
        <div className={`auth-banner ${notice.kind}`} style={{ marginBottom: 16 }} role="status">
          {notice.text}
        </div>
      ) : null}

      {loading ? (
        <div className="nm-empty">Loading…</div>
      ) : loadError ? (
        <div className="nm-empty">Couldn&apos;t load users. Refresh to try again.</div>
      ) : users.length === 0 ? (
        <div className="nm-empty">No registered users yet.</div>
      ) : (
        <div className="ul-table" aria-busy={pending}>
          <div className="ul-head">
            <div>Name</div>
            <div>Email</div>
            <div>Role</div>
            <div>Email</div>
            <div>Actions</div>
          </div>

          {users.map((u) => {
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
                  {u.name || "—"}
                </div>
                <div className="ul-cell">
                  <span className="ul-k">Email</span>
                  <span className="ul-email">{u.email}</span>
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
