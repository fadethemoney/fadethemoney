"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Modal } from "@/components/admin/Modal";
import { AuthButton } from "@/components/auth/AuthButton";
import { Field } from "@/components/auth/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { emailTip } from "./actions";

type Status = "draft" | "active";
type Tip = {
  id: string;
  title: string;
  teamPick: string;
  message: string;
  status: Status;
  emailed: boolean;
  imageUrl: string;
};

const EMPTY_FORM = { title: "", teamPick: "", message: "", imageUrl: "", status: "draft" as Status };

const MIGRATION_HINT =
  "Saved, but the picture wasn't — run supabase/migrations/0007_notification_image.sql in the Supabase SQL editor.";

// Map a notifications DB row to the UI shape. emailed_at / image_url are
// optional because a project that hasn't run migration 0003 / 0007 yet won't
// have those columns.
function fromRow(r: {
  id: string;
  title: string;
  team_pick: string;
  message: string | null;
  status: Status;
  emailed_at?: string | null;
  image_url?: string | null;
}): Tip {
  return {
    id: r.id,
    title: r.title,
    teamPick: r.team_pick,
    message: r.message ?? "",
    status: r.status,
    emailed: !!r.emailed_at,
    imageUrl: r.image_url ?? "",
  };
}

// Base columns that exist on every project; the newer columns are queried
// together and dropped as a set so the page still loads before migrations
// 0003 / 0007 are applied.
const SELECT = "id, title, team_pick, message, status";
const SELECT_FULL = `${SELECT}, emailed_at, image_url`;

// Postgres reports an unknown column as 42703; PostgREST's schema cache as
// PGRST204. Either means the migration hasn't been run yet.
function isMissingColumn(err: { code?: string } | null): boolean {
  return err?.code === "42703" || err?.code === "PGRST204";
}

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Upload failed.");
  return data.url as string;
}

