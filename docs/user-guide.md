# IG Poster Engine User Guide

## Before You Start

- You need an allowed Google Workspace account to create, edit, generate, publish, and schedule content.
- Shared project links at `/share/<id>` are public read-only pages; treat links as sensitive.
- For full functionality, ensure the environment has:
  - Postgres configured (`POSTGRES_URL` or `DATABASE_URL`) for post creation/loading and autosave.
  - Blob storage configured (`BLOB_READ_WRITE_TOKEN`) for uploads/shares/outcomes.
  - Meta credentials configured (OAuth app settings and/or env fallback) for publishing.
  - LLM credentials connected (or env fallback) for model-based generation.

## Quick Start

1. Sign in
   - Open the app and complete Google Workspace login.

2. (Optional but recommended) Connect one or more LLM providers
   - Open **Settings** from the top-right controls, then add an OpenAI or Anthropic connection by entering an API key and model.
   - You can connect multiple providers/models simultaneously. They appear in a prioritized list that you can drag to reorder.
   - Choose an execution mode:
     - **Fallback** -- models are tried in priority order; the first successful response wins.
     - **Parallel** -- all models are queried simultaneously and results are merged and ranked.
   - Models configured via environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) auto-appear in the list.
   - If you skip this and no env keys are set, generation uses deterministic fallback concepts.

3. Navigate the 3-column layout
   - Left panel: posts list with thumbnails — browse, select, post now/schedule, duplicate, archive, or delete posts.
   - Each post row is fully clickable (title, thumbnail, and metadata), and hover on a thumbnail shows a larger preview.
   - Post rows show visual state chips (`Draft`, `Dirty`, `Post at`, `Posted`, and `Archived` where applicable).
   - Filter tabs include All, Drafts, Scheduled, Posted, and Archived.
   - Center panel: post brief, asset manager, preview, strategy, and publish sections.
   - Right panel: switch between **Agent** and **Chat** tabs.
     - Agent tab: real-time generation progress and LLM reasoning.
     - Chat tab: AI assistant for brainstorming, captions, and creative direction.
   - Panels are resizable by dragging the handles and collapsible via edge buttons.
   - On mobile, Agent Activity and Chat are available as slide-out drawers via buttons below the main content.

4. Fill brand and post details
   - Brand fields: name, values, principles, story, voice, visual direction, palette (color picker swatches), fonts, logo notes.
   - Post fields: theme, subject, thought, objective, audience, mood, aspect ratio (including feed landscape `1.91:1`).
   - Brand kits can store multiple named logos. Upload them in Brand Kits, edit the display names, then select both the brand kit and logo from the post brief form.
   - New posts default to the first available brand kit in the database when one exists.
   - The post subject field is used as the post title in the sidebar list, falling back to theme or the first generated variant headline.

5. (Optional) Autofill brand from website
   - Enter website URL and use autofill to populate brand fields (including fonts) from website cues.

6. Upload assets
   - Use the Asset Manager `Attach assets` control to upload images and/or videos (up to 20 assets).
   - Reorder assets by dragging in the asset manager; each item shows a thumbnail, file size, and media type.
   - Remove individual assets with the X button.
   - Logo uploads now live in Brand Kits rather than the post composer.

7. Generate creative variants
   - Click generate to create 3 variants with:
     - strategy
     - hook/headline/body/CTA
     - caption + hashtags
     - post type and media sequencing
   - `Generate` keeps the post in `Draft`. Running it again uses the current brief, assets, brand kit, and logo selection to create a fresh result.
   - A fresh `Generate` pass intentionally ignores prior `Refine` instructions and manual editor component changes. Use it when you want a reset, not an incremental tweak.
   - During generation, the right panel streams LLM reasoning tokens in real time. Expand "Show reasoning" to see the model's thought process.

