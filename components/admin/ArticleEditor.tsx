"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { createArticle, updateArticle } from "@/app/admin/news/actions";
import { Field } from "@/components/auth/Field";

type Status = "draft" | "published";

export type EditorArticle = {
  id: string;
  title: string;
  excerpt: string;
  coverImage: string | null;
  body: string;
  status: Status;
};

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Upload failed.");
  return data.url as string;
}

export function ArticleEditor({ article }: { article?: EditorArticle }) {
  const router = useRouter();
  const [title, setTitle] = useState(article?.title ?? "");
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [coverImage, setCoverImage] = useState(article?.coverImage ?? "");
  const [status, setStatus] = useState<Status>(article?.status ?? "draft");
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [error, setError] = useState<string>();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const bodyImgInputRef = useRef<HTMLInputElement>(null);

  // StarterKit (v3) already bundles Link + Underline; Image is added separately.
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      Image,
    ],
    content: article?.body ?? "",
    editorProps: { attributes: { class: "rte-content" } },
  });

  async function onPickCover(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(undefined);
    setUploadingCover(true);
    try {
      setCoverImage(await uploadImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingCover(false);
    }
  }

  async function onPickBodyImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor) return;
    setError(undefined);
    try {
      const url = await uploadImage(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  async function save(nextStatus?: Status) {
    if (!editor) return;
    const finalStatus = nextStatus ?? status;
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(undefined);
    const input = { title, excerpt, coverImage, body: editor.getHTML(), status: finalStatus };
    try {
      const res = article ? await updateArticle(article.id, input) : await createArticle(input);
      if (!res.ok) {
        setSaving(false);
        setError(res.error);
        return;
      }
    } catch (err) {
      // Backstop: a server action that throws (e.g. misconfigured server) would
      // otherwise leave the button stuck on "Saving…" with no message.
      setSaving(false);
      setError(err instanceof Error ? err.message : "Something went wrong saving the article.");
      return;
    }
    setStatus(finalStatus);
    router.push("/admin/news");
    router.refresh();
  }

  const tool = (active: boolean) => `rte-tool${active ? " active" : ""}`;

  return (
    <div className="article-editor">
      <Field
        label="Title"
        name="title"
        value={title}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
        placeholder="Headline of the article"
      />

      <div className="field">
        <label className="field-label" htmlFor="excerpt">
          Excerpt <span className="field-hint">(shown on cards)</span>
        </label>
        <textarea
          id="excerpt"
          className="field-input"
          rows={2}
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          placeholder="One or two sentences summarizing the story."
        />
      </div>

      <div className="field">
        <label className="field-label">Cover image</label>
        {coverImage ? (
          <div className="cover-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverImage} alt="Cover preview" />
            <button type="button" className="ul-sm-btn danger" onClick={() => setCoverImage("")}>
              Remove
            </button>
          </div>
        ) : null}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onPickCover}
        />
        <button
          type="button"
          className="nm-btn"
          onClick={() => coverInputRef.current?.click()}
          disabled={uploadingCover}
        >
          {uploadingCover ? "Uploading…" : coverImage ? "Replace cover" : "Upload cover"}
        </button>
      </div>

      <div className="field">
        <label className="field-label">Body</label>
        <div className="rte">
          <div className="rte-toolbar">
            <button type="button" className={tool(!!editor?.isActive("bold"))} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold"><b>B</b></button>
            <button type="button" className={tool(!!editor?.isActive("italic"))} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic"><i>I</i></button>
            <button type="button" className={tool(!!editor?.isActive("heading", { level: 2 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading">H2</button>
            <button type="button" className={tool(!!editor?.isActive("heading", { level: 3 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="Subheading">H3</button>
            <button type="button" className={tool(!!editor?.isActive("bulletList"))} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet list">• List</button>
            <button type="button" className={tool(!!editor?.isActive("orderedList"))} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered list">1. List</button>
            <button type="button" className={tool(!!editor?.isActive("blockquote"))} onClick={() => editor?.chain().focus().toggleBlockquote().run()} title="Quote">&ldquo;</button>
            <button type="button" className={tool(!!editor?.isActive("link"))} onClick={setLink} title="Link">Link</button>
            <button type="button" className={tool(false)} onClick={() => bodyImgInputRef.current?.click()} title="Insert image">Image</button>
          </div>
          <input ref={bodyImgInputRef} type="file" accept="image/*" hidden onChange={onPickBodyImage} />
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="field">
        <label className="field-label">Status</label>
        <div className="seg" role="group" aria-label="Status">
          <button type="button" className={status === "draft" ? "active" : ""} onClick={() => setStatus("draft")}>
            Draft
          </button>
          <button type="button" className={status === "published" ? "active" : ""} onClick={() => setStatus("published")}>
            Published
          </button>
        </div>
      </div>

      {error ? <div className="auth-banner error">{error}</div> : null}

      <div className="editor-actions">
        <button type="button" className="account-btn" disabled={saving} onClick={() => save()}>
          {saving ? "Saving…" : "Save"}
        </button>
        {status === "draft" ? (
          <button type="button" className="nm-btn" disabled={saving} onClick={() => save("published")}>
            Save &amp; publish
          </button>
        ) : null}
        <button type="button" className="nm-btn" disabled={saving} onClick={() => router.push("/admin/news")}>
          Cancel
        </button>
      </div>
    </div>
  );
}
