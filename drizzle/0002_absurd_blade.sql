CREATE TYPE "public"."publish_job_status" AS ENUM('queued', 'processing', 'published', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "publish_jobs" (
	"id" varchar(18) PRIMARY KEY NOT NULL,
	"owner_hash" varchar(64) NOT NULL,
	"post_id" varchar(18),
	"status" "publish_job_status" DEFAULT 'queued' NOT NULL,
	"caption" varchar(2200) NOT NULL,
	"media" jsonb NOT NULL,
	"publish_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	"auth_source" varchar(8) DEFAULT 'oauth' NOT NULL,
	"connection_id" varchar(20),
	"outcome_context" jsonb,
	"publish_id" varchar(120),
	"creation_id" varchar(120),
	"children" jsonb,
	"completed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "publish_jobs_owner_status_publish_at_idx" ON "publish_jobs" USING btree ("owner_hash","status","publish_at");--> statement-breakpoint
CREATE INDEX "publish_jobs_post_idx" ON "publish_jobs" USING btree ("post_id");