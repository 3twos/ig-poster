import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { apiError, apiOk, type ApiErrorCode } from "@/lib/api/v1/envelope";
import {
  PublishRequestSchema,
  type PublishResource,
} from "@/lib/api/v1/publish";
import { isBlobEnabled, putJson } from "@/lib/blob-store";
import {
  getMetaMetadataValidationIssues,
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
  failQueuedPublishJob,
  markPostPublished,
  markPostScheduled,
  reserveImmediatePublishJob,
  syncQueuedPublishJobRemoteState,
} from "@/lib/publish-jobs";
import { resolveActorFromRequest } from "@/services/actors";
import {
  MetaAuthServiceError,
  resolveMetaAuthForApi,
} from "@/services/meta-auth";
import { upsertPostDestinationRemoteState } from "@/services/post-destinations";
import { executeImmediatePublish } from "@/services/publish-executor";

class PublishRouteError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PublishRouteError";
    this.status = status;
  }
}

export const runtime = "nodejs";

const errorCodeForStatus = (status: number): ApiErrorCode =>
  status === 400
    ? "INVALID_INPUT"
    : status === 401
      ? "AUTH_REQUIRED"
      : status === 404
        ? "NOT_FOUND"
        : status === 409
          ? "CONFLICT"
          : "INTERNAL_ERROR";

const assertLinkedPost = async (ownerHash: string, postId: string) => {
  const db = getDb();
  const [linkedPost] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.ownerHash, ownerHash)))
    .limit(1);

  if (!linkedPost) {
    throw new PublishRouteError(
      404,
      "Selected post could not be found in this workspace.",
    );
  }
};

const toBaseResource = (
  destination: PublishResource["destination"],
  mode: PublishResource["mode"],
  authSource: PublishResource["authSource"],
  connectionId?: string | null,
) => ({
  destination,
  mode,
  authSource,
  connectionId: connectionId ?? null,
});

