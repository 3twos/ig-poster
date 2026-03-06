import { z } from "zod";

import { PostTypeSchema } from "@/lib/creative";

export const CarouselItemSchema = z.object({
  mediaType: z.enum(["image", "video"]),
  url: z.string().url(),
});

export const OutcomeContextSchema = z.object({
  variantName: z.string(),
  postType: PostTypeSchema,
  caption: z.string(),
  hook: z.string(),
  hashtags: z.array(z.string()),
  brandName: z.string(),
  score: z.number().optional(),
});

export const MetaScheduleRequestSchema = z.object({
  postId: z.string().trim().min(1).max(18).optional(),
  caption: z.string().trim().min(1).max(2200),
  publishAt: z.string().datetime().optional(),
  media: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("image"),
      imageUrl: z.string().url(),
    }),
    z.object({
      mode: z.literal("reel"),
      videoUrl: z.string().url(),
      coverUrl: z.string().url().optional(),
    }),
    z.object({
      mode: z.literal("carousel"),
      items: z.array(CarouselItemSchema).min(2).max(10),
    }),
  ]),
  outcomeContext: OutcomeContextSchema.optional(),
});

export const PublishJobStatusSchema = z.enum([
  "queued",
  "processing",
  "published",
  "failed",
  "canceled",
]);

export const PublishJobEventSchema = z.object({
  at: z.string().datetime(),
  type: z.enum([
    "created",
    "processing",
    "retry-scheduled",
    "published",
    "failed",
    "canceled",
    "updated",
  ]),
  detail: z.string().optional(),
  attempt: z.number().int().positive().optional(),
});

export const PublishJobUpdateRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cancel"),
  }),
  z.object({
    action: z.literal("reschedule"),
    publishAt: z.string().datetime(),
  }),
  z.object({
    action: z.literal("edit"),
    caption: z.string().trim().min(1).max(2200).optional(),
    publishAt: z.string().datetime().optional(),
    media: MetaScheduleRequestSchema.shape.media.optional(),
    outcomeContext: OutcomeContextSchema.optional(),
  }).refine(
    (value) =>
      value.caption !== undefined ||
      value.publishAt !== undefined ||
      value.media !== undefined ||
      value.outcomeContext !== undefined,
    { message: "Provide at least one editable field for action=edit." },
  ),
]);

export const ScheduledJobSchema = z.object({
  id: z.string(),
  caption: z.string().min(1).max(2200),
  media: MetaScheduleRequestSchema.shape.media,
  publishAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  authSource: z.enum(["oauth", "env"]),
  connectionId: z.string().optional(),
  outcomeContext: OutcomeContextSchema.optional(),
});

export type MetaScheduleRequest = z.infer<typeof MetaScheduleRequestSchema>;
export type CarouselItem = z.infer<typeof CarouselItemSchema>;
export type ScheduledJob = z.infer<typeof ScheduledJobSchema>;
export type PublishJobStatus = z.infer<typeof PublishJobStatusSchema>;
export type PublishJobEvent = z.infer<typeof PublishJobEventSchema>;
export type PublishJobUpdateRequest = z.infer<typeof PublishJobUpdateRequestSchema>;
