"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Modal } from "@/components/admin/Modal";
import { AuthButton } from "@/components/auth/AuthButton";
import { Field } from "@/components/auth/Field";

type Status = "draft" | "active";
type Tip = { id: number; title: string; teamPick: string; message: string; status: Status };

const INITIAL_TIPS: Tip[] = [
  {
    id: 3,
    title: "Lakers ML vs Suns",
    teamPick: "LAL moneyline",
    message: "Public is heavy on Phoenix tonight — we're fading to the Lakers at home.",
    status: "active",
  },
  {
    id: 2,
    title: "Over 47.5 — Chiefs / Bills",
    teamPick: "OVER 47.5",
    message: "Both offenses trending up; sharp money pushing the total over.",
    status: "active",
  },
  {
    id: 1,
    title: "Celtics ML",
    teamPick: "BOS moneyline",
    message: "Draft — not sent yet.",
    status: "draft",
  },
];

const EMPTY_FORM = { title: "", teamPick: "", message: "", status: "draft" as Status };

export default function NotificationsPage() {
  const [tips, setTips] = useState<Tip[]>(INITIAL_TIPS);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string>();

  const setField =
    (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(undefined);
    setOpen(true);
  }

  function openEdit(tip: Tip) {
    setEditingId(tip.id);
    setForm({ title: tip.title, teamPick: tip.teamPick, message: tip.message, status: tip.status });
    setError(undefined);
    setOpen(true);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.teamPick.trim()) {
      setError("Title and team pick are required.");
      return;
    }
    if (editingId !== null) {
      setTips((list) => list.map((t) => (t.id === editingId ? { ...t, ...form } : t)));
    } else {
      const nextId = tips.reduce((m, t) => Math.max(m, t.id), 0) + 1;
      setTips((list) => [{ id: nextId, ...form }, ...list]);
    }
    setOpen(false);
  }

  function toggleStatus(id: number) {
    setTips((list) =>
      list.map((t) => (t.id === id ? { ...t, status: t.status === "active" ? "draft" : "active" } : t)),
    );
  }

  function remove(id: number) {
    setTips((list) => list.filter((t) => t.id !== id));
  }

  return (
    <>
      <div className="nm-head">
        <div>
          <h1 className="admin-h1">Notifications</h1>
          <p className="admin-sub" style={{ marginBottom: 0 }}>
            Post a tip and email it to your users.
          </p>
        </div>
        <button className="account-btn" onClick={openNew}>
          + New tip
        </button>
      </div>

      {tips.length === 0 ? (
        <div className="nm-empty">No tips yet. Hit “New tip” to post your first one.</div>
      ) : (
        <div className="nm-list">
          {tips.map((t) => (
            <div className="nm-card" key={t.id}>
              <div className="nm-card-top">
                <div className="tip-main">
                  <div className="nm-title">{t.title}</div>
                  <div className="nm-pick">{t.teamPick}</div>
                </div>
                <span className={`tip-status ${t.status}`}>{t.status}</span>
              </div>
              {t.message ? <p className="nm-message">{t.message}</p> : null}
              <div className="nm-actions">
                <button className="nm-btn" onClick={() => openEdit(t)}>
                  Edit
                </button>
                <button className="nm-btn" onClick={() => toggleStatus(t.id)}>
                  {t.status === "active" ? "Move to draft" : "Activate & send"}
                </button>
                <button className="nm-btn danger" onClick={() => remove(t.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} title={editingId !== null ? "Edit tip" : "New tip"} onClose={() => setOpen(false)}>
        <form className="auth-form" onSubmit={save} noValidate>
          <Field
            label="Title"
            name="title"
            value={form.title}
            onChange={setField("title")}
            placeholder="e.g. Lakers ML vs Suns"
          />
          <Field
            label="Team pick"
            name="teamPick"
            value={form.teamPick}
            onChange={setField("teamPick")}
            placeholder="e.g. LAL moneyline / OVER 47.5"
          />
          <div className="field">
            <label className="field-label" htmlFor="message">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              className="field-input"
              rows={3}
              value={form.message}
              onChange={setField("message")}
              placeholder="Why you're on this pick…"
            />
          </div>
          <div className="field">
            <label className="field-label">Status</label>
            <div className="seg" role="group" aria-label="Status">
              <button
                type="button"
                className={form.status === "draft" ? "active" : ""}
                onClick={() => setForm((f) => ({ ...f, status: "draft" }))}
              >
                Draft
              </button>
              <button
                type="button"
                className={form.status === "active" ? "active" : ""}
                onClick={() => setForm((f) => ({ ...f, status: "active" }))}
              >
                Active
              </button>
            </div>
          </div>
          {error ? <div className="auth-banner error">{error}</div> : null}
          <AuthButton type="submit">{editingId !== null ? "Save changes" : "Create tip"}</AuthButton>
        </form>
      </Modal>
    </>
  );
}
