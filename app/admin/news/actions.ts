"use server";

import sanitizeHtml from "sanitize-html";
import { getProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/articles";

/**
 * Article CRUD for the admin News manager. All writes run server-side with the
 * service-role client and re-check the caller's role first. Article HTML (from
 * the WYSIWYG editor) is sanitized here before it's stored, so the public pages
 * can render it safely.
 */

type Status = "draft" | "published";
type ArticleInput = {
  title: string;
  excerpt: string;
  coverImage: string;
  body: string; // raw HTML from the editor
  status: Status;
};

type SaveResult = { ok: true; id: string; slug: string } | { ok: false; error: string };
type Result = { ok: true } | { ok: false; error: string };

// sanitize-html (pure JS, no jsdom) — serverless-safe on Vercel. Mirrors the
// previous DOMPurify allowlist: same tags, href/target/rel on links, src/alt on
// images, title anywhere. Anything else (scripts, styles, classes, etc.) is
// stripped. Only https/http/mailto/etc. URLs survive, so data: URIs are dropped.
const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "u", "s", "h1", "h2", "h3", "blockquote",
    "ul", "ol", "li", "a", "img", "code", "pre", "hr",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel", "title"],
    img: ["src", "alt", "title"],
    "*": ["title"],
  },
};

async function requireAdmin(): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const me = await getProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (me.role !== "admin" && me.role !== "super_admin") {
    return { ok: false, error: "Only an admin can do that." };
  }
  return { ok: true, id: me.id };
}

function cleanInput(input: ArticleInput) {
  const title = input.title.trim();
  const excerpt = input.excerpt.trim();
  const coverImage = input.coverImage.trim();
  const body = sanitizeHtml(input.body ?? "", SANITIZE);
  const status: Status = input.status === "published" ? "published" : "draft";
  return { title, excerpt, coverImage, body, status };
}

/** Find a slug not already used by another row (appends -2, -3, … on collision). */
async function uniqueSlug(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  base: string,
  excludeId?: string,
): Promise<string> {
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const { data } = await admin.from("articles").select("id").eq("slug", candidate).maybeSingle();
    if (!data || data.id === excludeId) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function createArticle(input: ArticleInput): Promise<SaveResult> {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    const c = cleanInput(input);
    if (!c.title) return { ok: false, error: "Title is required." };

    const admin = createSupabaseAdminClient();
    const slug = await uniqueSlug(admin, slugify(c.title));
    const { data, error } = await admin
      .from("articles")
      .insert({
        slug,
        title: c.title,
        excerpt: c.excerpt || null,
        cover_image: c.coverImage || null,
        body: c.body,
        status: c.status,
        author_id: guard.id,
        published_at: c.status === "published" ? new Date().toISOString() : null,
      })
      .select("id, slug")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Could not create the article." };
    return { ok: true, id: data.id, slug: data.slug };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the article." };
  }
}

export async function updateArticle(id: string, input: ArticleInput): Promise<SaveResult> {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    const c = cleanInput(input);
    if (!c.title) return { ok: false, error: "Title is required." };

    const admin = createSupabaseAdminClient();
    const { data: existing } = await admin
      .from("articles")
      .select("status, published_at")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return { ok: false, error: "Article not found." };

    // Stamp published_at the first time it goes live; keep it once set.
    let publishedAt = existing.published_at as string | null;
    if (c.status === "published" && !publishedAt) publishedAt = new Date().toISOString();
    if (c.status === "draft") publishedAt = null;

    const { data, error } = await admin
      .from("articles")
      .update({
        title: c.title,
        excerpt: c.excerpt || null,
        cover_image: c.coverImage || null,
        body: c.body,
        status: c.status,
        published_at: publishedAt,
      })
      .eq("id", id)
      .select("id, slug")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Could not save the article." };
    return { ok: true, id: data.id, slug: data.slug };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the article." };
  }
}

export async function setArticleStatus(id: string, status: Status): Promise<Result> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("articles")
    .select("published_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Article not found." };

  const publishedAt =
    status === "published"
      ? ((existing.published_at as string | null) ?? new Date().toISOString())
      : null;
  const { error } = await admin
    .from("articles")
    .update({ status, published_at: publishedAt })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteArticle(id: string): Promise<Result> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("articles").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
