import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { apiErrorResponse, safeErrorDetail } from "@/lib/api-error";
import { isBlobEnabled, putJson } from "@/lib/blob-store";
import type { MetaDestination } from "@/lib/meta-accounts";
import {
  getMetaMetadataValidationIssues,
  MetaScheduleRequestSchema,
  publishFacebookPageContent,
} from "@/lib/meta";
import {
  BrowserPublishTargetSchema,
  expandBrowserPublishTarget,
  type BrowserPublishTarget,
} from "@/lib/meta-publish-target";
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
import { hashEmail } from "@/lib/server-utils";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";
import { resolveMetaAuthForRequest } from "@/services/meta-auth";
import {
  syncPublishedInstagramDestination,
  upsertPostDestinationRemoteState,
} from "@/services/post-destinations";
import { executeImmediatePublish } from "@/services/publish-executor";

class MetaScheduleClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaScheduleClientError";
  }
}

export const runtime = "nodejs";

const BrowserMetaScheduleRequestSchema = MetaScheduleRequestSchema.extend({
  target: BrowserPublishTargetSchema.optional(),
}).transform((value) => ({
  ...value,
  target: value.target ?? value.destination,
}));

type BrowserMetaScheduleRequest = z.output<typeof BrowserMetaScheduleRequestSchema>;
type SingleDestinationScheduleRequest = Omit<
  BrowserMetaScheduleRequest,
  "target"
> & {
  destination: MetaDestination;
};
type DestinationPublishResult = {
  status: "scheduled" | "published";
  destination: MetaDestination;
  id?: string;
  mode?: string;
  publishId?: string;
  creationId?: string;
  children?: string[];
  publishAt?: string;
  firstCommentStatus?: "posted" | "failed";
  firstCommentWarning?: string;
};
type DestinationPublishFailure = {
  destination: MetaDestination;
  error: unknown;
};

const getDestinationCapability = (
  destination: MetaDestination,
  resolvedAuth: Awaited<ReturnType<typeof resolveMetaAuthForRequest>>,
) => {
  const capability = resolvedAuth.account.capabilities?.[destination];
  if (!capability?.publishEnabled) {
    throw new MetaScheduleClientError(
      destination === "facebook"
        ? "The connected Meta publishing pair does not include a Facebook Page."
        : "The connected Meta publishing pair does not include an Instagram professional account.",
    );
  }

  return capability;
};

const buildDestinationPayload = (
  payload: BrowserMetaScheduleRequest,
  destination: MetaDestination,
): SingleDestinationScheduleRequest => ({
  ...payload,
  destination,
  firstComment: destination === "instagram" ? payload.firstComment : undefined,
  locationId: destination === "instagram" ? payload.locationId : undefined,
  userTags: destination === "instagram" ? payload.userTags : undefined,
});

const assertRequestedPayloadSupported = (
  payload: BrowserMetaScheduleRequest,
) => {
  const destinations = expandBrowserPublishTarget(payload.target);
  for (const destination of destinations) {
    const destinationPayload = buildDestinationPayload(payload, destination);
    const metadataIssues = getMetaMetadataValidationIssues({
      destination,
      media: destinationPayload.media,
      firstComment: destinationPayload.firstComment,
      locationId: destinationPayload.locationId,
      userTags: destinationPayload.userTags,
    });
    if (metadataIssues.length > 0) {
      throw new MetaScheduleClientError(
        metadataIssues[0]?.message ??
          "Publish metadata is not valid for this destination.",
      );
    }
  }
};

const isClientFacingError = (error: unknown) =>
  error instanceof z.ZodError ||
  error instanceof MetaScheduleClientError ||
  error instanceof MetaMediaPreflightError;

const formatDestinationError = (
  destination: MetaDestination,
  error: unknown,
) => {
  const detail = isClientFacingError(error)
    ? error instanceof Error
      ? error.message
      : "Could not publish to this destination."
    : safeErrorDetail(
        error,
        destination === "facebook"
          ? "Could not publish to Facebook."
          : "Could not publish to Instagram.",
      );
  return {
    destination,
    error: detail,
  };
};

const recordPublishOutcome = async (
  ownerHash: string,
  payload: SingleDestinationScheduleRequest,
  publishId?: string,
) => {
  if (!isBlobEnabled() || !payload.outcomeContext || !publishId) {
    return;
  }

  try {
    const outcomeId = randomUUID().replace(/-/g, "").slice(0, 18);
    const publishedAt = new Date().toISOString();
    await putJson(`outcomes/${ownerHash}/${Date.now()}-${outcomeId}.json`, {
      id: outcomeId,
      publishedAt,
      publishId,
      postType: payload.outcomeContext.postType,
      caption: payload.outcomeContext.caption,
      hook: payload.outcomeContext.hook,
      hashtags: payload.outcomeContext.hashtags,
      variantName: payload.outcomeContext.variantName,
      brandName: payload.outcomeContext.brandName,
      score: payload.outcomeContext.score,
    });
  } catch {
    // Outcome recording is non-critical.
  }
};

