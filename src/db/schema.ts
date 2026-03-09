import {
  boolean,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import type { GenerationResponse, OverlayLayout } from "@/lib/creative";
import type { MetaScheduleRequest, PublishJobEvent } from "@/lib/meta-schemas";
import type { MediaComposition } from "@/lib/media-composer";
import {
  DEFAULT_PUBLISH_SETTINGS,
  type PublishSettings,
} from "@/lib/publish-settings";
import type { StoredAsset } from "@/lib/project";
import type {
  BrandKitLogo,
  BrandState,
  PostState,
  PromptConfigState,
} from "@/lib/types";

export type PublishHistoryEntry = {
  publishedAt: string;
  igMediaId?: string;
  igPermalink?: string;
};

export const postStatusEnum = pgEnum("post_status", [
  "draft",
  "scheduled",
  "posted",
]);

export const publishJobStatusEnum = pgEnum("publish_job_status", [
  "queued",
  "processing",
  "published",
  "failed",
  "canceled",
]);

export const posts = pgTable(
  "posts",
  {
    id: varchar("id", { length: 18 }).primaryKey(),
    ownerHash: varchar("owner_hash", { length: 64 }).notNull(),
    title: varchar("title", { length: 120 }).notNull().default(""),
    status: postStatusEnum("status").notNull().default("draft"),

    brand: jsonb("brand").$type<Partial<BrandState>>(),
    brief: jsonb("brief").$type<Partial<PostState>>(),
    assets: jsonb("assets").$type<StoredAsset[]>().notNull().default([]),
    logoUrl: text("logo_url"),
    brandKitId: varchar("brand_kit_id", { length: 18 }),
    promptConfig: jsonb("prompt_config").$type<Partial<PromptConfigState>>(),

    result: jsonb("result").$type<GenerationResponse>(),
    activeVariantId: varchar("active_variant_id", { length: 64 }),
    overlayLayouts: jsonb("overlay_layouts")
      .$type<Record<string, OverlayLayout>>()
      .notNull()
      .default({}),
    mediaComposition: jsonb("media_composition")
      .$type<MediaComposition>()
      .notNull()
      .default({ orientation: "portrait", items: [] }),
    publishSettings: jsonb("publish_settings")
      .$type<PublishSettings>()
      .notNull()
      .default(DEFAULT_PUBLISH_SETTINGS),

    renderedPosterUrl: text("rendered_poster_url"),
    shareUrl: text("share_url"),
    shareProjectId: varchar("share_project_id", { length: 36 }),
    publishHistory: jsonb("publish_history")
      .$type<PublishHistoryEntry[]>()
      .notNull()
      .default([]),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    index("posts_owner_status_updated_idx").on(
      table.ownerHash,
      table.status,
      table.updatedAt,
    ),
  ],
);

export type PostRow = typeof posts.$inferSelect;

export const publishJobs = pgTable(
  "publish_jobs",
  {
    id: varchar("id", { length: 18 }).primaryKey(),
    ownerHash: varchar("owner_hash", { length: 64 }).notNull(),
    postId: varchar("post_id", { length: 18 }),
    status: publishJobStatusEnum("status").notNull().default("queued"),
    caption: varchar("caption", { length: 2200 }).notNull(),
    firstComment: varchar("first_comment", { length: 2200 }),
    locationId: varchar("location_id", { length: 64 }),
    userTags: jsonb("user_tags").$type<MetaScheduleRequest["userTags"]>(),
    media: jsonb("media").$type<MetaScheduleRequest["media"]>().notNull(),
    publishAt: timestamp("publish_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    authSource: varchar("auth_source", { length: 8 }).notNull().default("oauth"),
    connectionId: varchar("connection_id", { length: 20 }),
    outcomeContext: jsonb("outcome_context").$type<MetaScheduleRequest["outcomeContext"]>(),
    publishId: varchar("publish_id", { length: 120 }),
    creationId: varchar("creation_id", { length: 120 }),
    children: jsonb("children").$type<string[]>(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    events: jsonb("events").$type<PublishJobEvent[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("publish_jobs_owner_status_publish_at_idx").on(
      table.ownerHash,
      table.status,
      table.publishAt,
    ),
    index("publish_jobs_owner_status_completed_at_idx").on(
      table.ownerHash,
      table.status,
      table.completedAt,
    ),
    index("publish_jobs_post_idx").on(table.postId),
    index("publish_jobs_status_last_attempt_idx").on(
      table.status,
      table.lastAttemptAt,
    ),
  ],
);

export type PublishJobRow = typeof publishJobs.$inferSelect;

export const brandKits = pgTable(
  "brand_kits",
  {
    id: varchar("id", { length: 18 }).primaryKey(),
    ownerHash: varchar("owner_hash", { length: 64 }).notNull(),
    name: varchar("name", { length: 80 }).notNull().default("Default"),
    brand: jsonb("brand").$type<Partial<BrandState>>(),
    promptConfig: jsonb("prompt_config").$type<Partial<PromptConfigState>>(),
    logos: jsonb("logos").$type<BrandKitLogo[]>().notNull().default([]),
    logoUrl: text("logo_url"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("brand_kits_owner_idx").on(table.ownerHash),
  ],
);

export type BrandKitRow = typeof brandKits.$inferSelect;
