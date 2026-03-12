import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "@/db/schema";
import { posts, publishJobs, type PublishJobRow } from "@/db/schema";
import type { MetaScheduleRequest, PublishJobEvent } from "@/lib/meta-schemas";

export type AppDb = NeonHttpDatabase<typeof schema>;

export const DEFAULT_MAX_ATTEMPTS = 3;
export const PUBLISH_WINDOW_LIMIT = 50;
const PUBLISH_WINDOW_MS = 24 * 60 * 60 * 1000;
export const STALE_PROCESSING_TIMEOUT_MS = 30 * 60 * 1000;
const PUBLISH_WINDOW_STATUSES: PublishJobRow["status"][] = [
  "published",
  "processing",
];

const buildJobId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 18);

export const appendPublishJobEvent = (
  events: PublishJobEvent[] | null | undefined,
  event: Omit<PublishJobEvent, "at"> & { at?: string },
): PublishJobEvent[] => [
  ...(events ?? []),
  {
    at: event.at ?? new Date().toISOString(),
    type: event.type,
    detail: event.detail,
    attempt: event.attempt,
  },
];

const nextRetryDelayMs = (attempt: number) => {
  const base = 5 * 60 * 1000;
  const max = 60 * 60 * 1000;
  return Math.min(base * Math.pow(2, Math.max(attempt - 1, 0)), max);
};

export const markPostScheduled = async (
  db: AppDb,
  ownerHash: string,
  postId: string,
) => {
  await db
    .update(posts)
    .set({
      status: "scheduled",
      updatedAt: new Date(),
    })
    .where(and(eq(posts.id, postId), eq(posts.ownerHash, ownerHash)));
};

export const markPostPublished = async (
  db: AppDb,
  ownerHash: string,
  postId: string,
  publishId?: string,
) => {
  const [existing] = await db
    .select({
      publishHistory: posts.publishHistory,
    })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.ownerHash, ownerHash)))
    .limit(1);

  if (!existing) return;

  await db
    .update(posts)
    .set({
      status: "posted",
      publishedAt: new Date(),
      updatedAt: new Date(),
      publishHistory: [
        ...(existing.publishHistory ?? []),
        {
          publishedAt: new Date().toISOString(),
          igMediaId: publishId,
        },
      ],
    })
    .where(and(eq(posts.id, postId), eq(posts.ownerHash, ownerHash)));
};

