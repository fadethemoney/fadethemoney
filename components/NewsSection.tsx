import Link from "next/link";
import { ArticleCard } from "@/components/ArticleCard";
import type { ArticleCard as Article } from "@/lib/articles";

/**
 * Homepage "Latest News" section: newest articles in a responsive 2-row grid
 * with a "View all" link to /blog. Renders nothing when there are no articles.
 */
export function NewsSection({ articles }: { articles: Article[] }) {
  if (articles.length === 0) return null;
  return (
    <section className="news-section">
      <div className="container">
        <div className="news-head">
          <h2 className="news-h">Latest News</h2>
          <Link href="/blog" className="news-viewall">
            View all <span aria-hidden>→</span>
          </Link>
        </div>
        <div className="news-grid">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      </div>
    </section>
  );
}
