# IG Poster Engine User Guide

## Before You Start

- You must sign in with an allowed Google Workspace account.
- For full functionality, ensure the environment has:
  - Blob storage configured (`BLOB_READ_WRITE_TOKEN`) for uploads/shares/scheduling.
  - Meta credentials configured (OAuth app settings and/or env fallback) for publishing.
  - LLM credentials connected (or env fallback) for model-based generation.

## Quick Start

1. Sign in
- Open the app and complete Google Workspace login.

2. (Optional but recommended) Connect an LLM provider
- In the "Intelligent IG Poster (LLM)" panel, select `openai` or `anthropic`.
- Enter API key and model, then connect.
- If you skip this, generation uses deterministic fallback concepts.

3. Fill brand and post details
- Brand fields: name, values, principles, story, voice, visual direction, palette, logo notes.
- Post fields: theme, subject, thought, objective, audience, mood, aspect ratio.

4. (Optional) Autofill brand from website
- Enter website URL and use autofill to populate brand fields from website cues.

5. Upload assets and logo
- Upload images and/or videos (up to 20 assets).
- Upload a logo if needed for final poster composition.

6. Generate creative variants
- Click generate to create 3 variants with:
  - strategy
  - hook/headline/body/CTA
  - caption + hashtags
  - post type and media sequencing

7. Pick and edit a variant
- Select a variant tile to preview.
- Enable editor mode to drag/resize text overlay blocks.

8. Export or copy content
- Export poster as PNG.
- Copy caption + hashtags to clipboard.

9. Share project
- Create a share link to persist project state and open it later at `/share/<id>`.

10. Publish or schedule to Instagram
- Connect Instagram via Meta OAuth (if not already connected).
- Publish now, or set a future date/time to schedule.

## Publishing Behavior

- `single-image` variant publishes a rendered poster image.
- `carousel` variant uses uploaded media sequence (minimum 2 items, up to 10).
- `reel` variant requires at least one uploaded video.
- If `publishAt` is more than ~2 minutes in the future, the app schedules it.
- Scheduled posts are processed by `/api/cron/publish` (every 15 minutes in Vercel cron config).

## Managing Connections

- LLM:
  - Connect/disconnect from the LLM auth panel.
  - Stored encrypted (Blob when available, encrypted cookie fallback otherwise).
- Instagram:
  - Connect/disconnect in the Instagram publish section.
  - OAuth connection id is stored in cookie; encrypted tokens are persisted in Blob.
- Workspace:
  - Use Sign out in the top bar to clear session and return to login.

## Troubleshooting

- "Unauthorized" responses:
  - Sign in again with your Workspace account.

- Upload/share/schedule errors mentioning Blob:
  - Configure `BLOB_READ_WRITE_TOKEN`.

- Generation falls back or looks generic:
  - Verify LLM connection status and model availability.

- Instagram publish fails:
  - Reconnect Meta OAuth, confirm business account/page linkage, and verify media requirements by post type.

- Scheduled posts not firing:
  - Confirm `CRON_SECRET` and Vercel cron invocation of `/api/cron/publish`.
