import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api-error";
import { isBlobEnabled, putJson } from "@/lib/blob-store";
import { resolveMetaAuthFromRequest } from "@/lib/meta-auth";
import { MetaScheduleRequestSchema, publishInstagramContent } from "@/lib/meta";
import { ScheduledJobSchema } from "@/lib/meta-schemas";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

class MetaScheduleClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaScheduleClientError";
  }
}

export const runtime = "nodejs";

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
        throw new MetaScheduleClientError(
          "OAuth scheduling requires private persistent credential storage. Configure POSTGRES_URL or DATABASE_URL and reconnect Meta OAuth.",
        );
      }

      const id = randomUUID().replace(/-/g, "").slice(0, 18);
      const job = ScheduledJobSchema.parse({
        id,
        caption: payload.caption,
        media: payload.media,
        publishAt: new Date(publishAt).toISOString(),
        createdAt: new Date().toISOString(),
        authSource: resolvedAuth.source,
        connectionId: resolvedAuth.account.connectionId,
        outcomeContext: payload.outcomeContext,
      });

      await putJson(`schedules/${publishAt}-${id}.json`, job);

      return NextResponse.json({
        status: "scheduled",
        id,
        publishAt: job.publishAt,
      });
    }

    const publish = await publishInstagramContent(
      {
        ...payload.media,
        caption: payload.caption,
      },
      resolvedAuth.auth,
    );

    // Record publish outcome (best-effort)
    if (isBlobEnabled() && payload.outcomeContext && publish.publishId) {
      try {
        const session = await readWorkspaceSessionFromRequest(req);
        if (!session) throw new Error("No session for outcome recording");
        const emailHash = createHash("sha256")
          .update(session.email.trim().toLowerCase())
          .digest("hex");
        const outcomeId = randomUUID().replace(/-/g, "").slice(0, 18);
        const publishedAt = new Date().toISOString();
        await putJson(`outcomes/${emailHash}/${Date.now()}-${outcomeId}.json`, {
          id: outcomeId,
          publishedAt,
          publishId: publish.publishId,
          postType: payload.outcomeContext.postType,
          caption: payload.outcomeContext.caption,
          hook: payload.outcomeContext.hook,
          hashtags: payload.outcomeContext.hashtags,
          variantName: payload.outcomeContext.variantName,
          brandName: payload.outcomeContext.brandName,
          score: payload.outcomeContext.score,
        });
      } catch {
        // Outcome recording is non-critical
      }
    }

    return NextResponse.json({
      status: "published",
      mode: publish.mode,
      publishId: publish.publishId,
      creationId: publish.creationId,
      children: "children" in publish ? publish.children : undefined,
    });
  } catch (error) {
    const isClientError = error instanceof z.ZodError ||
      (error instanceof MetaScheduleClientError);
    return apiErrorResponse(error, {
      fallback: "Could not publish to Instagram",
      status: isClientError ? 400 : 502,
    });
  }
}