export async function POST(req: Request) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return apiError(401, "AUTH_REQUIRED", "Login required");
    }

    const payload = PublishRequestSchema.parse(await req.json());
    if (payload.postId) {
      await assertLinkedPost(actor.ownerHash, payload.postId);
    }

    const resolvedAuth = await resolveMetaAuthForApi({
      connectionId: payload.connectionId,
      ownerHash: actor.ownerHash,
    });
    const metadataIssues = getMetaMetadataValidationIssues({
      destination: payload.destination,
      media: payload.media,
      firstComment: payload.firstComment,
      locationId: payload.locationId,
      userTags: payload.userTags,
    });
    if (metadataIssues.length > 0) {
      throw new PublishRouteError(
        400,
        metadataIssues[0]?.message ??
          "Publish metadata is not valid for this destination.",
      );
    }
    const destinationCapability = resolvedAuth.account.capabilities?.[payload.destination];
    if (!destinationCapability?.publishEnabled) {
      throw new PublishRouteError(
        400,
        payload.destination === "facebook"
          ? "The connected Meta publishing pair does not include a Facebook Page."
          : "The connected Meta publishing pair does not include an Instagram professional account.",
      );
    }
    const publishAt = payload.publishAt
      ? new Date(payload.publishAt).getTime()
      : undefined;
    const now = Date.now();
    const shouldSchedule = Boolean(publishAt && publishAt - now > 2 * 60 * 1000);
    await preflightMetaMediaForPublish(payload.media);

    if (payload.dryRun) {
      return apiOk({
        publish: {
          ...toBaseResource(
            payload.destination,
            payload.media.mode,
            resolvedAuth.source,
            resolvedAuth.account.connectionId,
          ),
          status: "validated",
          scheduled: shouldSchedule,
          publishAt: payload.publishAt ?? null,
        } satisfies PublishResource,
      });
    }

    const db = getDb();

    if (shouldSchedule && publishAt) {
      if (
        resolvedAuth.source === "oauth" &&
        !resolvedAuth.account.connectionId
      ) {
        throw new PublishRouteError(
          400,
          "OAuth scheduling requires private persistent credential storage. Configure POSTGRES_URL or DATABASE_URL and reconnect Meta OAuth.",
        );
      }

      if (
        payload.destination === "facebook" &&
        destinationCapability.syncMode === "remote_authoritative"
      ) {
        const job = await createPublishJob(db, {
          ownerHash: actor.ownerHash,
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
          markPostScheduled: false,
        });

        let publish: Awaited<ReturnType<typeof publishFacebookPageContent>>;
        try {
          publish = await publishFacebookPageContent(
            {
              ...payload.media,
              caption: payload.caption,
              publishAt: new Date(publishAt).toISOString(),
            },
            resolvedAuth.auth,
          );
        } catch (error) {
          const detail = error instanceof Error
            ? error.message
            : "Unknown Facebook scheduling failure";
          await failQueuedPublishJob(db, job, detail).catch(() => undefined);
          if (payload.postId) {
            await upsertPostDestinationRemoteState(db, {
              postId: payload.postId,
              destination: "facebook",
              enabled: true,
              syncMode: destinationCapability.syncMode,
              desiredState: "scheduled",
              remoteState: "failed",
              caption: payload.caption,
              publishAt: job.publishAt,
              remoteStatePayload: {
                scheduledPublishTime: job.publishAt.toISOString(),
              },
              lastSyncedAt: new Date(),
              lastError: detail,
            }).catch(() => undefined);
          }
          throw error;
        }

        const syncedJob = await syncQueuedPublishJobRemoteState(db, job, {
          publishId: publish.publishId,
          creationId: publish.creationId,
          children: "children" in publish ? publish.children : undefined,
        });
        if (!syncedJob) {
          throw new PublishRouteError(
            500,
            `Facebook schedule was created in Meta as ${publish.publishId ?? publish.creationId ?? "an unknown object"}, but the local shadow job could not be updated.`,
          );
        }

        if (payload.postId) {
          await markPostScheduled(db, actor.ownerHash, payload.postId).catch(() => undefined);
          await upsertPostDestinationRemoteState(db, {
            postId: payload.postId,
            destination: "facebook",
            enabled: true,
            syncMode: destinationCapability.syncMode,
            desiredState: "scheduled",
            remoteState: "scheduled",
            caption: payload.caption,
            publishAt: syncedJob.publishAt,
            remoteObjectId: publish.publishId ?? publish.creationId ?? null,
            remoteContainerId: publish.creationId ?? null,
            remoteStatePayload: {
              scheduledPublishTime: syncedJob.publishAt.toISOString(),
            },
            lastSyncedAt: new Date(),
            lastError: null,
          }).catch(() => undefined);
        }

        return apiOk({
          publish: {
            ...toBaseResource(
              payload.destination,
              payload.media.mode,
              resolvedAuth.source,
              resolvedAuth.account.connectionId,
            ),
            status: "scheduled",
            id: syncedJob.id,
            publishId: publish.publishId,
            creationId: publish.creationId,
            publishAt: syncedJob.publishAt.toISOString(),
          } satisfies PublishResource,
        });
      }

      const job = await createPublishJob(db, {
        ownerHash: actor.ownerHash,
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

      return apiOk({
        publish: {
          ...toBaseResource(
            payload.destination,
            payload.media.mode,
            resolvedAuth.source,
            resolvedAuth.account.connectionId,
          ),
          status: "scheduled",
          id: job.id,
          publishAt: job.publishAt.toISOString(),
        } satisfies PublishResource,
      });
    }

    const reservedJob = await reserveImmediatePublishJob(db, {
      ownerHash: actor.ownerHash,
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
      throw new PublishRouteError(
        409,
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
      const detail =
        error instanceof Error ? error.message : "Unknown publish failure";
      try {
        await completePublishJobFailure(db, reservedJob, detail);
      } catch {
        // Preserve the upstream publish failure.
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
      // Publish already succeeded upstream.
    }

    if (payload.postId) {
      try {
        await markPostPublished(
          db,
          actor.ownerHash,
          payload.postId,
          publish.publishId,
          payload.destination,
        );
      } catch {
        // Preserve successful publish response even if post snapshot update fails.
      }
    }

    if (isBlobEnabled() && payload.outcomeContext && publish.publishId) {
      try {
        const outcomeId = crypto.randomUUID().replace(/-/g, "").slice(0, 18);
        const publishedAt = new Date().toISOString();
        await putJson(
          `outcomes/${actor.ownerHash}/${Date.now()}-${outcomeId}.json`,
          {
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
          },
        );
      } catch {
        // Outcome recording is non-critical.
      }
    }

    return apiOk({
      publish: {
        ...toBaseResource(
          payload.destination,
          payload.media.mode,
          resolvedAuth.source,
          resolvedAuth.account.connectionId,
        ),
        status: "published",
        publishAt: null,
        publishId: publish.publishId ?? null,
        creationId: publish.creationId ?? null,
        children: "children" in publish ? publish.children : null,
        firstCommentStatus: payload.firstComment
          ? firstCommentWarning
            ? "failed"
            : "posted"
          : undefined,
        firstCommentWarning,
      } satisfies PublishResource,
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return apiError(400, "INVALID_INPUT", "Invalid publish request");
    }

    if (
      error instanceof PublishRouteError ||
      error instanceof MetaAuthServiceError
    ) {
      return apiError(
        error.status,
        errorCodeForStatus(error.status),
        error.message,
      );
    }

    if (error instanceof MetaMediaPreflightError) {
      return apiError(400, "INVALID_INPUT", error.message);
    }

    console.error("[api/v1/publish]", error);
    return apiError(500, "INTERNAL_ERROR", "Could not publish to Meta");
  }
}
