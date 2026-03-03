import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteBlob, isBlobEnabled, listBlobs } from "@/lib/blob-store";
import { publishToInstagramNow } from "@/lib/meta";

export const runtime = "nodejs";

const ScheduledJobSchema = z.object({
  id: z.string(),
  imageUrl: z.string().url(),
  caption: z.string().min(1).max(2200),
  publishAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export async function GET(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authorization = req.headers.get("authorization");
      if (authorization !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    if (!isBlobEnabled()) {
      return NextResponse.json(
        { error: "Scheduling requires Blob storage (BLOB_READ_WRITE_TOKEN)." },
        { status: 503 },
      );
    }

    const blobs = await listBlobs("schedules/", 100);
    const now = Date.now();

    let published = 0;
    const errors: Array<{ id: string; detail: string }> = [];

    for (const blob of blobs) {
      const response = await fetch(blob.url, { cache: "no-store" });
      if (!response.ok) {
        continue;
      }

      const parsed = ScheduledJobSchema.safeParse(await response.json());
      if (!parsed.success) {
        continue;
      }

      const publishAtMs = new Date(parsed.data.publishAt).getTime();
      if (publishAtMs > now) {
        continue;
      }

      try {
        await publishToInstagramNow({
          imageUrl: parsed.data.imageUrl,
          caption: parsed.data.caption,
        });
        await deleteBlob(blob.url);
        published += 1;
      } catch (error) {
        errors.push({
          id: parsed.data.id,
          detail: error instanceof Error ? error.message : "Unknown publish failure",
        });
      }
    }

    return NextResponse.json({
      scanned: blobs.length,
      published,
      errors,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Cron publish failed",
        detail: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
  }
}
