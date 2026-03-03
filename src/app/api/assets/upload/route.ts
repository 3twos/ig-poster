import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { buildBlobPath, isBlobEnabled } from "@/lib/blob-store";

export const runtime = "nodejs";

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
    const folder = String(formData.get("folder") ?? "assets");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file in form-data." }, { status: 400 });
    }

    if (file.size > 120 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Max 120MB." }, { status: 413 });
    }

    const pathname = buildBlobPath(folder, file.name);
    const blob = await put(pathname, file, {
      access: "public",
      contentType: file.type || "application/octet-stream",
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
