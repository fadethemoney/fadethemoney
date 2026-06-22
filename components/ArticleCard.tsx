import Link from "next/link";
import type { ArticleCard as Article } from "@/lib/articles";

export function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Presentational news card used on the homepage section and the /blog grid. */
export function ArticleCard({ article }: { article: Article }) {
  return (
    <Link href={`/blog/${article.slug}`} className="news-card">
      <div className="news-card-media">
        {article.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={article.coverImage} alt="" loading="lazy" />
        ) : (
          <div className="news-card-media placeholder" aria-hidden />
        )}
      </div>
      <div className="news-card-body">
        <h3 className="news-card-title">{article.title}</h3>
        {article.excerpt ? <p className="news-card-excerpt">{article.excerpt}</p> : null}
        {article.publishedAt ? <div className="news-card-date">{fmtDate(article.publishedAt)}</div> : null}
      </div>
    </Link>
  );
}
