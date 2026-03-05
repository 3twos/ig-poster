CREATE TABLE "brand_kits" (
	"id" varchar(18) PRIMARY KEY NOT NULL,
	"owner_hash" varchar(64) NOT NULL,
	"name" varchar(80) DEFAULT 'Default' NOT NULL,
	"brand" jsonb,
	"prompt_config" jsonb,
	"logo_url" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" varchar(18) PRIMARY KEY NOT NULL,
	"owner_hash" varchar(64) NOT NULL,
	"title" varchar(120) DEFAULT '' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"brand" jsonb,
	"brief" jsonb,
	"assets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"logo_url" text,
	"brand_kit_id" varchar(18),
	"prompt_config" jsonb,
	"result" jsonb,
	"active_variant_id" varchar(64),
	"overlay_layouts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rendered_poster_url" text,
	"share_url" text,
	"share_project_id" varchar(36),
	"publish_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "brand_kits_owner_idx" ON "brand_kits" USING btree ("owner_hash");--> statement-breakpoint
CREATE INDEX "posts_owner_status_updated_idx" ON "posts" USING btree ("owner_hash","status","updated_at");