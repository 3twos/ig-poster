import { NextResponse } from "next/server";

import { isBlobEnabled, readJsonByPath } from "@/lib/blob-store";
import { SavedProjectSchema } from "@/lib/project";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_req: Request, context: RouteContext) {
  try {
    if (!isBlobEnabled()) {
      return NextResponse.json(
        { error: "Project sharing needs Blob storage. Set BLOB_READ_WRITE_TOKEN." },
        { status: 503 },
      );
    }

    const { id } = await context.params;
    const project = await readJsonByPath<unknown>(`projects/${id}.json`);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const parsed = SavedProjectSchema.parse(project);
    return NextResponse.json(parsed, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not load project",
        detail: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 400 },
    );
  }
}
