import { notFound } from "next/navigation";
import { ArticleEditor } from "@/components/admin/ArticleEditor";
import { getArticleForEdit } from "@/lib/articles";

export const dynamic = "force-dynamic";

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await getArticleForEdit(id);
  if (!article) notFound();

  return (
    <>
      <h1 className="admin-h1">Edit article</h1>
      <p className="admin-sub">Update the story, then save or publish.</p>
      <ArticleEditor
        article={{
          id: article.id,
          title: article.title,
          excerpt: article.excerpt,
          coverImage: article.coverImage,
          body: article.body,
          status: article.status,
        }}
      />
    </>
  );
}
