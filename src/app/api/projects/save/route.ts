import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { isBlobEnabled, putJson } from "@/lib/blob-store";
import { SavedProjectPayloadSchema, SavedProjectSchema } from "@/lib/project";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!isBlobEnabled()) {
      return NextResponse.json(
        { error: "Project sharing needs Blob storage. Set BLOB_READ_WRITE_TOKEN." },
        { status: 503 },
      );
    }

    const json = await req.json();
    const payload = SavedProjectPayloadSchema.parse(json);

    const id = randomUUID().replace(/-/g, "").slice(0, 18);
    const project = SavedProjectSchema.parse({
      id,
      createdAt: new Date().toISOString(),
      ...payload,
    });

    const pathname = `projects/${id}.json`;
    await putJson(pathname, project);

    const origin = new URL(req.url).origin;
    return NextResponse.json({
      id,
      shareUrl: `${origin}/share/${id}`,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not save project" },
      { status: 500 },
    );
  }
}
