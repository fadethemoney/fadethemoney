"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { deleteArticle, setArticleStatus } from "./actions";

type Status = "draft" | "published";
type Article = {
  id: string;
  title: string;
  status: Status;
  coverImage: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

const SELECT = "id, title, status, cover_image, published_at, updated_at";

function fromRow(r: {
  id: string;
  title: string;
  status: Status;
  cover_image: string | null;
  published_at: string | null;
  updated_at: string;
}): Article {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    coverImage: r.cover_image,
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
  };
}

function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function NewsAdminPage() {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string }>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("articles")
        .select(SELECT)
        .order("updated_at", { ascending: false });
      if (!active) return;
      if (!error && data) setArticles(data.map(fromRow));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onOk: () => void) {
    setNotice(undefined);
    startTransition(async () => {
      const res = await action();
      if (res.ok) onOk();
      else setNotice({ kind: "error", text: res.error });
    });
  }

  function toggle(a: Article) {
    const next: Status = a.status === "published" ? "draft" : "published";
    run(
      () => setArticleStatus(a.id, next),
      () => setArticles((list) => list.map((x) => (x.id === a.id ? { ...x, status: next } : x))),
    );
  }

  function remove(a: Article) {
    if (!window.confirm("Delete this article? This can't be undone.")) return;
    run(
      () => deleteArticle(a.id),
      () => setArticles((list) => list.filter((x) => x.id !== a.id)),
    );
  }

  return (
    <>
      <div className="nm-head">
        <div>
          <h1 className="admin-h1">News</h1>
          <p className="admin-sub" style={{ marginBottom: 0 }}>
            Write articles for the homepage and the public News page.
          </p>
        </div>
        <Link className="account-btn" href="/admin/news/new">
          + New article
        </Link>
      </div>

      {notice ? (
        <div className={`auth-banner ${notice.kind}`} style={{ marginBottom: 16 }} role="status">
          {notice.text}
        </div>
      ) : null}

      {loading ? (
        <div className="nm-empty">Loading…</div>
      ) : articles.length === 0 ? (
        <div className="nm-empty">No articles yet. Hit “New article” to write your first one.</div>
      ) : (
        <div className="nm-list" aria-busy={pending}>
          {articles.map((a) => (
            <div className="nm-card article-row" key={a.id}>
              {a.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="article-thumb" src={a.coverImage} alt="" />
              ) : (
                <div className="article-thumb placeholder" aria-hidden />
              )}
              <div className="article-row-main">
                <div className="nm-card-top">
                  <div className="tip-main">
                    <div className="nm-title">{a.title}</div>
                    <div className="nm-pick">
                      {a.status === "published" ? `Published · ${when(a.publishedAt)}` : "Draft"}
                    </div>
                  </div>
                  <span className={`tip-status ${a.status === "published" ? "active" : ""}`}>
                    {a.status}
                  </span>
                </div>
                <div className="nm-actions">
                  <Link className="nm-btn" href={`/admin/news/${a.id}`}>
                    Edit
                  </Link>
                  <button className="nm-btn" disabled={pending} onClick={() => toggle(a)}>
                    {a.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                  <button className="nm-btn danger" disabled={pending} onClick={() => remove(a)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
