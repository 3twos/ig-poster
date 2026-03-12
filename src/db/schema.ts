import {
  boolean,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import type { GenerationResponse, OverlayLayout } from "@/lib/creative";
import type { MetaDestinationCapabilities } from "@/lib/meta-accounts";
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

export type MetaWebhookState = Record<string, unknown>;
export type MetaRemoteState = Record<string, unknown>;

export const postStatusEnum = pgEnum("post_status", [
  "draft",
  "scheduled",
  "posted",
]);

export const metaAuthModeEnum = pgEnum("meta_auth_mode", [
  "oauth",
  "env",
]);

export const metaDestinationEnum = pgEnum("meta_destination", [
  "facebook",
  "instagram",
]);

export const metaSyncModeEnum = pgEnum("meta_sync_mode", [
  "remote_authoritative",
  "app_managed",
]);

export const metaDestinationStateEnum = pgEnum("meta_destination_state", [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "canceled",
  "out_of_sync",
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

export const metaAccounts = pgTable(
  "meta_accounts",
  {
    id: varchar("id", { length: 18 }).primaryKey(),
    ownerHash: varchar("owner_hash", { length: 64 }).notNull(),
    connectionId: varchar("connection_id", { length: 20 }),
    authMode: metaAuthModeEnum("auth_mode").notNull().default("oauth"),
    accountKey: varchar("account_key", { length: 191 }).notNull(),
    pageId: varchar("page_id", { length: 64 }),
    pageName: varchar("page_name", { length: 120 }).notNull().default(""),
    instagramUserId: varchar("instagram_user_id", { length: 64 }).notNull(),
    instagramUsername: varchar("instagram_username", { length: 120 })
      .notNull()
      .default(""),
    graphVersion: varchar("graph_version", { length: 16 }).notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    capabilities: jsonb("capabilities").$type<MetaDestinationCapabilities>(),
    webhookState: jsonb("webhook_state")
      .$type<MetaWebhookState>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("meta_accounts_account_key_idx").on(table.accountKey),
    index("meta_accounts_owner_updated_idx").on(table.ownerHash, table.updatedAt),
    index("meta_accounts_owner_ig_idx").on(
      table.ownerHash,
      table.instagramUserId,
    ),
  ],
);

export type MetaAccountRow = typeof metaAccounts.$inferSelect;

export const postDestinations = pgTable(
  "post_destinations",
  {
    id: varchar("id", { length: 18 }).primaryKey(),
    postId: varchar("post_id", { length: 18 }).notNull(),
    destination: metaDestinationEnum("destination").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    syncMode: metaSyncModeEnum("sync_mode").notNull().default("app_managed"),
    desiredState: metaDestinationStateEnum("desired_state")
      .notNull()
      .default("draft"),
    remoteState: metaDestinationStateEnum("remote_state")
      .notNull()
      .default("draft"),
    caption: varchar("caption", { length: 2200 }),
    firstComment: varchar("first_comment", { length: 2200 }),
    locationId: varchar("location_id", { length: 64 }),
    userTags: jsonb("user_tags").$type<MetaScheduleRequest["userTags"]>(),
    publishAt: timestamp("publish_at", { withTimezone: true }),
    remoteObjectId: varchar("remote_object_id", { length: 120 }),
    remoteContainerId: varchar("remote_container_id", { length: 120 }),
    remotePermalink: text("remote_permalink"),
    remoteStatePayload: jsonb("remote_state_payload")
      .$type<MetaRemoteState>()
      .notNull()
      .default({}),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("post_destinations_post_destination_idx").on(
      table.postId,
      table.destination,
    ),
    index("post_destinations_destination_state_idx").on(
      table.destination,
      table.remoteState,
      table.publishAt,
    ),
    index("post_destinations_post_idx").on(table.postId),
  ],
);

export type PostDestinationRow = typeof postDestinations.$inferSelect;

export const publishJobs = pgTable(
  "publish_jobs",
  {
    id: varchar("id", { length: 18 }).primaryKey(),
    ownerHash: varchar("owner_hash", { length: 64 }).notNull(),
    postId: varchar("post_id", { length: 18 }),
    destination: metaDestinationEnum("destination")
      .notNull()
      .default("instagram"),
    remoteAuthority: metaSyncModeEnum("remote_authority")
      .notNull()
      .default("app_managed"),
    accountKey: varchar("account_key", { length: 191 }),
    pageId: varchar("page_id", { length: 64 }),
    instagramUserId: varchar("instagram_user_id", { length: 64 }),
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
    index("publish_jobs_account_status_completed_at_idx").on(
      table.accountKey,
      table.status,
      table.completedAt,
    ),
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
