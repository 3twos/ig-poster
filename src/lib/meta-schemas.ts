import { z } from "zod";

export const CarouselItemSchema = z.object({
  mediaType: z.enum(["image", "video"]),
  url: z.string().url(),
});

export const OutcomeContextSchema = z.object({
  variantName: z.string(),
  postType: z.string(),
  caption: z.string(),
  hook: z.string(),
  hashtags: z.array(z.string()),
  brandName: z.string(),
  score: z.number().optional(),
});

export const MetaScheduleRequestSchema = z.object({
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

export const ScheduledJobSchema = z.object({
  id: z.string(),
  caption: z.string().min(1).max(2200),
  media: MetaScheduleRequestSchema.shape.media,
  publishAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  authSource: z.enum(["oauth", "env"]),
  connectionId: z.string().optional(),
});

export type MetaScheduleRequest = z.infer<typeof MetaScheduleRequestSchema>;
export type CarouselItem = z.infer<typeof CarouselItemSchema>;
export type ScheduledJob = z.infer<typeof ScheduledJobSchema>;
