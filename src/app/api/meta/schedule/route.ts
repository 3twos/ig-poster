import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { isBlobEnabled, putJson } from "@/lib/blob-store";
import { resolveMetaAuthFromRequest } from "@/lib/meta-auth";
import { MetaScheduleRequestSchema, publishToInstagramNow } from "@/lib/meta";

export const runtime = "nodejs";

const ScheduledJobSchema = z.object({
  id: z.string(),
  imageUrl: z.string().url(),
  caption: z.string().min(1).max(2200),
  publishAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  authSource: z.enum(["oauth", "env"]),
  connectionId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const payload = MetaScheduleRequestSchema.parse(await req.json());
    const resolvedAuth = await resolveMetaAuthFromRequest(req);
    const now = Date.now();
    const publishAt = payload.publishAt ? new Date(payload.publishAt).getTime() : undefined;

    const shouldSchedule = Boolean(publishAt && publishAt - now > 2 * 60 * 1000);

    if (shouldSchedule && publishAt) {
      if (!isBlobEnabled()) {
        return NextResponse.json(
          { error: "Scheduling requires Blob storage (BLOB_READ_WRITE_TOKEN)." },
          { status: 503 },
        );
      }

      if (resolvedAuth.source === "oauth" && !resolvedAuth.account.connectionId) {
        return NextResponse.json(
          { error: "OAuth connection is missing a persistent connection id." },
          { status: 400 },
        );
      }

      const id = randomUUID().replace(/-/g, "").slice(0, 18);
      const job = ScheduledJobSchema.parse({
        id,
        imageUrl: payload.imageUrl,
        caption: payload.caption,
        publishAt: new Date(publishAt).toISOString(),
        createdAt: new Date().toISOString(),
        authSource: resolvedAuth.source,
        connectionId: resolvedAuth.account.connectionId,
      });

      await putJson(`schedules/${publishAt}-${id}.json`, job);

      return NextResponse.json({
        status: "scheduled",
        id,
        publishAt: job.publishAt,
      });
    }

    const publish = await publishToInstagramNow({
      imageUrl: payload.imageUrl,
      caption: payload.caption,
    }, resolvedAuth.auth);

    return NextResponse.json({
      status: "published",
      publishId: publish.publishId,
      creationId: publish.creationId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not publish to Instagram",
        detail: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 400 },
    );
  }
}
