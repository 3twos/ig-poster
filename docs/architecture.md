# IG Poster Engine Architecture

## Architecture Goals

- Keep the product usable even when optional integrations are missing.
- Enforce strict input/output contracts for AI and publishing workflows.
- Keep credential handling encrypted and server-side.
- Use Postgres (via Drizzle ORM) for relational app state (posts, brand kits, private credentials) while keeping Blob for binary assets and snapshots.
- Preserve data integrity across auth, generation, and publishing workflows.
- Use Postgres (via Drizzle ORM) for relational app state (posts, brand kits, private credentials) while keeping Blob for binary assets and snapshots.

## System Overview

```mermaid
flowchart LR
  U["Browser UI (`/`)"] --> API["Next.js Route Handlers (`/api/*`)"]
  U --> SHARE["Share Page (`/share/:id`)"]
  API --> CREATIVE["Creative + Prompt Pipeline (`src/lib/creative.ts`)"]
  API --> LLM["LLM Adapter (`src/lib/llm.ts`)"]
  API --> META["Meta Publisher (`src/lib/meta.ts`)"]
  API --> CHAT["Chat Streaming (`src/lib/chat-stream.ts`)"]
  API --> PG["Postgres (posts, brand_kits, credentials)"]
  API --> BLOB["Vercel Blob Storage"]
  CRON["Vercel Cron (`/api/cron/publish`)"] --> BLOB
  CRON --> META
  MW["Proxy Middleware (`src/proxy.ts`)"] --> U
  MW --> API
```

## Runtime and Layers

- App framework: Next.js App Router (Node runtime for server routes that need Node APIs).
- Next.js 16 auth gate entrypoint uses `src/proxy.ts` (Proxy file convention), which is executed as middleware.
- UI layer:
  - `src/app/page.tsx` is the primary editor page, composing a 3-column resizable layout (posts list, editing content, agent activity or chat) using `react-resizable-panels`. The right panel has Agent/Chat tab switching.
  - Extracted focused components: `post-brief-form.tsx`, `asset-manager.tsx`, `poster-section.tsx`, `strategy-section.tsx`, `publish-section.tsx`, `agent-activity-panel.tsx`.
  - `src/components/chat/` contains the chat module: `chat-panel.tsx` (embeddable right-panel version), `chat-container.tsx` (full standalone with sidebar), message rendering, markdown, code blocks, and input components.
  - `src/hooks/use-generation.ts` encapsulates SSE-based generation state, including LLM thinking token streaming.
  - `src/hooks/use-chat.ts` manages chat message state, SSE streaming, and conversation operations.
  - `src/lib/agent-types.ts` defines agent run/step types and UI utility functions.
  - `src/app/share/[id]/page.tsx` is read-only project playback.
  - `src/components/poster-preview.tsx` renders and edits overlay layouts.
- API layer:
  - Route handlers in `src/app/api/**/route.ts`.
  - Zod schemas enforce request and response validity.
- Data layer:
  - `src/db/schema.ts` defines relational post records.
  - `src/db/index.ts` resolves `POSTGRES_URL` with `DATABASE_URL` fallback.
- Domain layer (`src/lib/*`):
  - creative generation schemas + prompt builders
  - LLM provider abstraction
  - auth/session/token helpers
  - Meta Graph publish/schedule orchestration
  - Blob storage wrappers

## Request and Data Flows

### 1) Post Workspace (Core App State)

1. Client loads `GET /api/posts` to populate sidebar.
2. Client creates/selects posts through `POST/GET /api/posts*`.
3. Client autosaves edits with `PUT /api/posts/:id` (debounced + beforeunload keepalive).
4. Server persists post state in Postgres.

Why this shape:
- Keeps long-lived drafts out of browser memory and enables multi-post workflow.
- Supports reliable autosave and recent-post retrieval per authenticated workspace user.

### 2) Generate Creative

1. Client submits brand/post/assets to `POST /api/generate`.
2. Request is validated with `GenerationRequestSchema`.
3. Server resolves all available LLM connections via `resolveAllLlmAuthFromRequest`, which merges BYOK connections with environment-configured models into a `ResolvedLlmAuthList`.
4. Server optionally extracts website style context (`buildWebsiteStyleContext`).
5. Based on the user's selected `MultiModelMode`:
   - **Fallback**: `generateWithFallback` tries each model in priority order; the first successful response is used.
   - **Parallel**: all models are queried simultaneously, and results are merged and ranked.
   LLM thinking/reasoning tokens are forwarded to the client as `llm-thinking` SSE events.
6. Response is validated with `GenerationResponseSchema`.
7. If all models fail, fallback response generator returns deterministic variants.

Why this shape:
- Schema-first contracts reduce malformed LLM output risk.
- Fallback response keeps the core workflow available during outages or unconfigured environments.

### 3) Share Project

1. Client renders selected poster to PNG.
2. `POST /api/projects/save` stores validated payload as `projects/<id>.json` in Blob.
3. App returns share URL `/share/<id>`.
4. Share page loads data via `GET /api/projects/:id`.

Why this shape:
- Blob-backed JSON is enough for immutable share snapshots.
- No relational DB needed for current lookup pattern (`id -> single project`).

### 4) Publish / Schedule

1. Client submits caption + media payload to `POST /api/meta/schedule`.
2. Route resolves auth context (OAuth connection first, env fallback second).
3. If `publishAt` is >2 minutes in the future, route stores a scheduled job in Blob.
4. Otherwise route publishes immediately through Meta Graph API helpers.
5. Cron route (`GET /api/cron/publish`) scans due jobs, resolves auth, publishes, and deletes successful jobs.

Why this shape:
- Separates interactive request latency from scheduled execution.
- Keeps scheduling stateless beyond durable queue records in Blob.

### 4) Chat Conversations

1. Client sends a message to `POST /api/chat` with conversation history and model config.
2. Server streams the response as SSE events (`token`, `done`, `error`, `heartbeat`) using the same LLM auth resolution as generation.
3. Conversation CRUD is handled by `/api/chat/conversations` (list/create) and `/api/chat/conversations/[id]` (get/update/delete).
4. `POST /api/chat/title` auto-generates a short title for new conversations.
5. Conversations are persisted to Blob at `chat/<ownerHash>/conversations/<id>.json` with a summary index at `chat/<ownerHash>/index.json` for fast sidebar listing.

Why this shape:
- Client-sends-history pattern keeps the streaming API stateless and avoids blob read latency on every message.
- Summary index blob prevents N+1 fetches when listing conversations.

## Authentication and Authorization Model

### Workspace Access Gate

- `src/proxy.ts` (Next.js 16 Proxy entrypoint) enforces login for non-public routes.
- Sessions are signed JWTs in `workspace_session` cookie.
- OAuth flow:
  - start: `/api/auth/google/start`
  - callback: `/api/auth/google/callback`
  - status: `/api/auth/google/status`
  - logout: `/api/auth/google/logout`
- Domain restriction uses `GOOGLE_WORKSPACE_DOMAIN`.

### Instagram Auth

- Preferred path: Meta OAuth (`/api/auth/meta/*`), storing encrypted access token in Blob.
- Fallback path: env credentials (`INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ID`).
- Runtime resolver returns a uniform `MetaAuthContext` to publishing code.

### LLM Auth (Multi-Model)

- Users can connect multiple BYOK credentials via `/api/auth/llm/connect`, each identified by a unique `connectionId`.
- Model priority order and execution mode (Fallback or Parallel) are saved via `PUT /api/auth/llm/reorder`.
- The disconnect endpoint (`/api/auth/llm/disconnect`) accepts a `connectionId` to remove a specific model.
- The status endpoint (`/api/auth/llm/status`) returns a multi-model response (`LlmMultiAuthStatus`) containing `connections[]`, `mode`, and ordering info.
- Stored encrypted:
  - DB-backed records (via `listCredentialRecords`) when `DATABASE_URL` is configured.
  - Encrypted cookie payload fallback when the database is not available.
- Environment-configured models (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) auto-appear in the resolved model list alongside BYOK connections.
- Key types: `MultiModelMode`, `LlmConnectionStatus`, `LlmMultiAuthStatus`, `ResolvedLlmAuthList`.
- Key functions: `resolveAllLlmAuthFromRequest` (merges all sources into a prioritized list), `generateWithFallback` (tries models in order), `listCredentialRecords` (enumerates stored connections).

## Storage Model

- Primary relational persistence: Postgres via Drizzle ORM (`posts`, `brand_kits`, private credentials).
  - `posts` table: post drafts, briefs, generation results, publish history, brand kit linkage (`brandKitId`).
  - `brand_kits` table: per-user brand kits with name, brand fields, prompt config, logo URL, and default flag.
- Blob persistence: binary media, shared project snapshots, scheduled publish queue, and chat conversation blobs.
- Typical paths:
  - uploads: `assets/`, `videos/`, `logos/`, `renders/`
  - shared projects: `projects/<id>.json`
  - schedule queue: `schedules/<publishAt>-<id>.json`
  - chat conversations: `chat/<ownerHash>/conversations/<id>.json`
  - chat index: `chat/<ownerHash>/index.json`
- Cookies store lightweight identifiers/tokens, not raw long-lived secrets.
- `posts.status` is constrained to PostgreSQL enum `post_status` (`draft`, `generated`, `published`, `scheduled`, `archived`).

## Security Posture

- Input validation: Zod at route boundaries.
- Secret handling:
  - encryption at rest for OAuth and BYOK credentials
  - explicit secret resolution with production enforcement
- OAuth hardening:
  - state/nonce checks
  - timing-safe state comparison for Meta callback
- Website style extraction hardening:
  - protocol restrictions
  - host/IP safety checks to block private-network SSRF
  - redirect hop limits, timeout, and HTML size caps
- Middleware enforces auth and optional canonical-host redirects.

## Reliability and Failure Handling

- Generation: in Fallback mode, provider errors cascade to the next model in priority order before degrading to deterministic fallback output. In Parallel mode, partial model failures are tolerated as long as at least one model succeeds.
- Publishing: route returns detailed error context; scheduled failures are reported in cron response.
- Scheduling: cron paginates schedule blobs (up to configured max), sorts by timestamped pathname, publishes due jobs, and deletes successful jobs.
- Failed jobs remain for retry/inspection.
- Post workspace APIs require Postgres and return errors when neither `POSTGRES_URL` nor `DATABASE_URL` is configured.
- Blob-dependent features return clear 503 errors when storage is not configured.

## Deployment and Operations

- CI checks: lint + typecheck + test coverage + build.
- Hosting: Vercel deployment + Vercel cron.
- Cron endpoint auth: `Authorization: Bearer <CRON_SECRET>`.
- Canonical host redirect controls:
  - `WORKSPACE_AUTH_PRODUCTION_HOST`
  - `WORKSPACE_AUTH_PREVIEW_HOST`

## Tradeoffs and Future Work

- Blob-as-store is simple and low-overhead for media and snapshots, but job querying/analytics are limited at scale.
- Scheduling scans recent blobs; high-volume workloads may need a dedicated queue.
- Share artifacts are immutable snapshots; future requirements may need versioned edits.
- As usage grows, consider introducing:
  - background workers with dead-letter handling
  - observability around generation/publish success rates
