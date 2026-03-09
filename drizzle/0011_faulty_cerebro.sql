ALTER TABLE "posts" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "status" SET DEFAULT 'draft'::text;--> statement-breakpoint
UPDATE "posts"
SET "archived_at" = COALESCE("archived_at", "updated_at", "created_at", NOW())
WHERE "status" = 'archived';--> statement-breakpoint
UPDATE "posts"
SET "status" = CASE
  WHEN "status" IN ('draft', 'generated') THEN 'draft'
  WHEN "status" = 'scheduled' THEN 'scheduled'
  WHEN "status" = 'published' THEN 'posted'
  WHEN "status" = 'archived' THEN CASE
    WHEN EXISTS (
      SELECT 1
      FROM "publish_jobs"
      WHERE "publish_jobs"."post_id" = "posts"."id"
        AND "publish_jobs"."status" IN ('queued', 'processing')
    ) THEN 'scheduled'
    WHEN "posts"."published_at" IS NOT NULL
      OR jsonb_array_length(COALESCE("posts"."publish_history", '[]'::jsonb)) > 0
    THEN 'posted'
    ELSE 'draft'
  END
  ELSE 'draft'
END;--> statement-breakpoint
DROP TYPE "public"."post_status";--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'scheduled', 'posted');--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."post_status";--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "status" SET DATA TYPE "public"."post_status" USING "status"::"public"."post_status";
