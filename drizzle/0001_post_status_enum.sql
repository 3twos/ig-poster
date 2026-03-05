-- Breaking migration: posts.status is now backed by a PostgreSQL enum.
-- Ensure there are no unexpected status values before running this in production.

DO $$
BEGIN
  CREATE TYPE post_status AS ENUM (
    'draft',
    'generated',
    'published',
    'scheduled',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE posts
  ALTER COLUMN status TYPE post_status USING status::post_status,
  ALTER COLUMN status SET DEFAULT 'draft';
