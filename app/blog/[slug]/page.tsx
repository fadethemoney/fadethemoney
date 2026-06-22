import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDate } from "@/components/ArticleCard";
import { getArticleBySlug } from "@/lib/articles";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return { title: "Article not found — Fade The Money" };
  return {
    title: `${article.title} — Fade The Money`,
    description: article.excerpt || undefined,
    openGraph: {
      title: article.title,
      description: article.excerpt || undefined,
      images: article.coverImage ? [{ url: article.coverImage }] : undefined,
      type: "article",
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  return (
    <main className="container article-page">
      <Link href="/blog" className="article-back">
        ← All news
      </Link>
      <article>
        <h1 className="serif article-headline">{article.title}</h1>
        {article.publishedAt ? (
          <div className="article-meta">{fmtDate(article.publishedAt)}</div>
        ) : null}
        {article.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="article-cover" src={article.coverImage} alt="" />
        ) : null}
        {/* Body HTML is sanitized on save (see app/admin/news/actions.ts). */}
        <div className="article-body" dangerouslySetInnerHTML={{ __html: article.body }} />
      </article>
    </main>
  );
}
