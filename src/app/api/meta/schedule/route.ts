import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { apiErrorResponse } from "@/lib/api-error";
import { isBlobEnabled, putJson } from "@/lib/blob-store";
import {
  getMetaMetadataValidationIssues,
  MetaScheduleRequestSchema,
  publishFacebookPageContent,
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
import { resolveMetaAuthForRequest } from "@/services/meta-auth";
import { upsertPostDestinationRemoteState } from "@/services/post-destinations";
import { executeImmediatePublish } from "@/services/publish-executor";

class MetaScheduleClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaScheduleClientError";
  }
}

export const runtime = "nodejs";

const getDestinationCapability = (
  payload: z.infer<typeof MetaScheduleRequestSchema>,
  resolvedAuth: Awaited<ReturnType<typeof resolveMetaAuthForRequest>>,
) => {
  const capability = resolvedAuth.account.capabilities?.[payload.destination];
  if (!capability?.publishEnabled) {
    throw new MetaScheduleClientError(
      payload.destination === "facebook"
        ? "The connected Meta publishing pair does not include a Facebook Page."
        : "The connected Meta publishing pair does not include an Instagram professional account.",
    );
  }

  return capability;
};

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

    const resolvedAuth = await resolveMetaAuthForRequest(req, { ownerHash });
    const metadataIssues = getMetaMetadataValidationIssues({
      destination: payload.destination,
      media: payload.media,
      firstComment: payload.firstComment,
      locationId: payload.locationId,
      userTags: payload.userTags,
    });
    if (metadataIssues.length > 0) {
      throw new MetaScheduleClientError(
        metadataIssues[0]?.message ??
          "Publish metadata is not valid for this destination.",
      );
    }
    const destinationCapability = getDestinationCapability(payload, resolvedAuth);
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

      if (
        payload.destination === "facebook" &&
        destinationCapability.syncMode === "remote_authoritative"
      ) {
        const publish = await publishFacebookPageContent(
          {
            ...payload.media,
            caption: payload.caption,
            publishAt: new Date(publishAt).toISOString(),
          },
          resolvedAuth.auth,
        );

        const job = await createPublishJob(db, {
          ownerHash,
          postId: payload.postId,
          destination: payload.destination,
          remoteAuthority: destinationCapability.syncMode,
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
          publishId: publish.publishId,
          creationId: publish.creationId,
          children: "children" in publish ? publish.children : undefined,
        });

        if (payload.postId) {
          await upsertPostDestinationRemoteState(db, {
            postId: payload.postId,
            destination: "facebook",
            enabled: true,
            syncMode: destinationCapability.syncMode,
            desiredState: "scheduled",
            remoteState: "scheduled",
            caption: payload.caption,
            publishAt: job.publishAt,
            remoteObjectId: publish.publishId ?? publish.creationId ?? null,
            remoteContainerId: publish.creationId ?? null,
            remoteStatePayload: {
              scheduledPublishTime: job.publishAt.toISOString(),
            },
            lastSyncedAt: new Date(),
            lastError: null,
          });
        }

        return NextResponse.json({
          status: "scheduled",
          destination: payload.destination,
          id: job.id,
          publishId: publish.publishId,
          creationId: publish.creationId,
          publishAt: job.publishAt.toISOString(),
        });
      }

      const job = await createPublishJob(db, {
        ownerHash,
        postId: payload.postId,
        destination: payload.destination,
        remoteAuthority: destinationCapability.syncMode,
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
        destination: payload.destination,
        id: job.id,
        publishAt: job.publishAt.toISOString(),
      });
    }

    const reservedJob = await reserveImmediatePublishJob(db, {
      ownerHash,
      postId: payload.postId,
      destination: payload.destination,
      remoteAuthority: destinationCapability.syncMode,
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
        payload.destination === "instagram"
          ? "Instagram publishing limit reached (50 posts in the last 24 hours). Try again once the rolling window advances."
          : "Could not reserve an immediate Facebook publish slot. Try again.",
      );
    }

    let publish: Awaited<ReturnType<typeof executeImmediatePublish>>["publish"];
    let firstCommentWarning: string | undefined;
    try {
      ({ publish, firstCommentWarning } = await executeImmediatePublish(
        {
          destination: payload.destination,
          media: payload.media,
          caption: payload.caption,
          firstComment: payload.firstComment,
          locationId: payload.locationId,
          userTags: payload.userTags,
        },
        resolvedAuth.auth,
      ));
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
        await markPostPublished(
          db,
          ownerHash,
          payload.postId,
          publish.publishId,
          payload.destination,
        );
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
      destination: payload.destination,
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
      fallback: "Could not publish to Meta",
      status: isClientError ? 400 : 502,
    });
  }
}