const executeSingleDestinationPublish = async (input: {
  db: ReturnType<typeof getDb>;
  ownerHash: string;
  payload: SingleDestinationScheduleRequest;
  resolvedAuth: Awaited<ReturnType<typeof resolveMetaAuthForRequest>>;
  destinationCapability: ReturnType<typeof getDestinationCapability>;
}) : Promise<DestinationPublishResult> => {
  const { db, ownerHash, payload, resolvedAuth, destinationCapability } = input;
  const now = Date.now();
  const publishAt = payload.publishAt
    ? new Date(payload.publishAt).getTime()
    : undefined;
  const shouldSchedule = Boolean(publishAt && publishAt - now > 2 * 60 * 1000);

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
        throw new Error(
          `Facebook schedule was created in Meta as ${publish.publishId ?? publish.creationId ?? "an unknown object"}, but the local shadow job could not be updated.`,
        );
      }

      if (payload.postId) {
        await markPostScheduled(db, ownerHash, payload.postId).catch(() => undefined);
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

      return {
        status: "scheduled",
        destination: payload.destination,
        id: syncedJob.id,
        publishId: publish.publishId,
        creationId: publish.creationId,
        publishAt: syncedJob.publishAt.toISOString(),
      };
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

    return {
      status: "scheduled",
      destination: payload.destination,
      id: job.id,
      publishAt: job.publishAt.toISOString(),
    };
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
        {
          remotePermalink: publish.remotePermalink,
          publishedAt: publish.publishedAt,
        },
      );
    } catch {
      // Preserve successful publish response even if post snapshot update fails.
    }

    if (payload.destination === "instagram") {
      try {
        await syncPublishedInstagramDestination(db, {
          postId: payload.postId,
          caption: payload.caption,
          firstComment: payload.firstComment,
          locationId: payload.locationId,
          userTags: payload.userTags,
          remoteObjectId: publish.publishId ?? null,
          remoteContainerId: publish.creationId ?? null,
          remotePermalink: publish.remotePermalink ?? null,
          publishedAt: publish.publishedAt,
        });
      } catch {
        // Preserve successful publish response even if destination sync fails.
      }
    }
  }

  await recordPublishOutcome(ownerHash, payload, publish.publishId);

  return {
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
  };
};

const buildSuccessResponse = (
  target: BrowserPublishTarget,
  results: DestinationPublishResult[],
) => {
  if (target !== "both") {
    const result = results[0]!;
    return {
      ...result,
      target,
      results,
    };
  }

  return {
    status:
      results.every((result) => result.status === "scheduled")
        ? "scheduled"
        : results.every((result) => result.status === "published")
          ? "published"
          : "partial",
    target,
    results,
  };
};

const buildPartialResponse = (
  target: BrowserPublishTarget,
  results: DestinationPublishResult[],
  failures: DestinationPublishFailure[],
) => ({
  status: "partial" as const,
  target,
  results,
  errors: failures.map((failure) =>
    formatDestinationError(failure.destination, failure.error)
  ),
});

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
    const payload = BrowserMetaScheduleRequestSchema.parse(await req.json());
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
    assertRequestedPayloadSupported(payload);
    await preflightMetaMediaForPublish(payload.media);
    const requestedDestinations = expandBrowserPublishTarget(payload.target);
    const capabilities = new Map(
      requestedDestinations.map((destination) => [
        destination,
        getDestinationCapability(destination, resolvedAuth),
      ]),
    );

    const results: DestinationPublishResult[] = [];
    const failures: DestinationPublishFailure[] = [];

    for (const destination of requestedDestinations) {
      try {
        results.push(
          await executeSingleDestinationPublish({
            db,
            ownerHash,
            payload: buildDestinationPayload(payload, destination),
            resolvedAuth,
            destinationCapability: capabilities.get(destination)!,
          }),
        );
      } catch (error) {
        failures.push({ destination, error });
      }
    }

    if (results.length === 0) {
      const messages = failures.map((failure) =>
        formatDestinationError(failure.destination, failure.error).error
      );
      const message = messages.join(" ");
      if (failures.every((failure) => isClientFacingError(failure.error))) {
        throw new MetaScheduleClientError(message || "Could not publish to Meta");
      }
      throw new Error(message || "Could not publish to Meta");
    }

    if (failures.length > 0) {
      return NextResponse.json(buildPartialResponse(payload.target, results, failures));
    }

    return NextResponse.json(buildSuccessResponse(payload.target, results));
  } catch (error) {
    const isClientError = isClientFacingError(error);
    return apiErrorResponse(error, {
      fallback: "Could not publish to Meta",
      status: isClientError ? 400 : 502,
    });
  }
}
