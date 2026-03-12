import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { apiErrorResponse } from "@/lib/api-error";
import { isBlobEnabled, putJson } from "@/lib/blob-store";
import { resolveMetaAuthFromRequest } from "@/lib/meta-auth";
import {
  MetaScheduleRequestSchema,
  publishInstagramContent,
  publishInstagramFirstComment,
} from "@/lib/meta";
import {
  MetaMediaPreflightError,
  preflightMetaMediaForPublish,
} from "@/lib/meta-media-preflight";
import {
  completePublishJobFailure,
  completePublishJobSuccess,
  createPublishJob,
  markPostPublished,
  reserveImmediatePublishJob,
} from "@/lib/publish-jobs";
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
    await preflightMetaMediaForPublish(payload.media);

    if (shouldSchedule && publishAt) {
      if (resolvedAuth.source === "oauth" && !resolvedAuth.account.connectionId) {
        throw new MetaScheduleClientError(
          "OAuth scheduling requires private persistent credential storage. Configure POSTGRES_URL or DATABASE_URL and reconnect Meta OAuth.",
        );
      }

      const job = await createPublishJob(db, {
        ownerHash,
        postId: payload.postId,
        destination: "instagram",
        remoteAuthority:
          resolvedAuth.account.capabilities?.instagram.syncMode ?? "app_managed",
        accountKey: resolvedAuth.account.accountKey,
        pageId: resolvedAuth.account.pageId,
        instagramUserId: resolvedAuth.account.instagramUserId,
        caption: payload.caption,
        firstComment: payload.firstComment,
        locationId: payload.locationId,
        userTags: payload.userTags,
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

    const reservedJob = await reserveImmediatePublishJob(db, {
      ownerHash,
      postId: payload.postId,
      destination: "instagram",
      remoteAuthority:
        resolvedAuth.account.capabilities?.instagram.syncMode ?? "app_managed",
      accountKey: resolvedAuth.account.accountKey,
      pageId: resolvedAuth.account.pageId,
      instagramUserId: resolvedAuth.account.instagramUserId,
      caption: payload.caption,
      firstComment: payload.firstComment,
      locationId: payload.locationId,
      userTags: payload.userTags,
      media: payload.media,
      authSource: resolvedAuth.source,
      connectionId: resolvedAuth.account.connectionId,
      outcomeContext: payload.outcomeContext,
      maxAttempts: 1,
    });
    if (!reservedJob) {
      throw new MetaScheduleClientError(
        "Instagram publishing limit reached (50 posts in the last 24 hours). Try again once the rolling window advances.",
      );
    }

    let publish: Awaited<ReturnType<typeof publishInstagramContent>>;
    try {
      publish = await publishInstagramContent(
        {
          ...payload.media,
          caption: payload.caption,
          locationId: payload.locationId,
          userTags: payload.userTags,
        },
        resolvedAuth.auth,
      );
    } catch (error) {
      const detail = error instanceof Error
        ? error.message
        : "Unknown publish failure";
      try {
        await completePublishJobFailure(db, reservedJob, detail);
      } catch {
        // Best-effort cleanup; preserve upstream publish error response.
      }
      throw error;
    }

    let firstCommentWarning: string | undefined;
    if (payload.firstComment) {
      if (!publish.publishId) {
        firstCommentWarning =
          "Published media id unavailable; could not post first comment.";
      } else {
        try {
          await publishInstagramFirstComment(
            publish.publishId,
            payload.firstComment,
            resolvedAuth.auth,
          );
        } catch (error) {
          firstCommentWarning = error instanceof Error
            ? error.message
            : "Could not post first comment.";
        }
      }
    }

    try {
      await completePublishJobSuccess(db, reservedJob, {
        publishId: publish.publishId,
        creationId: publish.creationId,
        children: "children" in publish ? publish.children : undefined,
        warningDetail: firstCommentWarning,
      });
    } catch {
      // The publish already succeeded upstream; usage reservation remains in DB.
    }

    if (payload.postId) {
      try {
        await markPostPublished(db, ownerHash, payload.postId, publish.publishId);
      } catch {
        // Preserve successful publish response even if post snapshot update fails.
      }
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
      firstCommentStatus: payload.firstComment
        ? firstCommentWarning
          ? "failed"
          : "posted"
        : undefined,
      firstCommentWarning,
    });
  } catch (error) {
    const isClientError = error instanceof z.ZodError ||
      (error instanceof MetaScheduleClientError) ||
      (error instanceof MetaMediaPreflightError);
    return apiErrorResponse(error, {
      fallback: "Could not publish to Instagram",
      status: isClientError ? 400 : 502,
    });
  }
}
