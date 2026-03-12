import { z } from "zod";

import type { PublishJobRow } from "@/db/schema";
import {
  MetaDestinationSchema,
  MetaScheduleRequestSchema,
  MetaSyncModeSchema,
  PublishJobEventSchema,
  PublishJobStatusSchema,
} from "@/lib/meta-schemas";

export const PublishJobResourceSchema = z.object({
  id: z.string().min(1),
  postId: z.string().nullable(),
  destination: MetaDestinationSchema,
  remoteAuthority: MetaSyncModeSchema,
  status: PublishJobStatusSchema,
  caption: z.string(),
  firstComment: z.string().nullable(),
  locationId: z.string().nullable(),
  userTags: z.array(z.unknown()).nullable(),
  media: MetaScheduleRequestSchema.shape.media,
  publishAt: z.string().datetime(),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  lastAttemptAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  authSource: z.enum(["oauth", "env"]),
  connectionId: z.string().nullable(),
  outcomeContext: z.unknown().nullable(),
  publishId: z.string().nullable(),
  creationId: z.string().nullable(),
  children: z.array(z.string()).nullable(),
  completedAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
  events: z.array(PublishJobEventSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const PublishJobsListDataSchema = z.object({
  jobs: z.array(PublishJobResourceSchema),
});

export const PublishJobDataSchema = z.object({
  job: PublishJobResourceSchema,
});

export { PublishJobStatusSchema };

export const toPublishJobResource = (row: PublishJobRow) => ({
  id: row.id,
  postId: row.postId ?? null,
  destination: row.destination,
  remoteAuthority: row.remoteAuthority,
  status: row.status,
  caption: row.caption,
  firstComment: row.firstComment ?? null,
  locationId: row.locationId ?? null,
  userTags: row.userTags ?? null,
  media: row.media,
  publishAt: row.publishAt.toISOString(),
  attempts: row.attempts,
  maxAttempts: row.maxAttempts,
  lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
  lastError: row.lastError ?? null,
  authSource: row.authSource === "env" ? "env" : "oauth",
  connectionId: row.connectionId ?? null,
  outcomeContext: row.outcomeContext ?? null,
  publishId: row.publishId ?? null,
  creationId: row.creationId ?? null,
  children: row.children ?? null,
  completedAt: row.completedAt?.toISOString() ?? null,
  canceledAt: row.canceledAt?.toISOString() ?? null,
  events: row.events ?? [],
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
