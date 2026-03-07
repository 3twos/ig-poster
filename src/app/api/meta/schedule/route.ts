import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { apiErrorResponse } from "@/lib/api-error";
import { isBlobEnabled, putJson } from "@/lib/blob-store";
import { resolveMetaAuthFromRequest } from "@/lib/meta-auth";
import { MetaScheduleRequestSchema, publishInstagramContent } from "@/lib/meta";
import { createPublishJob, markPostPublished } from "@/lib/publish-jobs";
import { hashEmail } from "@/lib/server-utils";
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
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { error: "Workspace authentication required for publish scheduling." },
        { status: 401 },
      );
    }

    const ownerHash = hashEmail(session.email);
    const payload = MetaScheduleRequestSchema.parse(await req.json());
    const db = getDb();
    if (payload.postId) {
      const [linkedPost] = await db
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.id, payload.postId), eq(posts.ownerHash, ownerHash)))
        .limit(1);
      if (!linkedPost) {
        throw new MetaScheduleClientError(
          "Selected post could not be found in this workspace.",
        );
      }
    }

    const resolvedAuth = await resolveMetaAuthFromRequest(req);
    const now = Date.now();
    const publishAt = payload.publishAt ? new Date(payload.publishAt).getTime() : undefined;

    const shouldSchedule = Boolean(publishAt && publishAt - now > 2 * 60 * 1000);

    if (shouldSchedule && publishAt) {
      if (resolvedAuth.source === "oauth" && !resolvedAuth.account.connectionId) {
        throw new MetaScheduleClientError(
          "OAuth scheduling requires private persistent credential storage. Configure POSTGRES_URL or DATABASE_URL and reconnect Meta OAuth.",
        );
      }

      const job = await createPublishJob(db, {
        ownerHash,
        postId: payload.postId,
        caption: payload.caption,
        media: payload.media,
        publishAt: new Date(publishAt).toISOString(),
        authSource: resolvedAuth.source,
        connectionId: resolvedAuth.account.connectionId,
        outcomeContext: payload.outcomeContext,
      });

      return NextResponse.json({
        status: "scheduled",
        id: job.id,
        publishAt: job.publishAt.toISOString(),
      });
    }

    const publish = await publishInstagramContent(
      {
        ...payload.media,
        caption: payload.caption,
      },
      resolvedAuth.auth,
    );

    if (payload.postId) {
      await markPostPublished(db, ownerHash, payload.postId, publish.publishId);
    }

    // Record publish outcome (best-effort)
    if (isBlobEnabled() && payload.outcomeContext && publish.publishId) {
      try {
        const outcomeId = randomUUID().replace(/-/g, "").slice(0, 18);
        const publishedAt = new Date().toISOString();
        await putJson(`outcomes/${ownerHash}/${Date.now()}-${outcomeId}.json`, {
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
