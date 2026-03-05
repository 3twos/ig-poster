# Developer Getting Started

## Prerequisites

- Node.js 20+ and npm.
- A Postgres database URL (`POSTGRES_URL` or `DATABASE_URL`) for persistent posts.
- A Google Workspace OAuth app for login.
- Optional but recommended for full local feature testing:
  - Vercel Blob token
  - Meta app credentials
  - OpenAI and/or Anthropic key

## Install and Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment Setup

### Required for core post workflow

- `POSTGRES_URL` or `DATABASE_URL` (either one is accepted)

### Required for login (minimum usable app)

- `GOOGLE_WORKSPACE_DOMAIN`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `WORKSPACE_AUTH_SECRET` (or `APP_ENCRYPTION_SECRET`)

### Recommended for generation quality

- `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` -- models configured via these env vars auto-appear in the multi-model list alongside any BYOK connections.
- Optional model overrides: `OPENAI_MODEL`, `ANTHROPIC_MODEL`

### Required for posts and brand kits

- `POSTGRES_URL` -- PostgreSQL connection string used by the app DB layer (Drizzle ORM). Run `npx drizzle-kit push` after schema changes.

### Required for upload/share/scheduling features

- `BLOB_READ_WRITE_TOKEN`

### Required for Instagram publish flow

- OAuth path:
  - `META_APP_ID`
  - `META_APP_SECRET`
  - `META_REDIRECT_URI`
- Env fallback path:
  - `INSTAGRAM_ACCESS_TOKEN`
  - `INSTAGRAM_BUSINESS_ID`

### Required for scheduled publish execution

- `CRON_SECRET`

## Local Validation

Fast inner loop during implementation:

```bash
npm run test:watch
# or quick one-shot checks
npm run check
```

Full pre-PR validation:

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

Run these before opening or updating a PR.

## Monitor Vercel Deployments

Use the monitor script for continuous status/alert monitoring while you work (stop with `Ctrl+C`):

```bash
# recommended: watch the latest deployment for a project
VERCEL_TOKEN=... VERCEL_PROJECT_ID=... ./scripts/monitor-vercel-deployment.sh --project-name "ig poster" --interval 5

# optional: watch a specific deployment continuously
./scripts/monitor-vercel-deployment.sh <deployment-id-or-url> --interval 5
```

Optional environment variables:
- `VERCEL_TOKEN` (recommended over `--token` for better shell-history hygiene)
- `VERCEL_PROJECT_ID` (for latest-deployment watcher mode)
- `VERCEL_PROJECT_SHORT_NAME` (optional short name for spoken alerts)
- `VERCEL_TEAM_ID` or `VERCEL_ORG_ID` (use for team-scoped deployments)

The script emits spoken alerts when possible (`say`, `spd-say`, or `espeak`). Completion duration format is seconds if under 1 minute, otherwise `mm:ss`.
Interactive runs use a non-scrolling dashboard by default; pass `--plain` for line-by-line log output.
Dashboard view now includes visual status/alert icons, friendly relative timestamps (for example `3m ago`), and a deployment-stage progress bar.
Dashboard and alerts explicitly distinguish Preview vs Production deployments and include the branch name.
Production voice alerts include a subtle two-hit beat before speech.

## Database Migration (Breaking)

- Post status is now backed by a PostgreSQL enum type (`post_status`).
- Apply migration SQL before deploying this branch:

```bash
psql "$POSTGRES_URL" -f drizzle/0001_blushing_zarda.sql
```

- If existing rows contain non-standard `posts.status` values, migration will fail until those rows are corrected.

## Project Map

