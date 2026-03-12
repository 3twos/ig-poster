# IG Poster Engine Overview

## Goals

- Turn a brand brief and post brief into publish-ready Instagram creative quickly.
- Keep creative output structured, editable, and reusable instead of one-off draft text.
- Support the full workflow from concept generation to export, sharing, and publishing.
- Enforce secure, internal-first access for teams using Google Workspace.
- Add a first-party CLI and versioned API surface for operator and agent workflows without duplicating server-side business logic.

## Capabilities

- Generates exactly 3 creative variants per request, including strategy rationale, caption, hashtags, and format-aware plans (single image, carousel, reel).
- Accepts mixed media assets (images + short videos), with drag-and-drop reorderable asset management and automatic video metadata extraction for better planning.
- For carousel variants, supports a dedicated composer strip with authoritative add/reorder/remove controls and feed-orientation switching (`square`, `portrait`, `landscape`) backed by persisted media-composition state.
- Supports multiple brand kits per user, with a kit selector in both the brand page and post brief form. Posts link to a specific brand kit.
- New posts default to the first available brand kit for that user (when one exists), so brand/prompt context and the kit's primary logo are prefilled consistently.
- Supports autosaved poster-canvas editing with drag/resize, direct text overrides, hide/show controls, custom text boxes, and PNG export.
- New generated layouts are now fit against the current overlay copy using deterministic safe-zone stacking, and the editor exposes an `Auto-fit Layout` recovery action for existing drafts.
- Refine now combines richer prompt context with deterministic post-processing for common instructions like shorter component copy, shorter captions, and removing CTA text, and successful refine updates now re-fit the canonical overlay stack to reduce overlap.
- Streams LLM reasoning tokens in real time during generation, visible in the agent activity panel, and exposes the exact assembled generation prompt used for each run.
- Switches between saved posts with race-safe request handling and stable sidebar summaries to reduce UI flicker during refreshes.
- Sidebar post rows expose quick publish actions (`Post now`, `Post at`) plus `Duplicate` in the context menu, in addition to archive/delete controls.
- Keeps the post lifecycle intentionally narrow: `draft`, `scheduled`, and `posted`, with posted posts locked from further edits or deletion and archivable instead.
- Exposes Settings and Brand Kit management as full-screen modals from the main editor shell for quicker in-context workflow.
- Creates public, read-only project snapshots at `/share/<id>` with persisted project state (secured by unguessable IDs).
- Publishes directly to Instagram via Meta Graph API, or schedules publishing via a cron-backed Postgres queue.
- Promotes caption editing into a persisted post-composer field, while keeping the generated caption bundle available as a one-click suggestion.
- Adds explicit lifecycle controls for `Move to draft`, `Duplicate post`, `Archive`, and a planner sheet for scheduled posts.
- Surfaces both a scheduled-post planner and a publish queue so users can review upcoming jobs, cancel or move them back to draft, retry failures, and edit queued/failed publish details without leaving the editor.
- Supports Meta location search assist plus structured user tagging for single-image posts, reels, and carousel image items, with per-item carousel tagging persisted in media-composition state.
- For reels, supports choosing whether the publish should also appear on the main feed (`share_to_feed`), with the default remaining on.
- Automatically fails stale `processing` publish jobs after a timeout so abandoned work does not keep consuming publish-window capacity, and shows recent job activity directly in the queue UI.
- Enforces Meta Content Publishing throughput guardrails (50 published posts per rolling 24-hour window) for immediate publishes, and automatically defers queued jobs when the window is saturated.
- Runs media preflight checks before scheduling or publishing (public HTTPS URL requirement + remote content-type probing for image/video compatibility).
- Supports multi-model LLM configuration: connect multiple OpenAI and/or Anthropic keys simultaneously, reorder them by priority, and choose between Fallback mode (try models in order until one succeeds) or Parallel mode (query all models and merge/rank results). Environment-configured models auto-appear in the list.
- Provides an AI chat assistant panel for real-time conversation about content strategy, captions, and creative direction, with SSE-streamed responses and persistent conversation history.
- Enforces stricter API payload contracts for persisted post drafts/updates.
- Supports LLM BYOK (OpenAI or Anthropic) with encrypted credential storage and environment-variable fallback.
- Supports Meta OAuth account connection with encrypted token-at-rest handling and environment-variable fallback.
- Ships an experimental `ig` CLI preview with profile-aware host/token config, repo-local project links, automatic browser auth bootstrap for interactive auth-required commands, explicit device-code login for headless environments, stable JSON envelopes with non-TTY auto-defaulting, `--flags-file` argument preloading, richer status summaries for linked-project/provider/quota visibility, macOS Keychain-backed refresh-token storage, shell completion output, raw API access, auth/status checks, asset upload, generation run/refine commands, chat prompts, direct publish/schedule commands, brand-kit lookup, core post read/write commands, directory watch ingestion, an MCP stdio adapter, and publish-job queue controls backed by `/api/v1/*`.
- Starts the Apple Photos ingestion path with a macOS-only `Add from Photos` entry point in the asset panel. Today that action stays web-first and falls back to the normal upload flow with clear remediation copy, while the native companion app and local bridge remain the next planned step for richer human and agent workflows.

## Key Features

