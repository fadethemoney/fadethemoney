import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024; // 4MB — comfortably under the serverless body limit
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Admin-only image upload for article cover images + inline editor images.
 * Stores in Vercel Blob (public) and returns the URL. Re-checks the caller's
 * role here — this is the real authorization boundary, not the UI.
 */
export async function POST(req: Request) {
  const me = await getProfile();
  if (!me || (me.role !== "admin" && me.role !== "super_admin")) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Image storage isn't configured (BLOB_READ_WRITE_TOKEN)." },
      { status: 500 },
    );
  }

  let file: FormDataEntryValue | null;
  try {
    const form = await req.formData();
    file = form.get("file");
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported image type (use JPG, PNG, WEBP or GIF)." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (max 4MB)." }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const key = `articles/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    const blob = await put(key, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.type,
    });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    console.error("[upload] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
