import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import type { GenerationResponse, OverlayLayout } from "@/lib/creative";
import type { StoredAsset } from "@/lib/project";
import type { BrandState, PostState, PromptConfigState } from "@/lib/types";

export type PublishHistoryEntry = {
  publishedAt: string;
  igMediaId?: string;
  igPermalink?: string;
};

export const posts = pgTable(
  "posts",
  {
    id: varchar("id", { length: 18 }).primaryKey(),
    ownerHash: varchar("owner_hash", { length: 64 }).notNull(),
    title: varchar("title", { length: 120 }).notNull().default(""),
    status: varchar("status", { length: 20 }).notNull().default("draft"),

    brand: jsonb("brand").$type<Partial<BrandState>>(),
    brief: jsonb("brief").$type<Partial<PostState>>(),
    assets: jsonb("assets").$type<StoredAsset[]>().notNull().default([]),
    logoUrl: text("logo_url"),
    promptConfig: jsonb("prompt_config").$type<Partial<PromptConfigState>>(),

    result: jsonb("result").$type<GenerationResponse>(),
    activeVariantId: varchar("active_variant_id", { length: 64 }),
    overlayLayouts: jsonb("overlay_layouts")
      .$type<Record<string, OverlayLayout>>()
      .notNull()
      .default({}),

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