export const createPublishJob = async (
  db: AppDb,
  input: {
    ownerHash: string;
    postId?: string;
    destination?: "facebook" | "instagram";
    remoteAuthority?: "remote_authoritative" | "app_managed";
    accountKey?: string;
    pageId?: string;
    instagramUserId?: string;
    caption: string;
    firstComment?: string;
    locationId?: string;
    userTags?: MetaScheduleRequest["userTags"];
    media: MetaScheduleRequest["media"];
    publishAt: string;
    authSource: "oauth" | "env";
    connectionId?: string;
    outcomeContext?: MetaScheduleRequest["outcomeContext"];
    maxAttempts?: number;
  },
) => {
  const now = new Date();
  const [row] = await db
    .insert(publishJobs)
    .values({
      id: buildJobId(),
      ownerHash: input.ownerHash,
      postId: input.postId,
      destination: input.destination ?? "instagram",
      remoteAuthority: input.remoteAuthority ?? "app_managed",
      accountKey: input.accountKey,
      pageId: input.pageId,
      instagramUserId: input.instagramUserId,
      status: "queued",
      caption: input.caption,
      firstComment: input.firstComment,
      locationId: input.locationId,
      userTags: input.userTags,
      media: input.media,
      publishAt: new Date(input.publishAt),
      attempts: 0,
      maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      authSource: input.authSource,
      connectionId: input.connectionId,
      outcomeContext: input.outcomeContext,
      events: appendPublishJobEvent([], {
        type: "created",
        detail: `Queued for ${new Date(input.publishAt).toISOString()}.`,
      }),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create publish job");
  }

  if (input.postId) {
    await markPostScheduled(db, input.ownerHash, input.postId);
  }

  return row;
};

const countPublishWindowRows = async (
  db: Pick<AppDb, "select">,
  ownerHash: string,
  windowStart: Date,
) => {
  const [usage] = await db
    .select({
      publishedCount: sql<number>`count(*)`,
    })
    .from(publishJobs)
    .where(
      and(
        eq(publishJobs.ownerHash, ownerHash),
        inArray(publishJobs.status, PUBLISH_WINDOW_STATUSES),
        gte(publishJobs.completedAt, windowStart),
      ),
    );

  return Number(usage?.publishedCount ?? 0);
};

export const reserveImmediatePublishJob = async (
  db: AppDb,
  input: {
    ownerHash: string;
    postId?: string;
    destination?: "facebook" | "instagram";
    remoteAuthority?: "remote_authoritative" | "app_managed";
    accountKey?: string;
    pageId?: string;
    instagramUserId?: string;
    caption: string;
    firstComment?: string;
    locationId?: string;
    userTags?: MetaScheduleRequest["userTags"];
    media: MetaScheduleRequest["media"];
    authSource: "oauth" | "env";
    connectionId?: string;
    outcomeContext?: MetaScheduleRequest["outcomeContext"];
    maxAttempts?: number;
  },
): Promise<PublishJobRow | null> => {
  const now = new Date();
  const windowStart = new Date(now.getTime() - PUBLISH_WINDOW_MS);
  const maxAttempts = input.maxAttempts ?? 1;
  const row = await db.transaction(async (tx) => {
    const used = await countPublishWindowRows(tx, input.ownerHash, windowStart);
    if (used >= PUBLISH_WINDOW_LIMIT) {
      return null;
    }

    const [inserted] = await tx
      .insert(publishJobs)
      .values({
        id: buildJobId(),
        ownerHash: input.ownerHash,
        postId: input.postId,
        destination: input.destination ?? "instagram",
        remoteAuthority: input.remoteAuthority ?? "app_managed",
        accountKey: input.accountKey,
        pageId: input.pageId,
        instagramUserId: input.instagramUserId,
        status: "processing",
        caption: input.caption,
        firstComment: input.firstComment,
        locationId: input.locationId,
        userTags: input.userTags,
        media: input.media,
        publishAt: now,
        attempts: 1,
        maxAttempts,
        lastAttemptAt: now,
        authSource: input.authSource,
        connectionId: input.connectionId,
        outcomeContext: input.outcomeContext,
        // Non-null so in-flight immediate reservations are counted in the 24h window.
        completedAt: now,
        events: appendPublishJobEvent(
          appendPublishJobEvent([], {
            type: "created",
            detail: "Immediate publish started.",
          }),
          {
            type: "processing",
            attempt: 1,
            detail: "Immediate publish slot reserved.",
          },
        ),
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return inserted ?? null;
  }, { isolationLevel: "serializable" });

  return row ?? null;
};

export const listPublishJobsForOwner = (
  db: AppDb,
  ownerHash: string,
  options?: {
    statuses?: PublishJobRow["status"][];
    limit?: number;
  },
) => {
  const statuses = options?.statuses;
  const whereClause = statuses?.length
    ? and(eq(publishJobs.ownerHash, ownerHash), inArray(publishJobs.status, statuses))
    : eq(publishJobs.ownerHash, ownerHash);

  return db
    .select()
    .from(publishJobs)
    .where(whereClause)
    .orderBy(asc(publishJobs.publishAt))
    .limit(Math.min(Math.max(options?.limit ?? 100, 1), 250));
};

export const getPublishWindowUsage = async (
  db: AppDb,
  ownerHash: string,
  now = new Date(),
) => {
  const windowStart = new Date(now.getTime() - PUBLISH_WINDOW_MS);
  const used = await countPublishWindowRows(db, ownerHash, windowStart);
  return {
    limit: PUBLISH_WINDOW_LIMIT,
    used,
    remaining: Math.max(PUBLISH_WINDOW_LIMIT - used, 0),
    windowStart,
  };
};

export const claimDuePublishJobs = async (
  db: AppDb,
  now: Date,
  limit = 50,
) => {
  const due = await db
    .select()
    .from(publishJobs)
    .where(
      and(
        eq(publishJobs.status, "queued"),
        lte(publishJobs.publishAt, now),
      ),
    )
    .orderBy(asc(publishJobs.publishAt))
    .limit(limit);

  const claimed: PublishJobRow[] = [];
  for (const job of due) {
    const attempt = job.attempts + 1;
    const [updated] = await db
      .update(publishJobs)
      .set({
        status: "processing",
        attempts: attempt,
        lastAttemptAt: now,
        updatedAt: now,
        events: appendPublishJobEvent(job.events, {
          type: "processing",
          attempt,
          detail: "Attempt started.",
        }),
      })
      .where(and(eq(publishJobs.id, job.id), eq(publishJobs.status, "queued")))
      .returning();

    if (updated) {
      claimed.push(updated);
    }
  }

  return claimed;
};

export const recoverStaleProcessingJobs = async (
  db: AppDb,
  now: Date,
  options?: {
    timeoutMs?: number;
    limit?: number;
  },
) => {
  const timeoutMs = options?.timeoutMs ?? STALE_PROCESSING_TIMEOUT_MS;
  const staleBefore = new Date(now.getTime() - timeoutMs);
  const staleJobs = await db
    .select()
    .from(publishJobs)
    .where(
      and(
        eq(publishJobs.status, "processing"),
        or(
          lte(publishJobs.lastAttemptAt, staleBefore),
          and(isNull(publishJobs.lastAttemptAt), lte(publishJobs.updatedAt, staleBefore)),
        ),
      ),
    )
    .orderBy(asc(publishJobs.updatedAt))
    .limit(Math.min(Math.max(options?.limit ?? 100, 1), 250));

  const detail =
    `Processing attempt exceeded ${Math.round(timeoutMs / 60_000)} minutes and was marked failed to avoid duplicate publish risk. Review before retrying.`;
  const recovered: PublishJobRow[] = [];

  for (const job of staleJobs) {
    const [updated] = await db
      .update(publishJobs)
      .set({
        status: "failed",
        lastError: detail,
        completedAt: now,
        updatedAt: now,
        events: appendPublishJobEvent(job.events, {
          type: "failed",
          attempt: job.attempts || undefined,
          detail,
          at: now.toISOString(),
        }),
      })
      .where(and(eq(publishJobs.id, job.id), eq(publishJobs.status, "processing")))
      .returning();

    if (updated) {
      recovered.push(updated);
    }
  }

  return recovered;
};

export const completePublishJobSuccess = async (
  db: AppDb,
  job: PublishJobRow,
  publish: {
    publishId?: string;
    creationId?: string;
    children?: string[];
    warningDetail?: string;
  },
): Promise<PublishJobRow | null> => {
  const now = new Date();
  const publishDetail = publish.publishId
    ? `Published as ${publish.publishId}.`
    : "Published successfully.";
  const detail = publish.warningDetail
    ? `${publishDetail} Warning: ${publish.warningDetail}`
    : publishDetail;
  const [updated] = await db
    .update(publishJobs)
    .set({
      status: "published",
      publishId: publish.publishId,
      creationId: publish.creationId,
      children: publish.children,
      lastError: null,
      completedAt: now,
      updatedAt: now,
      events: appendPublishJobEvent(job.events, {
        type: "published",
        attempt: job.attempts,
        detail,
      }),
    })
    .where(and(eq(publishJobs.id, job.id), eq(publishJobs.status, "processing")))
    .returning();

  return updated ?? null;
};

export const deferProcessingPublishJob = async (
  db: AppDb,
  job: PublishJobRow,
  nextPublishAt: Date,
  detail: string,
): Promise<PublishJobRow | null> => {
  const now = new Date();
  const restoredAttempts = Math.max(job.attempts - 1, 0);
  const [updated] = await db
    .update(publishJobs)
    .set({
      status: "queued",
      publishAt: nextPublishAt,
      attempts: restoredAttempts,
      lastAttemptAt: null,
      lastError: null,
      completedAt: null,
      updatedAt: now,
      events: appendPublishJobEvent(job.events, {
        type: "retry-scheduled",
        attempt: restoredAttempts || undefined,
        detail: `${detail} Next retry at ${nextPublishAt.toISOString()}.`,
      }),
    })
    .where(and(eq(publishJobs.id, job.id), eq(publishJobs.status, "processing")))
    .returning();

  return updated ?? null;
};

export const completePublishJobFailure = async (
  db: AppDb,
  job: PublishJobRow,
  errorMessage: string,
): Promise<PublishJobRow | null> => {
  const now = new Date();
  const shouldRetry = job.attempts < job.maxAttempts;
  const retryAt = shouldRetry
    ? new Date(now.getTime() + nextRetryDelayMs(job.attempts))
    : null;

  const [updated] = await db
    .update(publishJobs)
    .set({
      status: shouldRetry ? "queued" : "failed",
      publishAt: retryAt ?? job.publishAt,
      lastError: errorMessage,
      completedAt: shouldRetry ? null : now,
      updatedAt: now,
      events: appendPublishJobEvent(job.events, shouldRetry
        ? {
            type: "retry-scheduled",
            attempt: job.attempts,
            detail: `Attempt failed: ${errorMessage}. Next retry at ${retryAt?.toISOString()}.`,
          }
        : {
            type: "failed",
            attempt: job.attempts,
            detail: `Attempt failed: ${errorMessage}. Max retries reached.`,
          }),
    })
    .where(and(eq(publishJobs.id, job.id), eq(publishJobs.status, "processing")))
    .returning();

  return updated ?? null;
};
