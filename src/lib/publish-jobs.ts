import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "@/db/schema";
import { posts, publishJobs, type PublishJobRow } from "@/db/schema";
import type { MetaScheduleRequest, PublishJobEvent } from "@/lib/meta-schemas";

export type AppDb = NeonHttpDatabase<typeof schema>;

export const DEFAULT_MAX_ATTEMPTS = 3;

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
      status: "published",
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
    caption: string;
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
      status: "queued",
      caption: input.caption,
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

export const completePublishJobSuccess = async (
  db: AppDb,
  job: PublishJobRow,
  publish: { publishId?: string; creationId?: string; children?: string[] },
) => {
  const now = new Date();
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
        detail: publish.publishId
          ? `Published as ${publish.publishId}.`
          : "Published successfully.",
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
) => {
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