export default function NotificationsPage() {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string }>();
  const [uploading, setUploading] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // Load existing tips (admins read all via RLS; ordered newest first). Try the
  // query with emailed_at first; if that column isn't migrated yet, fall back to
  // the base columns so the page still works.
  useEffect(() => {
    let active = true;
    (async () => {
      let rows:
        | {
            id: string;
            title: string;
            team_pick: string;
            message: string | null;
            status: Status;
            emailed_at?: string | null;
            image_url?: string | null;
          }[]
        | null = null;
      const withEmailed = await supabase
        .from("notifications")
        .select(SELECT_FULL)
        .order("created_at", { ascending: false });
      if (withEmailed.error) {
        const base = await supabase
          .from("notifications")
          .select(SELECT)
          .order("created_at", { ascending: false });
        rows = base.data;
      } else {
        rows = withEmailed.data;
      }
      if (!active) return;
      if (rows) setTips(rows.map(fromRow));
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
    setForm({
      title: tip.title,
      teamPick: tip.teamPick,
      message: tip.message,
      imageUrl: tip.imageUrl,
      status: tip.status,
    });
    setError(undefined);
    setOpen(true);
  }

  // Upload straight to Vercel Blob via the admin route the news editor uses,
  // then keep the public URL on the form. The picture is stored on the tip and
  // rendered at the top of the email when it goes out to subscribers.
  async function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(undefined);
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setForm((f) => ({ ...f, imageUrl: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.teamPick.trim()) {
      setError("Title and team pick are required.");
      return;
    }
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const payload = {
      title: form.title.trim(),
      team_pick: form.teamPick.trim(),
      message: form.message.trim(),
      status: form.status,
    };
    const image = form.imageUrl.trim();
    // Written on top of the base payload, then retried without it if migration
    // 0007 hasn't been applied — the tip still saves, just with no picture.
    const withImage = { ...payload, image_url: image || null };
    let imageSaved = true;

    if (editingId !== null) {
      const update = (body: object) =>
        supabase.from("notifications").update(body).eq("id", editingId).select(SELECT).single();
      let { data, error } = await update(withImage);
      if (isMissingColumn(error)) {
        imageSaved = false;
        ({ data, error } = await update(payload));
      }
      if (error || !data) {
        setError(error?.message ?? "Could not save.");
        setBusy(false);
        return;
      }
      // Preserve the existing emailed flag (the update query doesn't return it).
      setTips((list) =>
        list.map((t) =>
          t.id === editingId
            ? { ...fromRow(data), emailed: t.emailed, imageUrl: imageSaved ? image : t.imageUrl }
            : t,
        ),
      );
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const insert = (body: object) =>
        supabase
          .from("notifications")
          .insert({ ...body, created_by: user?.id ?? null })
          .select(SELECT)
          .single();
      let { data, error } = await insert(withImage);
      if (isMissingColumn(error)) {
        imageSaved = false;
        ({ data, error } = await insert(payload));
      }
      if (error || !data) {
        setError(error?.message ?? "Could not create.");
        setBusy(false);
        return;
      }
      setTips((list) => [{ ...fromRow(data), imageUrl: imageSaved ? image : "" }, ...list]);
    }
    setBusy(false);
    setOpen(false);
    if (!imageSaved && image) setNotice({ kind: "error", text: MIGRATION_HINT });
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

  // Email an active tip to all opted-in subscribers. The server action enforces
  // a one-time claim, so this can't double-send even on a fast double click.
  async function emailSubscribers(t: Tip) {
    if (t.status !== "active" || t.emailed || emailingId) return;
    if (!window.confirm("Email this tip to all opted-in subscribers? This can only be done once.")) {
      return;
    }
    setNotice(undefined);
    setEmailingId(t.id);
    const res = await emailTip(t.id);
    setEmailingId(null);
    if (res.ok) {
      setTips((list) => list.map((x) => (x.id === t.id ? { ...x, emailed: true } : x)));
      setNotice({
        kind: "success",
        text: `Sent to ${res.sent} subscriber${res.sent === 1 ? "" : "s"}.${res.failed ? ` ${res.failed} failed.` : ""}`,
      });
    } else {
      // If it was already emailed, reflect that so the button locks too.
      if (/already been emailed/i.test(res.error)) {
        setTips((list) => list.map((x) => (x.id === t.id ? { ...x, emailed: true } : x)));
      }
      setNotice({ kind: "error", text: res.error });
    }
  }

  return (
    <>
      <div className="nm-head">
        <div>
          <h1 className="admin-h1">Notifications</h1>
          <p className="admin-sub" style={{ marginBottom: 0 }}>
            Post a pick. Active picks appear in the announcement bar at the top of the site, and
            “Email subscribers” sends one — picture and all — to every opted-in member.
          </p>
        </div>
        <button className="account-btn" onClick={openNew}>
          + New tip
        </button>
      </div>

      {notice ? (
        <div className={`auth-banner ${notice.kind}`} style={{ marginBottom: 16 }} role="status">
          {notice.text}
        </div>
      ) : null}

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
              {t.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="nm-thumb" src={t.imageUrl} alt="" />
              ) : null}
              <div className="nm-actions">
                <button className="nm-btn" onClick={() => openEdit(t)}>
                  Edit
                </button>
                <button className="nm-btn" onClick={() => toggleStatus(t.id)}>
                  {t.status === "active" ? "Move to draft" : "Activate"}
                </button>
                {t.status === "active" ? (
                  t.emailed ? (
                    <span className="nm-emailed" title="Already emailed to subscribers">
                      Emailed ✓
                    </span>
                  ) : (
                    <button
                      className="nm-btn"
                      disabled={emailingId === t.id}
                      onClick={() => emailSubscribers(t)}
                    >
                      {emailingId === t.id ? "Sending…" : "Email subscribers"}
                    </button>
                  )
                ) : null}
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
            <label className="field-label">
              Picture <span className="field-hint">(shown at the top of the email)</span>
            </label>
            {form.imageUrl ? (
              <div className="cover-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.imageUrl} alt="Pick image preview" />
                <button
                  type="button"
                  className="nm-btn danger"
                  onClick={() => setForm((f) => ({ ...f, imageUrl: "" }))}
                >
                  Remove
                </button>
              </div>
            ) : null}
            <input ref={imgInputRef} type="file" accept="image/*" hidden onChange={onPickImage} />
            <button
              type="button"
              className="nm-btn"
              onClick={() => imgInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : form.imageUrl ? "Replace picture" : "Upload picture"}
            </button>
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
