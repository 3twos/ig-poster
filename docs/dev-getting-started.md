# Developer Getting Started

## Prerequisites

- Node.js 22.x and npm.
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

### Required for upload/share/outcomes features

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
npm run test:smoke
```

Full pre-PR validation:

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run build:cli
```

Run these before opening or updating a PR.

## Monitor CI Timings

Use the CI timing monitor to keep GitHub Actions fast and catch regressions against baseline:

```bash
# monitor PR CI timings for current branch and compare against main push runs
./scripts/monitor-ci-timing.sh --event pull_request --interval 20

# optional: monitor a specific workflow/branch with stricter regression threshold
./scripts/monitor-ci-timing.sh --workflow CI --branch main --regression-threshold 15
```

Useful options:
- `--repo <owner/repo>` (defaults from `origin`)
- `--workflow <name|id|file>` (default: `CI`)
- `--branch <branch>` and optional `--event <event>`
- `--baseline-branch <branch>` + `--baseline-event <event>` (defaults: `main`, `push`)
- `--window <count>` (default: 20)
- `--top-jobs <count>` (default: 6)
- `--regression-threshold <pct>` (default: 20)
- `--plain` for non-dashboard output

## Monitor Vercel Deployments

Use the monitor script for continuous status/alert monitoring while you work (stop with `Ctrl+C`):

```bash
# recommended: watch recent project deployments (parallel-aware)
VERCEL_TOKEN=... VERCEL_PROJECT_ID=... ./scripts/monitor-vercel-deployment.sh --project-name "ig poster" --interval 5

# optional: watch a specific deployment continuously
./scripts/monitor-vercel-deployment.sh <deployment-id-or-url> --interval 5
```

Optional environment variables:
- `VERCEL_TOKEN` (recommended over `--token` for better shell-history hygiene)
- `VERCEL_PROJECT_ID` (for project watcher mode)
- `VERCEL_PROJECT_SHORT_NAME` (optional short name for spoken alerts)
- `VERCEL_TEAM_ID` or `VERCEL_ORG_ID` (use for team-scoped deployments)

CLI options:
- `--max-deployments <count>` controls how many recent deployments are shown in project mode
- `--event-mode auto|stream|poll` controls stream-vs-poll event ingestion (default: `auto`)

The script emits spoken alerts when possible (`say`, `spd-say`, or `espeak`). Completion duration format is seconds if under 1 minute, otherwise `mm:ss`.
Interactive runs refresh the dashboard in place (without full-screen repaint/flicker) by default; pass `--plain` for line-by-line log output.
Dashboard view includes visual status/alert icons, friendly relative timestamps (for example `3m ago`), and richer per-deployment progress bars.
Project mode now tracks multiple deployments in parallel, with separate status, step, timing, and error details per deployment.
Each deployment row includes context fields (`pr`, `source`, `actor`, `commit`) and falls back to PR/commit/actor/source labels when branch metadata is missing (instead of showing only `unknown`).
Voice alerts are queued so multiple deployment events do not speak over each other.
Dashboard and alerts explicitly distinguish Preview vs Production deployments and include the branch name.
Production voice alerts include a subtle two-hit beat before speech.

## Database Migration

- Schema changes are tracked in `drizzle/*.sql`.
- Generate migration files after schema edits:

```bash
POSTGRES_URL="postgresql://check@localhost/check" npm run db:generate
```

- Apply migrations in your target environment before deploying app code that depends on them.

## Project Map

