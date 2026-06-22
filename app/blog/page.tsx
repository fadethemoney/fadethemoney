import type { Metadata } from "next";
import { ArticleCard } from "@/components/ArticleCard";
import { getPublishedArticles } from "@/lib/articles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "News — Fade The Money",
  description: "Latest betting news, previews, and analysis from Fade The Money.",
};

export default async function BlogPage() {
  const articles = await getPublishedArticles();

  return (
    <main className="container blog-page">
      <header className="blog-header">
        <h1 className="serif blog-title">News</h1>
        <p className="blog-sub">Previews, analysis, and where the public is going wrong.</p>
      </header>

      {articles.length === 0 ? (
        <div className="empty-state">No articles published yet. Check back soon.</div>
      ) : (
        <div className="news-grid">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      )}
    </main>
  );
}
