"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Modal } from "@/components/admin/Modal";
import { AuthButton } from "@/components/auth/AuthButton";
import { Field } from "@/components/auth/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Status = "draft" | "active";
type Tip = { id: string; title: string; teamPick: string; message: string; status: Status };

const EMPTY_FORM = { title: "", teamPick: "", message: "", status: "draft" as Status };

// Map a notifications DB row to the UI shape.
function fromRow(r: {
  id: string;
  title: string;
  team_pick: string;
  message: string | null;
  status: Status;
}): Tip {
  return { id: r.id, title: r.title, teamPick: r.team_pick, message: r.message ?? "", status: r.status };
}

const SELECT = "id, title, team_pick, message, status";

export default function NotificationsPage() {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  // Load existing tips (admins read all via RLS; ordered newest first).
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select(SELECT)
        .order("created_at", { ascending: false });
      if (!active) return;
      if (!error && data) setTips(data.map(fromRow));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

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

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.teamPick.trim()) {
      setError("Title and team pick are required.");
      return;
    }
    setBusy(true);
    setError(undefined);
    const payload = {
      title: form.title.trim(),
      team_pick: form.teamPick.trim(),
      message: form.message.trim(),
      status: form.status,
    };

    if (editingId !== null) {
      const { data, error } = await supabase
        .from("notifications")
        .update(payload)
        .eq("id", editingId)
        .select(SELECT)
        .single();
      if (error || !data) {
        setError(error?.message ?? "Could not save.");
        setBusy(false);
        return;
      }
      setTips((list) => list.map((t) => (t.id === editingId ? fromRow(data) : t)));
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("notifications")
        .insert({ ...payload, created_by: user?.id ?? null })
        .select(SELECT)
        .single();
      if (error || !data) {
        setError(error?.message ?? "Could not create.");
        setBusy(false);
        return;
      }
      setTips((list) => [fromRow(data), ...list]);
    }
    setBusy(false);
    setOpen(false);
  }

  async function toggleStatus(id: string) {
    const tip = tips.find((t) => t.id === id);
    if (!tip) return;
    const next: Status = tip.status === "active" ? "draft" : "active";
    setTips((list) => list.map((t) => (t.id === id ? { ...t, status: next } : t))); // optimistic
    const { error } = await supabase.from("notifications").update({ status: next }).eq("id", id);
    if (error) {
      setTips((list) => list.map((t) => (t.id === id ? { ...t, status: tip.status } : t))); // revert
    }
  }

  async function remove(id: string) {
    const prev = tips;
    setTips((list) => list.filter((t) => t.id !== id)); // optimistic
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) setTips(prev); // revert
  }

  return (
    <>
      <div className="nm-head">
        <div>
          <h1 className="admin-h1">Notifications</h1>
          <p className="admin-sub" style={{ marginBottom: 0 }}>
            Post a tip. Active tips appear in the announcement bar at the top of the site.
          </p>
        </div>
        <button className="account-btn" onClick={openNew}>
          + New tip
        </button>
      </div>

      {loading ? (
        <div className="nm-empty">Loading…</div>
      ) : tips.length === 0 ? (
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
                  {t.status === "active" ? "Move to draft" : "Activate"}
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
          <AuthButton type="submit">
            {busy ? "Saving…" : editingId !== null ? "Save changes" : "Create tip"}
          </AuthButton>
        </form>
      </Modal>
    </>
  );
}
