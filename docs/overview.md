# IG Poster Engine Overview

## Goals

- Turn a brand brief and post brief into publish-ready Instagram creative quickly.
- Keep creative output structured, editable, and reusable instead of one-off draft text.
- Support the full workflow from concept generation to export, sharing, and publishing.
- Enforce secure, internal-first access for teams using Google Workspace.

## Capabilities

- Generates exactly 3 creative variants per request, including strategy rationale, caption, hashtags, and format-aware plans (single image, carousel, reel).
- Accepts mixed media assets (images + short videos), with drag-and-drop reorderable asset management and automatic video metadata extraction for better planning.
- Supports multiple brand kits per user, with a kit selector in both the brand page and post brief form. Posts link to a specific brand kit.
- New posts default to the first available brand kit for that user (when one exists), so brand/prompt context and the kit's primary logo are prefilled consistently.
- Supports autosaved poster-canvas editing with drag/resize, direct text overrides, hide/show controls, custom text boxes, and PNG export.
- Streams LLM reasoning tokens in real time during generation, visible in the agent activity panel.
- Switches between saved posts with race-safe request handling and stable sidebar summaries to reduce UI flicker during refreshes.
- Sidebar post rows expose quick publish actions (`Post now`, `Post at`) in the context menu, in addition to archive/delete controls.
- Exposes Settings and Brand Kit management as full-screen modals from the main editor shell for quicker in-context workflow.
- Creates public, read-only project snapshots at `/share/<id>` with persisted project state (secured by unguessable IDs).
- Publishes directly to Instagram via Meta Graph API, or schedules publishing via a cron-backed Postgres queue.
- Surfaces a publish queue in the publish section so users can review queued/processing/failed jobs, cancel jobs, retry failed jobs immediately, and edit queued/failed publish details (caption, first comment, publish time, media URLs, image metadata, and reel feed-sharing) without leaving the editor.
- For single-image posts, supports Meta location search assist and click-to-place user tagging on the rendered poster preview, with numeric x/y fallback for fine tuning.
- For reels, supports choosing whether the publish should also appear on the main feed (`share_to_feed`), with the default remaining on.
- Automatically fails stale `processing` publish jobs after a timeout so abandoned work does not keep consuming publish-window capacity, and shows recent job activity directly in the queue UI.
- Enforces Meta Content Publishing throughput guardrails (50 published posts per rolling 24-hour window) for immediate publishes, and automatically defers queued jobs when the window is saturated.
- Runs media preflight checks before scheduling or publishing (public HTTPS URL requirement + remote content-type probing for image/video compatibility).
- Supports multi-model LLM configuration: connect multiple OpenAI and/or Anthropic keys simultaneously, reorder them by priority, and choose between Fallback mode (try models in order until one succeeds) or Parallel mode (query all models and merge/rank results). Environment-configured models auto-appear in the list.
- Provides an AI chat assistant panel for real-time conversation about content strategy, captions, and creative direction, with SSE-streamed responses and persistent conversation history.
- Enforces stricter API payload contracts for persisted post drafts/updates.
- Supports LLM BYOK (OpenAI or Anthropic) with encrypted credential storage and environment-variable fallback.
- Supports Meta OAuth account connection with encrypted token-at-rest handling and environment-variable fallback.

## Key Features

- Workspace login gate for all private pages and APIs; `/share/<id>` remains a public, read-only link.
- Postgres-backed persistent post workspace (create/select/archive/delete + autosave).
- Multi-model LLM generation pipeline with strict schema validation, supporting prioritized model lists with Fallback and Parallel execution modes.
- Deterministic fallback generation when no LLM credentials are available or all models fail.
- Website-style-aware prompts and optional brand autofill from a public site URL.
- Blob-backed storage for uploads, shared project snapshots, and outcome snapshots used for insights.
- Postgres-backed post drafts and publish jobs with enum-constrained workflow status (`draft/generated/published/scheduled/archived` for posts).

## Primary User Scenarios

1. Create a new post concept from a brief
   - Use the 3-column layout: browse posts (left), edit brief and preview (center), agent activity or chat (right).
   - Open Settings/Brand Kits from the top-right controls without leaving the editor.
   - Switch between Agent and Chat tabs in the right panel to monitor generation or converse with the AI assistant.
   - Select a brand kit (or use the default), choose one of that kit's named logos in the post brief, use the Asset Manager controls to attach assets, fill post inputs, generate variants, pick one, and export.

2. Build reusable campaign options
   - Compare 3 variant angles (single image / carousel / reel), copy caption bundles, iterate prompts, and fine-tune the canvas layout or copy without regenerating.

3. Collaborate asynchronously
   - Save a project snapshot and send a share link so teammates can review the selected concept.

4. Publish immediately
   - Connect Instagram via OAuth (or env credentials), then publish selected concept directly.
   - Optional metadata for image posts: search Meta places to fill `locationId`, or paste one manually, and place user tags visually on the rendered poster with x/y fallback fields.

5. Schedule approved content
   - Set a future publish time and let the cron worker publish when due.
   - Review and manage queued/failed jobs directly from the publish section.

6. Refine ideas with AI chat
   - Open the Chat tab in the right panel to brainstorm captions, get hashtag suggestions, or refine creative direction in a multi-turn conversation.

## Scope Boundaries

- Without `POSTGRES_URL` or `DATABASE_URL`, private post creation/loading is unavailable.
- Without `BLOB_READ_WRITE_TOKEN`, uploads and share snapshots are unavailable.
- Without Meta credentials (OAuth or env), Instagram publishing is unavailable.
- Without LLM credentials, generation still works via deterministic local fallback output. With multiple models configured, failures cascade through the priority list (Fallback mode) or are compensated by other models (Parallel mode).
