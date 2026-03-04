# IG Poster Engine User Guide

## Before You Start

- You need an allowed Google Workspace account to create, edit, generate, publish, and schedule content.
- Shared project links at `/share/<id>` are public read-only pages; treat links as sensitive.
- For full functionality, ensure the environment has:
  - Blob storage configured (`BLOB_READ_WRITE_TOKEN`) for uploads/shares/scheduling.
  - Meta credentials configured (OAuth app settings and/or env fallback) for publishing.
  - LLM credentials connected (or env fallback) for model-based generation.

## Quick Start

1. Sign in
   - Open the app and complete Google Workspace login.

2. (Optional but recommended) Connect one or more LLM providers
   - On the Settings page, add an OpenAI or Anthropic connection by entering an API key and model.
   - You can connect multiple providers/models simultaneously. They appear in a prioritized list that you can drag to reorder.
   - Choose an execution mode:
     - **Fallback** -- models are tried in priority order; the first successful response wins.
     - **Parallel** -- all models are queried simultaneously and results are merged and ranked.
   - Models configured via environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) auto-appear in the list.
   - If you skip this and no env keys are set, generation uses deterministic fallback concepts.

3. Navigate the 3-column layout
   - Left panel: posts list with thumbnails — browse, select, archive, or delete posts.
   - Center panel: post brief, asset manager, preview, strategy, and publish sections.
   - Right panel: switch between **Agent** and **Chat** tabs.
     - Agent tab: real-time generation progress and LLM reasoning.
     - Chat tab: AI assistant for brainstorming, captions, and creative direction.
   - Panels are resizable by dragging the handles and collapsible via edge buttons.
   - On mobile, Agent Activity and Chat are available as slide-out drawers via buttons below the main content.

4. Fill brand and post details
   - Brand fields: name, values, principles, story, voice, visual direction, palette, logo notes.
   - Post fields: theme, subject, thought, objective, audience, mood, aspect ratio.
   - The post subject field is used as the post title in the sidebar list, falling back to theme or the first generated variant headline.

5. (Optional) Autofill brand from website
   - Enter website URL and use autofill to populate brand fields from website cues.

6. Upload assets and logo
   - Upload images and/or videos (up to 20 assets).
   - Reorder assets by dragging in the asset manager; each item shows a thumbnail, file size, and media type.
   - Remove individual assets with the X button.
   - Upload a logo if needed for final poster composition.

7. Generate creative variants
   - Click generate to create 3 variants with:
     - strategy
     - hook/headline/body/CTA
     - caption + hashtags
     - post type and media sequencing
   - During generation, the right panel streams LLM reasoning tokens in real time. Expand "Show reasoning" to see the model's thought process.

8. Pick and edit a variant
   - Select a variant tile to preview.
   - Enable editor mode to drag/resize text overlay blocks.

9. Export or copy content
   - Export poster as PNG.
   - Copy caption + hashtags to clipboard.

10. Share project
   - Create a share link to persist project state and open it later at `/share/<id>`.

11. Publish or schedule to Instagram
   - Connect Instagram via Meta OAuth (if not already connected).
   - Publish now, or set a future date/time to schedule.

12. Use the AI Chat assistant
   - Switch to the Chat tab in the right panel (or tap the Chat button on mobile).
   - Ask questions about content strategy, caption ideas, hashtag suggestions, or creative direction.
   - Conversations are saved automatically; switch between them via the dropdown in the chat header.
   - Start a new conversation with the "+" button.
   - The chat uses the same LLM connections configured in Settings.

## Publishing Behavior

- `single-image` variant publishes a rendered poster image.
- `carousel` variant uses uploaded media sequence (minimum 2 items, up to 10).
- `reel` variant requires at least one uploaded video.
- If `publishAt` is more than ~2 minutes in the future, the app schedules it.
- Scheduled posts are processed by `/api/cron/publish` (every 15 minutes in Vercel cron config).

## Managing Connections

- LLM:
  - Connect one or more providers from the Settings page. Each connection gets a unique `connectionId`.
  - Drag to reorder models by priority; choose Fallback or Parallel execution mode.
  - Disconnect a specific model by its `connectionId`.
  - Stored in the private credential store when `DATABASE_URL` is configured; otherwise stored in an encrypted cookie tied to your browser session.
  - Connected LLM providers are used by both generation and the AI chat assistant.
- Instagram:
  - Connect/disconnect in the Instagram publish section.
  - OAuth connection id is stored in cookie; encrypted tokens are persisted in Blob.
- Workspace:
  - Use Sign out in the navigation hamburger menu to clear session and return to login.

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