- Workspace login gate for all private pages and APIs; `/share/<id>` remains a public, read-only link.
- Postgres-backed persistent post workspace (create/select/duplicate/archive/delete + autosave), including persisted carousel composition state and publish settings.
- Multi-model LLM generation pipeline with strict schema validation, supporting prioritized model lists with Fallback and Parallel execution modes.
- Deterministic fallback generation when no LLM credentials are available or all models fail.
- Website-style-aware prompts and optional brand autofill from a public site URL.
- Blob-backed storage for uploads, shared project snapshots, and outcome snapshots used for insights.
- Postgres-backed post drafts and publish jobs with enum-constrained workflow status (`draft/scheduled/posted` for posts, plus `archivedAt` as a soft-archive marker).
- Versioned API preview under `/api/v1/*` for authenticated CLI access (`auth/cli/start|exchange|poll|refresh|logout`, `auth/whoami`, `auth/sessions`, `status`, `assets upload`, `brand-kits list/get`, `chat`, `generate run/refine`, `meta/locations`, `publish`, `posts list|get|create|update|duplicate|archive`, `publish-jobs list|get|update`).

## Primary User Scenarios

1. Create a new post concept from a brief
   - Use the 3-column layout: browse posts (left), edit brief and preview (center), agent activity or chat (right).
   - Open Settings/Brand Kits from the top-right controls without leaving the editor.
   - Switch between Agent and Chat tabs in the right panel to monitor generation or converse with the AI assistant.
   - Select a brand kit (or use the default), choose one of that kit's named logos in the post brief, use the Asset Manager controls to attach assets, fill post inputs, generate variants, pick one, and export.

2. Build reusable campaign options
   - Compare 3 variant angles (single image / carousel / reel), edit the persisted post caption, duplicate a finished post into a new draft, reorder carousel media in the composer, and fine-tune the canvas layout or copy without regenerating.
   - Use `Refine` to revise copy while preserving the current editor layout/look unless you explicitly ask for visual changes. Common asks like "shorter components," "shorter caption," and "avoid CTA" are now enforced after the model step as well, and the refined overlay stack is re-fit to reduce collisions before it lands back in the editor. Use `Generate` when you want a full fresh result from the saved brief and assets, even if that means discarding prior manual/refine component edits.

3. Collaborate asynchronously
   - Save a project snapshot and send a share link so teammates can review the selected concept.

4. Publish immediately
   - Connect Instagram via OAuth (or env credentials), then publish selected concept directly.
   - For carousel variants, use the carousel composer to control which items are included, their order, and the feed orientation before publishing.
   - Optional metadata for image posts: search Meta places to fill `locationId`, or paste one manually, and place user tags visually on the rendered poster with x/y fallback fields.

5. Schedule approved content
   - Set a future publish time and let the cron worker publish when due.
   - Review scheduled posts from the planner, move them back to draft when needed, and use the queue for lower-level retry/edit diagnostics.
   - Once a post is posted, archive it to remove it from the main list or duplicate it to start a new editable version.

6. Refine ideas with AI chat
   - Open the Chat tab in the right panel to brainstorm captions, get hashtag suggestions, or refine creative direction in a multi-turn conversation.

7. Operate the service from the CLI
   - Use the preview `ig` CLI for host/profile config, repo-local project linking via `.ig-poster/project.json`, reusable argument bundles via `--flags-file`, status checks that summarize auth plus Meta/LLM/quota readiness, raw API calls, asset uploads, generation runs/refinements, linked-post chat prompts, direct publish/schedule requests, post management, shell completion generation, local-directory watch ingestion, MCP tool exposure over stdio, and publish-queue inspection/mutation against the same server-side workflows. In an interactive terminal, auth-required commands now launch the browser login flow automatically if no valid CLI session exists yet, while `ig auth login --device-code` and `--no-browser` support headless approval flows.

## Scope Boundaries

- Without `POSTGRES_URL` or `DATABASE_URL`, private post creation/loading is unavailable.
- Without `BLOB_READ_WRITE_TOKEN`, uploads and share snapshots are unavailable.
- Without Meta credentials (OAuth or env), Instagram publishing is unavailable.
- Without LLM credentials, generation still works via deterministic local fallback output. With multiple models configured, failures cascade through the priority list (Fallback mode) or are compensated by other models (Parallel mode).
- The CLI preview now supports browser-based login with refreshable CLI sessions, including automatic on-demand login bootstrap for auth-required commands in interactive terminals, plus explicit device-code login for headless environments. On macOS, refresh tokens are stored in the user Keychain by default; other environments still fall back to `~/.config/ig-poster/config.json` with restrictive local file permissions.
- CLI commands now emit stable `{ ok, data }` JSON envelopes in `--json` mode and auto-prefer that machine-readable output when stdout is not a TTY (except for `help`, `completion`, and `mcp`).
- A hidden dev-only `--local` flag pins the CLI to the local dev server host (`IG_POSTER_LOCAL_HOST` or `http://localhost:3000`) while still calling the same `/api/v1/*` service interfaces.
- The CLI preview can also store repo-local project defaults in `.ig-poster/project.json`, which currently cover linked host/profile plus optional brand-kit and output-directory preferences.
- Apple Photos support is still planned, not shipped. The approved direction is a web-first flow with a macOS companion app plus local bridge for Photos-only access, while the web app and versioned API remain the source of truth for auth, uploads, posts, generation, and publish state. If the companion is missing, the product should fall back to install guidance plus the normal upload flow rather than blocking the user.
