import { z } from "zod";

import { PostTypeSchema } from "@/lib/creative";

const FirstCommentSchema = z.string().trim().min(1).max(2200);
const LocationIdSchema = z.string().trim().min(1).max(64);
const InstagramUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^@?[A-Za-z0-9._]+$/, "Tag usernames may only contain letters, numbers, underscore, dot, and optional leading @.")
  .transform((value) => value.replace(/^@/, ""));

export const MetaUserTagSchema = z.object({
  username: InstagramUsernameSchema,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
const UserTagsSchema = z.array(MetaUserTagSchema).min(1).max(20);

export const MetaLocationSearchResultSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  city: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  street: z.string().min(1).optional(),
  zip: z.string().min(1).optional(),
});

export const MetaLocationSearchResponseSchema = z.object({
  locations: z.array(MetaLocationSearchResultSchema),
});

export const CarouselItemSchema = z.object({
  mediaType: z.enum(["image", "video"]),
  url: z.string().url(),
  userTags: UserTagsSchema.optional(),
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

type MetaMetadataValidationIssue = {
  path: Array<string | number>;
  message: string;
};

export const getMetaMetadataValidationIssues = (input: {
  media: {
    mode: "image";
    imageUrl: string;
  } | {
    mode: "reel";
    videoUrl: string;
    coverUrl?: string;
    shareToFeed?: boolean;
  } | {
    mode: "carousel";
    items: Array<z.infer<typeof CarouselItemSchema>>;
  };
  locationId?: string | null;
  userTags?: MetaUserTag[] | null;
}): MetaMetadataValidationIssue[] => {
  const issues: MetaMetadataValidationIssue[] = [];

  if (input.media.mode === "carousel" && input.userTags !== undefined && input.userTags !== null) {
    issues.push({
      path: ["userTags"],
      message: "Carousel posts use per-item user tags instead of a single post-level tag list.",
    });
  }

  if (input.media.mode === "carousel") {
    input.media.items.forEach((item, index) => {
      if (item.mediaType === "video" && (item.userTags?.length ?? 0) > 0) {
        issues.push({
          path: ["media", "items", index, "userTags"],
          message: "User tags are not supported on carousel videos.",
        });
      }
    });
  }

  return issues;
};

export const MetaScheduleRequestSchema = z
  .object({
    postId: z.string().trim().min(1).max(18).optional(),
    caption: z.string().trim().min(1).max(2200),
    firstComment: FirstCommentSchema.optional(),
    locationId: LocationIdSchema.optional(),
    userTags: UserTagsSchema.optional(),
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
        shareToFeed: z.boolean().default(true),
      }),
      z.object({
        mode: z.literal("carousel"),
        items: z.array(CarouselItemSchema).min(2).max(10),
      }),
    ]),
    outcomeContext: OutcomeContextSchema.optional(),
  })
  .superRefine((value, ctx) => {
    for (const issue of getMetaMetadataValidationIssues(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: issue.path,
      });
    }
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
    action: z.literal("move-to-draft"),
  }),
  z.object({
    action: z.literal("retry-now"),
  }),
  z.object({
    action: z.literal("reschedule"),
    publishAt: z.string().datetime(),
  }),
  z.object({
    action: z.literal("edit"),
    caption: z.string().trim().min(1).max(2200).optional(),
    firstComment: z.union([FirstCommentSchema, z.null()]).optional(),
    locationId: z.union([LocationIdSchema, z.null()]).optional(),
    userTags: z.union([UserTagsSchema, z.null()]).optional(),
    publishAt: z.string().datetime().optional(),
    media: MetaScheduleRequestSchema.shape.media.optional(),
    outcomeContext: OutcomeContextSchema.optional(),
  }).refine(
    (value) =>
      value.caption !== undefined ||
      value.firstComment !== undefined ||
      value.locationId !== undefined ||
      value.userTags !== undefined ||
      value.publishAt !== undefined ||
      value.media !== undefined ||
      value.outcomeContext !== undefined,
    { message: "Provide at least one editable field for action=edit." },
  ),
]);

export const PublishJobClientSchema = z.object({
  id: z.string(),
  postId: z.string().nullable().optional(),
  status: PublishJobStatusSchema,
  caption: z.string(),
  firstComment: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  userTags: z.array(MetaUserTagSchema).nullable().optional(),
  media: MetaScheduleRequestSchema.shape.media,
  publishAt: z.string().datetime(),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  lastAttemptAt: z.string().datetime().nullable().optional(),
  lastError: z.string().nullable().optional(),
  authSource: z.enum(["oauth", "env"]),
  connectionId: z.string().nullable().optional(),
  outcomeContext: OutcomeContextSchema.nullable().optional(),
  publishId: z.string().nullable().optional(),
  creationId: z.string().nullable().optional(),
  children: z.array(z.string()).nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  canceledAt: z.string().datetime().nullable().optional(),
  events: z.array(PublishJobEventSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const PublishJobListResponseSchema = z.object({
  jobs: z.array(PublishJobClientSchema),
});

export const ScheduledJobSchema = z.object({
  id: z.string(),
  caption: z.string().min(1).max(2200),
  firstComment: FirstCommentSchema.optional(),
  locationId: LocationIdSchema.optional(),
  userTags: UserTagsSchema.optional(),
  media: MetaScheduleRequestSchema.shape.media,
  publishAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  authSource: z.enum(["oauth", "env"]),
  connectionId: z.string().optional(),
  outcomeContext: OutcomeContextSchema.optional(),
});

export type MetaScheduleRequest = z.infer<typeof MetaScheduleRequestSchema>;
export type CarouselItem = z.infer<typeof CarouselItemSchema>;
export type MetaUserTag = z.infer<typeof MetaUserTagSchema>;
export type MetaLocationSearchResult = z.infer<
  typeof MetaLocationSearchResultSchema
>;
export type ScheduledJob = z.infer<typeof ScheduledJobSchema>;
export type PublishJobStatus = z.infer<typeof PublishJobStatusSchema>;
export type PublishJobEvent = z.infer<typeof PublishJobEventSchema>;
export type PublishJobUpdateRequest = z.infer<typeof PublishJobUpdateRequestSchema>;
export type PublishJobClient = z.infer<typeof PublishJobClientSchema>;