- `src/app/page.tsx`: main editor page — composes a 3-column resizable layout from focused section components.
- `src/components/post-brief-form.tsx`: post brief fields, brand kit + logo selectors, generate/export buttons.
- `src/components/asset-manager.tsx`: drag-and-drop reorderable asset list for post media (uses `@dnd-kit/sortable`).
- `src/components/carousel-composer.tsx`: authoritative carousel composer for included media order, add/remove controls, and feed orientation selection.
- `src/components/agent-activity-panel.tsx`: agent run progress, step cards, LLM reasoning stream display.
- `src/components/app-status-bar.tsx`: footer status bar showing app version and current date-time (optionally hidden on pages that render their own fixed status controls).
- `src/app/settings/page.tsx`: dedicated settings page with sidebar tabs (General, LLM Provider, Brand Kits). Section components live in `src/components/settings/`.
- `src/components/poster-section.tsx`: poster preview wrapper with empty state.
- `src/components/strategy-section.tsx`: strategy text, variant tiles, persisted post-caption editing, refine controls, and the canvas editor inspector (save state, text overrides, custom boxes).
- `src/components/publish-metadata-editor.tsx`: persisted publish metadata editor for first comment, location, reel feed-sharing, and per-asset user tags.
- `src/components/publish-section.tsx`: share link, Instagram auth, planner entry point, schedule/post controls, and the queued/failed publish queue.
- `src/components/scheduled-planner.tsx`: calendar-style scheduled-post surface with reschedule, open-post, cancel, and move-to-draft actions.
- `src/components/publish-job-queue.tsx`: queue viewer/editor with recent publish-job activity entries for diagnostics around retries, deferrals, and failures.
- `src/components/meta-location-search.tsx`: shared Meta place-search assist used by both the main publish form and queue editor.
- `src/components/poster-preview.tsx`: poster renderer, persisted overlay layout playback, carousel slide preview, adaptive logo chip, and editable overlay blocks.
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
- `src/app/api/**/route.ts`: API endpoints for generation, auth, uploads, projects, publishing (including `/api/meta/locations` for place search), and brand kit CRUD (`/api/brand-kits`).
- `src/app/api/v1/**/route.ts`: versioned API preview for the CLI (`auth/cli/start|exchange|refresh|logout`, `auth/whoami`, `auth/sessions`, `status`, `assets`, `brand-kits`, `brand-kits/:id`, `generate`, `generate/refine`, `meta/locations`, `publish`, `posts`, `posts/:id`, `posts/:id/duplicate`, `posts/:id/archive`, `publish-jobs`, `publish-jobs/:id`).
- `src/services/actors.ts`: transport-neutral actor resolution for bearer token and workspace-cookie auth.
- `src/services/auth/cli.ts`: CLI access-token issuance, refresh-session persistence, and session listing/revocation.
- `src/services/assets.ts`: extracted asset upload service functions used by both the browser upload route and the v1 API surface.
- `src/services/chat.ts`: extracted CLI chat prompt shaping and bearer-auth streaming helpers for `/api/v1/chat`.
- `src/services/generation.ts`: post-derived generation/refine request helpers used by the v1 generation routes.
- `src/services/posts.ts`: extracted post service functions used by the v1 API surface.
- `src/services/brand-kits.ts`: extracted brand-kit service functions used by the v1 API surface.
- `src/services/meta-auth.ts`: CLI-safe Meta auth resolution for bearer-auth publish and Meta place-search routes.
- `src/services/publish-jobs.ts`: extracted publish-job service functions used by the v1 API surface.
- `src/services/status.ts`: aggregated CLI status summaries for actor auth, Meta readiness, LLM providers, and publish-window usage.
- `src/cli/`: CLI source (`ig`) with config storage, repo-local project-link helpers, browser login helpers, global `--flags-file` expansion, macOS keychain-backed refresh-token storage, shell completion output, raw API access, auth/session commands, asset upload commands, generation commands, chat commands, direct publish commands, brand-kit commands, post commands, and queue commands.
- `src/db/schema.ts`: Drizzle ORM schema for `posts`, `brand_kits`, and `publish_jobs` tables (including ordered named brand-kit logos, persisted `mediaComposition` and `publishSettings` on posts, optional `first_comment`, `location_id`, and `user_tags` publish metadata fields, while reel `shareToFeed` lives inside the persisted post settings and scheduled-job `media` payload).
- `src/lib/creative.ts`: generation schemas, prompt builders, fallback output.
- `src/lib/media-composer.ts`: persisted carousel composition schema plus orientation/aspect-ratio reconciliation helpers.
- `src/lib/llm.ts`: provider adapters, structured JSON generation, streaming with thinking token callbacks, and `generateWithFallback` for multi-model Fallback execution.
- `src/lib/llm-auth.ts`: multi-model LLM credential persistence/resolution (`resolveAllLlmAuthFromRequest`, `listCredentialRecords`). Types: `MultiModelMode`, `LlmConnectionStatus`, `LlmMultiAuthStatus`, `ResolvedLlmAuthList`.
- `src/lib/meta.ts`: Meta Graph publishing primitives plus place-search helper for location assist and reel `share_to_feed` handling.
- `src/lib/publish-jobs.ts`: publish-job persistence helpers, retry/defer logic, and stale-processing recovery used by cron hardening.
- `src/lib/meta-media-preflight.ts`: publish-time media URL compliance checks (public HTTPS validation + content-type probing).
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

