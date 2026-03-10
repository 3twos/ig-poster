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
import { resolveActorFromRequest } from "@/services/actors";
import {
  MetaAuthServiceError,
  resolveMetaAuthForApi,
} from "@/services/meta-auth";

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
  mode: PublishResource["mode"],
  authSource: PublishResource["authSource"],
  connectionId?: string | null,
) => ({
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
    });
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

      const job = await createPublishJob(db, {
        ownerHash: actor.ownerHash,
        postId: payload.postId,
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
      const detail =
        error instanceof Error ? error.message : "Unknown publish failure";
      try {
        await completePublishJobFailure(db, reservedJob, detail);
      } catch {
        // Preserve the upstream publish failure.
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
          firstCommentWarning =
            error instanceof Error
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
      // Publish already succeeded upstream.
    }

    if (payload.postId) {
      try {
        await markPostPublished(
          db,
          actor.ownerHash,
          payload.postId,
          publish.publishId,
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
    return apiError(500, "INTERNAL_ERROR", "Could not publish to Instagram");
  }
}
