ALTER TABLE "publish_jobs" ADD COLUMN "location_id" varchar(64);--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD COLUMN "user_tags" jsonb;
