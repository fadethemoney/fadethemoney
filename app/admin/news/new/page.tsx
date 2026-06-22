import { ArticleEditor } from "@/components/admin/ArticleEditor";

export const dynamic = "force-dynamic";

export default function NewArticlePage() {
  return (
    <>
      <h1 className="admin-h1">New article</h1>
      <p className="admin-sub">Write a story for the homepage News section and the public blog.</p>
      <ArticleEditor />
    </>
  );
}
