import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ArticleCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImage: string | null;
  publishedAt: string | null;
};

export type Article = ArticleCard & { body: string };
export type AdminArticle = Article & { status: "draft" | "published" };

const CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

type Row = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image: string | null;
  published_at: string | null;
};

function toCard(r: Row): ArticleCard {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt ?? "",
    coverImage: r.cover_image,
    publishedAt: r.published_at,
  };
}

const CARD_COLS = "id, slug, title, excerpt, cover_image, published_at";

/**
 * Published articles, newest first. Read with the service-role client and an
 * explicit status filter (mirrors lib/notifications.ts) so the public pages
 * render for logged-out visitors too. Always returns an array, never throws.
 */
export async function getPublishedArticles(limit?: number): Promise<ArticleCard[]> {
  if (!CONFIGURED) return [];
  try {
    const admin = createSupabaseAdminClient();
    let q = admin
      .from("articles")
      .select(CARD_COLS)
      .eq("status", "published")
      .order("published_at", { ascending: false });
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error || !data) return [];
    return (data as Row[]).map(toCard);
  } catch {
    return [];
  }
}

/** A single PUBLISHED article by slug (public). null if missing/draft. */
export async function getArticleBySlug(slug: string): Promise<Article | null> {
  if (!CONFIGURED) return null;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("articles")
      .select(`${CARD_COLS}, body`)
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (error || !data) return null;
    return { ...toCard(data as Row), body: (data as Row & { body: string }).body ?? "" };
  } catch {
    return null;
  }
}

/**
 * Any article by id, INCLUDING drafts — for the admin editor only. Callers must
 * already be in an admin-gated context (the /admin layout enforces this).
 */
export async function getArticleForEdit(id: string): Promise<AdminArticle | null> {
  if (!CONFIGURED) return null;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("articles")
      .select(`${CARD_COLS}, body, status`)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Row & { body: string; status: "draft" | "published" };
    return { ...toCard(row), body: row.body ?? "", status: row.status };
  } catch {
    return null;
  }
}

/** URL-safe slug from a title. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "article"
  );
}