## CLI Preview Workflow

Build and inspect the preview CLI locally:

```bash
npm run build:cli
npm run cli -- help
```

The CLI reads profile state from `~/.config/ig-poster/config.json` by default. Override that location in tests or isolated runs with `IG_POSTER_CONFIG_DIR=/tmp/ig-poster-cli`. On macOS, browser-login refresh tokens are written to Keychain unless you set `IG_POSTER_DISABLE_KEYCHAIN=1`.

In an interactive terminal, auth-required commands now bootstrap browser login automatically when no valid CLI session exists. Non-interactive usage still requires a saved session or `IG_POSTER_TOKEN`.

Repo-local defaults can also be linked in `.ig-poster/project.json`:

```bash
npm run cli -- link --profile staging --brand-kit bk_123
npm run cli -- status
```

Start the app locally in one terminal:

```bash
npm run dev
```

Then test the CLI from another terminal:

```bash
export IG_POSTER_CONFIG_DIR=/tmp/ig-poster-cli
npm run cli -- status --json
npm run cli -- auth status --json
npm run cli -- auth sessions list
npm run cli -- publish --image https://cdn.example.com/poster.png --caption "Launch day" --dry-run
npm run cli -- generate run --post <post-id> --stream-json
npm run cli -- chat ask --post <post-id> "Give me three stronger hooks for this draft"
npm run cli -- --flags-file .ig-poster/release.flags
npm run cli -- posts list
```

The first auth-required command above should open the browser automatically if the CLI is not logged in yet. If the browser cannot be opened automatically, the CLI prints the login URL so you can open it manually. You can still run `npm run cli -- auth login` explicitly when you want to pre-authenticate ahead of time.

Manual bearer bootstrap is still available when you need it:

```bash
printf '%s' "$IG_POSTER_TOKEN" | npm run cli -- auth login --token-stdin
```

Current limitation: device-code login is still pending. On non-macOS platforms, or when `IG_POSTER_DISABLE_KEYCHAIN=1` is set, refresh tokens still fall back to `~/.config/ig-poster/config.json` (mode `0600`).

The CLI also supports `--flags-file <path>` as a global option. Supported formats:
- JSON array of strings when you need spaces inside values.
- Newline-delimited tokens for simple argument lists (blank lines and `#` comments are ignored).

Supported preview commands today:
- `ig status`
- `ig status --json`
- `ig auth login|logout|status|test`
- `ig auth sessions list|revoke`
- `ig assets upload <file...> [--folder <assets|videos|logos|renders>]`
- `ig brand-kits list|get`
- `ig chat ask [--post <id>] [--message <text|@file|->] <message>`
- `ig config list|get|set`
- `ig generate run [--post <id> | --request @generate.json]`
- `ig generate refine --post <id> --instruction <text>`
- `ig link [--host <url>] [--profile <name>] [--brand-kit <id>] [--output-dir <path>]`
- `ig unlink`
- `ig completion <bash|zsh|fish>`
- `ig publish (--image <url> | --video <url> | --carousel <url,...>) (--caption <text> | --caption-file <file>)`
- `ig api <METHOD> <PATH>`
- `ig posts list|get|create|update|duplicate|archive`
- `ig queue list|get|cancel|retry|move-to-draft|update`

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

- Upload/share endpoints return 503:
  - Blob is not configured (`BLOB_READ_WRITE_TOKEN` missing).

- LLM connect fails:
  - Key/model validation failed against provider API; check provider/model pairing.

- Model ordering not persisting:
  - Verify `PUT /api/auth/llm/reorder` is called with the desired `connectionOrder` and `mode` (`"fallback"` or `"parallel"`). The user-settings `aiConfig` stores these fields.

- Meta publish fails:
  - Verify OAuth connection, Instagram business account linkage, or env fallback credentials.
