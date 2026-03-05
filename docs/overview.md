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
- Supports drag-and-resize text overlay editing on the poster canvas, then PNG export.
- Streams LLM reasoning tokens in real time during generation, visible in the agent activity panel.
- Creates public, read-only project snapshots at `/share/<id>` with persisted project state (secured by unguessable IDs).
- Publishes directly to Instagram via Meta Graph API, or schedules publishing via a cron-backed queue.
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
- Blob-backed storage for uploads, shared project snapshots, and scheduled publish jobs.
- Postgres-backed post drafts with enum-constrained workflow status (`draft/generated/published/scheduled/archived`).

## Primary User Scenarios

1. Create a new post concept from a brief
   - Use the 3-column layout: browse posts (left), edit brief and preview (center), agent activity or chat (right).
   - Switch between Agent and Chat tabs in the right panel to monitor generation or converse with the AI assistant.
   - Select a brand kit (or use the default), use the Asset Manager controls to attach assets/logo (replace/remove supported for logo), fill post inputs, generate variants, pick one, and export.

2. Build reusable campaign options
   - Compare 3 variant angles (single image / carousel / reel), copy caption bundles, and iterate prompts.

3. Collaborate asynchronously
   - Save a project snapshot and send a share link so teammates can review the selected concept.

4. Publish immediately
   - Connect Instagram via OAuth (or env credentials), then publish selected concept directly.

5. Schedule approved content
   - Set a future publish time and let the cron worker publish when due.

6. Refine ideas with AI chat
   - Open the Chat tab in the right panel to brainstorm captions, get hashtag suggestions, or refine creative direction in a multi-turn conversation.

## Scope Boundaries

- Without `POSTGRES_URL` or `DATABASE_URL`, private post creation/loading is unavailable.
- Without `BLOB_READ_WRITE_TOKEN`, uploads, sharing, and scheduling are unavailable.
- Without Meta credentials (OAuth or env), Instagram publishing is unavailable.
- Without LLM credentials, generation still works via deterministic local fallback output. With multiple models configured, failures cascade through the priority list (Fallback mode) or are compensated by other models (Parallel mode).
