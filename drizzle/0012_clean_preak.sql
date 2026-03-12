CREATE TYPE "public"."meta_auth_mode" AS ENUM('oauth', 'env');--> statement-breakpoint
CREATE TYPE "public"."meta_destination" AS ENUM('facebook', 'instagram');--> statement-breakpoint
CREATE TYPE "public"."meta_destination_state" AS ENUM('draft', 'scheduled', 'publishing', 'published', 'failed', 'canceled', 'out_of_sync');--> statement-breakpoint
CREATE TYPE "public"."meta_sync_mode" AS ENUM('remote_authoritative', 'app_managed');--> statement-breakpoint
CREATE TABLE "meta_accounts" (
	"id" varchar(18) PRIMARY KEY NOT NULL,
	"owner_hash" varchar(64) NOT NULL,
	"connection_id" varchar(20),
	"auth_mode" "meta_auth_mode" DEFAULT 'oauth' NOT NULL,
	"account_key" varchar(191) NOT NULL,
	"page_id" varchar(64),
	"page_name" varchar(120) DEFAULT '' NOT NULL,
	"instagram_user_id" varchar(64) NOT NULL,
	"instagram_username" varchar(120) DEFAULT '' NOT NULL,
	"graph_version" varchar(16) NOT NULL,
	"token_expires_at" timestamp with time zone,
	"capabilities" jsonb,
	"webhook_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_destinations" (
	"id" varchar(18) PRIMARY KEY NOT NULL,
	"post_id" varchar(18) NOT NULL,
	"destination" "meta_destination" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sync_mode" "meta_sync_mode" DEFAULT 'app_managed' NOT NULL,
	"desired_state" "meta_destination_state" DEFAULT 'draft' NOT NULL,
	"remote_state" "meta_destination_state" DEFAULT 'draft' NOT NULL,
	"caption" varchar(2200),
	"first_comment" varchar(2200),
	"location_id" varchar(64),
	"user_tags" jsonb,
	"publish_at" timestamp with time zone,
	"remote_object_id" varchar(120),
	"remote_container_id" varchar(120),
	"remote_permalink" text,
	"remote_state_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD COLUMN "destination" "meta_destination" DEFAULT 'instagram' NOT NULL;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD COLUMN "remote_authority" "meta_sync_mode" DEFAULT 'app_managed' NOT NULL;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD COLUMN "account_key" varchar(191);--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD COLUMN "page_id" varchar(64);--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD COLUMN "instagram_user_id" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "meta_accounts_account_key_idx" ON "meta_accounts" USING btree ("account_key");--> statement-breakpoint
CREATE INDEX "meta_accounts_owner_updated_idx" ON "meta_accounts" USING btree ("owner_hash","updated_at");--> statement-breakpoint
CREATE INDEX "meta_accounts_owner_ig_idx" ON "meta_accounts" USING btree ("owner_hash","instagram_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_destinations_post_destination_idx" ON "post_destinations" USING btree ("post_id","destination");--> statement-breakpoint
CREATE INDEX "post_destinations_destination_state_idx" ON "post_destinations" USING btree ("destination","remote_state","publish_at");--> statement-breakpoint
CREATE INDEX "post_destinations_post_idx" ON "post_destinations" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "publish_jobs_account_status_completed_at_idx" ON "publish_jobs" USING btree ("account_key","status","completed_at");