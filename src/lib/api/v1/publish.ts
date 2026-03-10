import { z } from "zod";

import { MetaScheduleRequestSchema } from "@/lib/meta";

const ConnectionIdSchema = z.string().trim().min(1).max(64);

export const PublishRequestSchema = MetaScheduleRequestSchema.extend({
  connectionId: ConnectionIdSchema.optional(),
  dryRun: z.boolean().optional().default(false),
});

export const PublishLocationQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  connectionId: ConnectionIdSchema.optional(),
});

const PublishStatusSchema = z.enum(["validated", "scheduled", "published"]);
const PublishModeSchema = z.enum(["image", "reel", "carousel"]);
const PublishAuthSourceSchema = z.enum(["oauth", "env"]);

export const PublishResourceSchema = z.object({
  status: PublishStatusSchema,
  mode: PublishModeSchema,
  authSource: PublishAuthSourceSchema,
  connectionId: z.string().nullable().optional(),
  publishAt: z.string().datetime().nullable().optional(),
  scheduled: z.boolean().optional(),
  id: z.string().optional(),
  publishId: z.string().nullable().optional(),
  creationId: z.string().nullable().optional(),
  children: z.array(z.string()).nullable().optional(),
  firstCommentStatus: z.enum(["posted", "failed"]).optional(),
  firstCommentWarning: z.string().optional(),
});

export type PublishRequest = z.infer<typeof PublishRequestSchema>;
export type PublishLocationQuery = z.infer<typeof PublishLocationQuerySchema>;
export type PublishResource = z.infer<typeof PublishResourceSchema>;
