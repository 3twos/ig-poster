import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { buildBlobPath, isBlobEnabled } from "@/lib/blob-store";

export const runtime = "nodejs";

const ALLOWED_FOLDERS = new Set(["assets", "videos", "logos", "renders"]);

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export async function POST(req: Request) {
  try {
    if (!isBlobEnabled()) {
      return NextResponse.json(
        { error: "Blob storage is not configured (BLOB_READ_WRITE_TOKEN missing)." },
        { status: 503 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const rawFolder = String(formData.get("folder") ?? "assets");
    const folder = ALLOWED_FOLDERS.has(rawFolder) ? rawFolder : "assets";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file in form-data." }, { status: 400 });
    }

    if (file.size > 120 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Max 120MB." }, { status: 413 });
    }

    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: `File type "${contentType}" is not allowed. Upload images or videos only.` },
        { status: 400 },
      );
    }

    const pathname = buildBlobPath(folder, file.name);
    const blob = await put(pathname, file, {
      access: "public",
      contentType,
    });

    return NextResponse.json({
      id: pathname,
      name: file.name,
      url: blob.url,
      pathname: blob.pathname,
      size: file.size,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to upload file",
        detail: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
  }
}