8. Pick and edit a variant
   - Select a variant tile to preview.
   - For carousel variants, use the **Carousel Composer** under the preview to add/remove included items, reorder them, and switch the feed orientation between square, portrait, and landscape.
   - Carousel composer changes are part of the same autosaved draft state as the brief and overlay edits, so preview, share snapshots, and publish all use the same order.
   - Enable editor mode to drag/resize text overlay blocks.
   - The canvas auto-saves after edits; use `Save now` beside the editor controls when you want an immediate write.
   - Use the Canvas Editor inspector to:
     - change hook/headline/body/CTA text without regenerating
     - hide a generated text block and add it back later
     - add or remove custom text boxes
     - adjust text scale per box
   - Turning editor mode off keeps the edited layout visible in the normal preview and in shared snapshots.
   - Carousel previews now show one slide at a time instead of compositing multiple uploaded assets into a single frame.
   - The `Post Caption` card is now a persisted composer field. Edit it directly, or use `Use generated` to pull the latest AI caption suggestion into the saved draft.
   - `Refine` is the incremental path: it updates the selected variant while preserving the current editor placement and visual treatment unless you explicitly ask the AI to change them.
   - `Duplicate post` forks the current post into a new editable draft copy. If the source post is already posted, duplication is the only way to continue iterating.
   - Scheduled posts can be moved back into `Draft` with `Move to draft`.

9. Export or copy content
   - Export poster as PNG.
   - Copy caption + hashtags to clipboard.

10. Share project
   - Create a share link to persist project state and open it later at `/share/<id>`.

11. Publish or schedule to Instagram
   - Connect Instagram via Meta OAuth in Settings (if not already connected).
   - Use `Post now` or `Post at` (date/time picker) in the publish section.
   - Use the dedicated `Post Caption` field as the source of truth for publish/schedule; the generated caption stays available as a suggestion.
   - Optionally add a `First comment` in the publish section; it is posted right after media publish.
   - For reel posts, choose whether `Share reel to main feed` stays on or off before posting or scheduling.
   - For single-image posts and reels, optionally search Meta places to fill `Location ID` (or paste the ID manually) and add structured `User tags`.
   - For carousel posts, tag each included image individually from the publish metadata editor. Carousel video items remain schedulable, but Meta does not accept user tags on carousel videos.
   - The same `Post now` / `Post at` actions are available from each post row `...` menu in the sidebar.
   - Scheduling uses your browser's local timezone (shown next to the date-time field).
   - Open `Planner` from the publish section to review scheduled posts on a calendar, reschedule them, open the linked post, or move them back to draft.
   - The publish section also shows a workspace queue for queued, processing, and failed jobs.
   - Use the queue controls to cancel a scheduled publish, retry a failed job immediately, or edit a queued/failed job (caption + first comment + publish time + media URLs + image metadata, including visual tag placement and location search assist, plus reel feed-sharing and per-item carousel tags) without leaving the editor.
   - Each queue card now shows recent activity entries so you can see retries, deferrals, failures, and manual edits without checking the database.
   - After a post is successfully published, IG Poster marks it `Posted` and switches it to a read-only snapshot view. Posted posts cannot be edited or deleted; archive them to hide them from the main list, or duplicate them to create a new draft.

12. Use the AI Chat assistant
   - Switch to the Chat tab in the right panel (or tap the Chat button on mobile).
   - Ask questions about content strategy, caption ideas, hashtag suggestions, or creative direction.
   - Conversations are saved automatically; switch between them via the dropdown in the chat header.
   - Start a new conversation with the "+" button.
   - The chat uses the same LLM connections configured in Settings.

## CLI Preview

- The repo now includes an experimental `ig` CLI for power users and local agents.
- Available preview commands:
  - `ig status`
  - `ig auth login --token-stdin`
  - `ig auth status`
  - `ig auth logout`
  - `ig assets upload <file...> [--folder <assets|videos|logos|renders>]`
  - `ig brand-kits list|get`
  - `ig config list|get|set`
  - `ig api <METHOD> <PATH>`
  - `ig posts list|get|create|update|duplicate|archive`
  - `ig queue list|get|cancel|retry|move-to-draft|update`
- The CLI talks to `/api/v1/*` on a running IG Poster server. It does not run generation or publishing logic locally.
- The current auth bootstrap is temporary: you must provide a valid bearer token manually (`IG_POSTER_TOKEN`, `--token`, `--token-file`, or `--token-stdin`). Browser/device login is not shipped yet.
- Use `--json` for machine-readable output. A limited `--jq` dot-path helper is also available for simple field extraction.
- `ig assets upload` reads local image/video files and sends them to the same Blob-backed upload path the browser uses, with an optional folder override for `assets`, `videos`, `logos`, or `renders`.
- `ig queue` mirrors the browser queue lifecycle controls: inspect a job, cancel it, retry a failed one, move a linked post back to draft, or send an edit/reschedule patch through `queue update`.