- `src/app/page.tsx`: main editor page — composes a 3-column resizable layout from focused section components.
- `src/components/post-brief-form.tsx`: post brief fields, brand kit selector, generate/export buttons.
- `src/components/asset-manager.tsx`: drag-and-drop reorderable asset list (uses `@dnd-kit/sortable`).
- `src/components/agent-activity-panel.tsx`: agent run progress, step cards, LLM reasoning stream display.
- `src/components/app-status-bar.tsx`: footer status bar showing app version and current date-time (optionally hidden on pages that render their own fixed status controls).
- `src/components/settings-modal.tsx`: full-screen settings dialog (LLM connections, ordering, execution mode).
- `src/components/brand-kit-modal.tsx`: full-screen brand kit dialog (logo, palette, voice, prompt controls, kit CRUD).
- `src/components/poster-section.tsx`: poster preview wrapper with empty state.
- `src/components/strategy-section.tsx`: strategy text, variant tiles, caption bundles, refine controls.
- `src/components/publish-section.tsx`: share link, Instagram auth, schedule, publish form.
- `src/components/poster-preview.tsx`: poster renderer + editable overlay blocks.
- `src/components/chat/`: chat module — `chat-panel.tsx` (embeddable for right panel), `chat-container.tsx` (standalone with sidebar), `chat-messages.tsx`, `chat-message.tsx`, `chat-input.tsx`, `chat-markdown.tsx`, `chat-code-block.tsx`, `chat-thinking.tsx`, `chat-empty.tsx`, `chat-header.tsx`, `chat-sidebar.tsx`.
- `src/hooks/use-generation.ts`: SSE-based generation orchestration, agent run state, thinking token handling.
- `src/hooks/use-chat.ts`: chat message state, SSE streaming, send/stop/regenerate/edit.
- `src/hooks/use-chat-conversations.ts`: conversation list CRUD, active conversation selection.
- `src/lib/chat-types.ts`: Zod schemas for chat messages, conversations, and API requests.
- `src/lib/chat-stream.ts`: server-side LLM text streaming for chat (OpenAI + Anthropic).
- `src/lib/chat-store.ts`: Blob-backed conversation persistence with summary index.
- `src/lib/chat-system-prompt.ts`: chat system prompt builder with brand context injection.
- `src/lib/agent-types.ts`: agent run/step types and UI utility functions.
- `src/app/share/[id]/page.tsx`: shared project view.
- `src/app/settings/page.tsx` and `src/app/brand/page.tsx`: compatibility routes that redirect to `/` (settings and brand editing now live in modals from the main shell).
- `src/app/api/**/route.ts`: API endpoints for generation, auth, uploads, projects, publishing, and brand kit CRUD (`/api/brand-kits`).
- `src/db/schema.ts`: Drizzle ORM schema for `posts` and `brand_kits` tables.
- `src/lib/creative.ts`: generation schemas, prompt builders, fallback output.
- `src/lib/llm.ts`: provider adapters, structured JSON generation, streaming with thinking token callbacks, and `generateWithFallback` for multi-model Fallback execution.
- `src/lib/llm-auth.ts`: multi-model LLM credential persistence/resolution (`resolveAllLlmAuthFromRequest`, `listCredentialRecords`). Types: `MultiModelMode`, `LlmConnectionStatus`, `LlmMultiAuthStatus`, `ResolvedLlmAuthList`.
- `src/lib/meta.ts`: Meta Graph publishing primitives.
- `src/lib/meta-auth.ts`: Meta OAuth flow and credential resolution.
- `src/lib/workspace-auth.ts`: Google Workspace OAuth + session tokens.
- `src/proxy.ts`: Next.js 16 Proxy entrypoint for auth gate and canonical host redirect logic.

## Day-to-Day Dev Workflow

1. Create an isolated worktree + `codex/*` branch.
2. Run pre-flight `git status --short`.
3. Use `AGENTS.md` command permissions: common read/search/web commands are pre-approved, and write/update commands must stay inside the active repo/worktree. Shared Claude Code hooks and settings are tracked in `.claude/`.
4. Implement changes.
5. Run `npm run lint`, `npm run typecheck`, `npm run test:coverage`, and `npm run build`.
6. Update docs when behavior/architecture/dev workflow changes.
7. Commit, push, and open PR.
8. Wait for automatic Copilot review, address all comments, resolve all conversations, and clear merge conflicts before asking for merge approval.

## Common Implementation Notes

- All API inputs should be schema-validated with Zod.
- Prefer adding logic to `src/lib/*` and keeping route handlers thin.
- Keep LLM prompts and output constraints in `src/lib/creative.ts`.
- Preserve fallback behavior so generation still works without provider credentials.
- Chat and generation share the same LLM auth resolution (`resolveAllLlmAuthFromRequest`); both use SSE streaming patterns.
- For security-sensitive features, use existing encryption helpers and auth resolvers.
- For list-heavy UI state (for example `PostSummary[]`), preserve item identity during refreshes to reduce unnecessary re-renders/flicker.

## Troubleshooting for Developers

- Main page shows no posts and "Create post" fails:
  - Configure `POSTGRES_URL` or `DATABASE_URL` and restart the app.

- 401s on most routes:
  - Workspace session cookie missing/expired; re-run Google OAuth login.

- Upload/share/schedule endpoints return 503:
  - Blob is not configured (`BLOB_READ_WRITE_TOKEN` missing).

- LLM connect fails:
  - Key/model validation failed against provider API; check provider/model pairing.

- Model ordering not persisting:
  - Verify `PUT /api/auth/llm/reorder` is called with the desired `connectionOrder` and `mode` (`"fallback"` or `"parallel"`). The user-settings `aiConfig` stores these fields.

- Meta publish fails:
  - Verify OAuth connection, Instagram business account linkage, or env fallback credentials.
