"use client";

import { useState } from "react";

type Role = "customer" | "admin" | "super_admin";
type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  optIn: boolean;
  joined: string;
};

const INITIAL_USERS: User[] = [
  { id: 1, name: "Robert (owner)", email: "robert@doctorautoglass.com", role: "super_admin", optIn: true, joined: "Jan 2026" },
  { id: 2, name: "Sam Bryann", email: "sbryann18@gmail.com", role: "admin", optIn: true, joined: "Feb 2026" },
  { id: 3, name: "Jordan Banks", email: "jordan@example.com", role: "customer", optIn: true, joined: "Mar 2026" },
  { id: 4, name: "Alex Rivera", email: "alex.rivera@example.com", role: "customer", optIn: false, joined: "Apr 2026" },
  { id: 5, name: "Casey Lin", email: "casey.lin@example.com", role: "customer", optIn: true, joined: "May 2026" },
  { id: 6, name: "Morgan Diaz", email: "morgan.diaz@example.com", role: "admin", optIn: true, joined: "May 2026" },
];

const ROLE_LABEL: Record<Role, string> = {
  customer: "User",
  admin: "Admin",
  super_admin: "Super admin",
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  // Demo-only control: preview the page as a super_admin vs a regular admin.
  const [viewAs, setViewAs] = useState<Role>("super_admin");
  const [notice, setNotice] = useState<string>();
  const isSuper = viewAs === "super_admin";

  const subscribed = users.filter((u) => u.optIn).length;

  function unsubscribe(id: number) {
    setUsers((list) => list.map((u) => (u.id === id ? { ...u, optIn: false } : u)));
  }
  function setRole(id: number, role: Role) {
    setUsers((list) => list.map((u) => (u.id === id ? { ...u, role } : u)));
  }
  function remove(id: number) {
    setUsers((list) => list.filter((u) => u.id !== id));
  }
  function exportCsv() {
    setNotice(`Exported ${users.length} users to CSV. (Demo — no file generated yet.)`);
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
          <button className="account-btn" onClick={exportCsv}>
            Export CSV
          </button>
        ) : null}
      </div>

      {/* Demo control — not part of the real product; lets you preview both roles */}
      <div className="ul-viewas">
        <span className="ul-viewas-label">Preview as</span>
        <div className="seg" role="group" aria-label="Preview role">
          <button
            type="button"
            className={isSuper ? "active" : ""}
            onClick={() => {
              setViewAs("super_admin");
              setNotice(undefined);
            }}
          >
            Super admin
          </button>
          <button
            type="button"
            className={!isSuper ? "active" : ""}
            onClick={() => {
              setViewAs("admin");
              setNotice(undefined);
            }}
          >
            Admin
          </button>
        </div>
      </div>

      {notice ? (
        <div className="auth-banner info" style={{ marginBottom: 16 }} role="status">
          {notice}
        </div>
      ) : null}

      <div className="ul-table">
        <div className="ul-head">
          <div>Name</div>
          <div>Email</div>
          <div>Role</div>
          <div>Email</div>
          <div>Actions</div>
        </div>

        {users.map((u) => {
          const canManageRole = isSuper && u.role !== "super_admin";
          const canDelete = isSuper && u.role !== "super_admin";
          const actions: React.ReactNode[] = [];

          if (u.optIn) {
            actions.push(
              <button key="unsub" className="ul-sm-btn" onClick={() => unsubscribe(u.id)}>
                Unsubscribe
              </button>,
            );
          }
          if (canManageRole && u.role === "customer") {
            actions.push(
              <button key="mk" className="ul-sm-btn" onClick={() => setRole(u.id, "admin")}>
                Make admin
              </button>,
            );
          }
          if (canManageRole && u.role === "admin") {
            actions.push(
              <button key="rm" className="ul-sm-btn" onClick={() => setRole(u.id, "customer")}>
                Remove admin
              </button>,
            );
          }
          if (canDelete) {
            actions.push(
              <button key="del" className="ul-sm-btn danger" onClick={() => remove(u.id)}>
                Delete
              </button>,
            );
          }

          return (
            <div className="ul-row" key={u.id}>
              <div className="ul-cell ul-name">
                <span className="ul-k">Name</span>
                {u.name}
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
                <span className={`optin ${u.optIn ? "yes" : "no"}`}>
                  {u.optIn ? "Subscribed" : "Unsubscribed"}
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
    </>
  );
}