## Working with Saved Posts

- Selecting a different post saves pending edits first, then loads the selected draft.
- If you click multiple posts quickly, stale responses are ignored and only the latest selection is applied.
- Sidebar list refreshes keep existing entries visible to avoid flicker while background updates run.
- Editor text/layout changes and carousel composition changes are part of the same autosaved draft state as your brief, assets, and selected variant.
- Duplicating a post creates a new draft copy with the current creative result, media composition, and publish settings, but without old share links or publish history.
- Posted posts are immutable in IG Poster because the Meta publishing API flow used here does not support updating the published media payload.
- Moving a scheduled post back to draft first cancels the pending publish job, then returns the post to `Draft`.

## Publishing Behavior

- `single-image` variant publishes a rendered poster image.
- `carousel` variant uses the Carousel Composer sequence (minimum 2 items, up to 10) and the selected feed orientation.
- `reel` variant requires at least one uploaded video and includes a `Share reel to main feed` toggle. The default is on, matching the previous hardcoded behavior.
- Post status lifecycle is `Draft -> Scheduled -> Posted`, with archiving handled separately via the archive action.
- Location ID is supported for single-image posts, reels, and carousel parents.
- User tags are supported for single-image posts, reels, and carousel image items. Carousel videos cannot carry user tags.
- Location search suggestions populate the same `locationId` field sent to Meta; if search fails, you can still paste the raw ID manually.
- User-tag placement uses the rendered poster preview in the main composer and the stored published image URL in queue edits when an image preview exists, while x/y inputs remain available for precision edits.
- Instagram API throughput is capped at 50 published posts per rolling 24-hour window per account.
- Media URL preflight runs before scheduling/publishing and queue media edits: URLs must be public HTTPS and must probe as the expected media type (`image/*` or `video/*`).
- If `publishAt` is more than ~2 minutes in the future, the app schedules it.
- Scheduled posts are processed by `/api/cron/publish` (every 15 minutes in Vercel cron config).
- Scheduled queue processing claims due jobs from Postgres-backed publish jobs.
- If a job gets stranded in `processing` for too long, the cron hardening sweep marks it `failed` with a diagnostic note so it can be reviewed and retried manually instead of silently blocking capacity.
- Failed jobs stay visible in the publish queue with their latest error so they can be retried immediately or edited and re-queued.
- If the 24-hour publish window is saturated, immediate publish returns a clear limit message and due queued jobs are deferred automatically (without consuming retry attempts) until capacity returns.
- First-comment posting is best effort: publish success is preserved even if first-comment posting fails.
- Because posted posts are locked, any further iteration happens by duplicating the post into a new draft rather than editing the posted record in place.

## Managing Connections

- LLM:
  - Connect one or more providers from the Settings page. Each connection gets a unique `connectionId`.
  - Drag to reorder models by priority; choose Fallback or Parallel execution mode.
  - Disconnect a specific model by its `connectionId`.
  - Stored in the private credential store when `DATABASE_URL` is configured; otherwise stored in an encrypted cookie tied to your browser session.
  - Connected LLM providers are used by both generation and the AI chat assistant.
- Instagram:
  - Connect/disconnect in Settings under Instagram Publishing.
  - OAuth connection id is stored in cookie; encrypted tokens are persisted in the private credential store (DB) when available, with encrypted cookie fallback.
- Workspace:
  - Use Sign out in the navigation hamburger menu to clear session and return to login.

## Troubleshooting

- "Unauthorized" responses:
  - Sign in again with your Workspace account.
  - For CLI usage, also verify that the configured bearer token is still valid for the target host/profile.

- Main page is empty and "New Post" does nothing:
  - Verify `POSTGRES_URL` or `DATABASE_URL` is configured for the running environment.

- "Invalid request body" responses on post create/update APIs:
  - Check field formats (URLs, status values, and structured payload shape) before retrying.

- Upload/share errors mentioning Blob:
  - Configure `BLOB_READ_WRITE_TOKEN`.

- Generation falls back or looks generic:
  - Verify LLM connection status and model availability.

- Instagram publish fails:
  - Reconnect Meta OAuth, confirm business account/page linkage, and verify media requirements by post type.

- Scheduled posts not firing:
  - Confirm `CRON_SECRET` and Vercel cron invocation of `/api/cron/publish`.
