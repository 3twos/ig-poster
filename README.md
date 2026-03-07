# IG Poster Engine

SOTA Instagram poster app built for production with:
- Next.js 16 App Router
- TypeScript
- Tailwind CSS v4
- Provider-agnostic structured generation (OpenAI + Anthropic)
- Vercel Blob storage
- Meta Graph API publishing + OAuth connect
- Google Workspace login gate (internal app)
- GitHub Actions + Vercel deployment workflow

## What It Does

Input:
- Brand kit (values, principles, visual system, voice, story, palette, logo notes)
- Post brief (theme, subject, thought, objective, audience, mood)
- Mixed media asset set (images + short video) + logo

Output:
- 3 high-impact creative variants
- Strategy rationale
- Caption + hashtag bundle
- Prompt controls (system addendum + campaign instructions)
- Live poster preview
- Draggable/resizable text canvas editor
- PNG export
- Workspace project URL (requires login)
- Publish now or schedule to Instagram
- Connect/disconnect Instagram via Meta OAuth
- Format-aware planning: single image, carousel, and reel edit blueprint

## Implemented SOTA Steps

1. Persistent media storage and share links
- Uploads images/logos/renders to Vercel Blob
- Saves project snapshots in Blob
- Generates project links at `/share/:id` (workspace login required)

2. Editable drag/resize overlay canvas
- Toggle editor mode in the right panel
- Move and resize hook/headline/body/cta text blocks
- Save overlay positions per concept and include in shared snapshots

3. One-click Meta publish integration + scheduler
- Publish immediately via Meta Graph API (image, carousel, reel)
- Optional future schedule stored in Blob
- Vercel Cron endpoint (`/api/cron/publish`) executes due jobs every 15 minutes

4. Meta OAuth account connect
- `GET /api/auth/meta/start` starts OAuth with Facebook/Instagram
- `GET /api/auth/meta/callback` completes token exchange and stores encrypted connection
- `GET /api/auth/meta/status` returns active connection status
- `POST /api/auth/meta/disconnect` clears session connection

5. Intelligent IG Poster LLM architecture
- User can connect OpenAI or Anthropic subscription key (BYOK)
- BYOK stores encrypted provider keys in private Postgres (`POSTGRES_URL` or `DATABASE_URL`); browser only keeps a short connection-id cookie
- Env fallback still supported (`OPENAI_*` or `ANTHROPIC_*`)
- Generation uses explicit system prompt + customizable prompt addendum/instructions

6. Google Workspace authentication gate
- Requires Google Workspace sign-in before loading pages or non-exempt APIs
- Restricts access to one Workspace domain (`GOOGLE_WORKSPACE_DOMAIN`)
- Adds sign-out/session status endpoints for browser session control

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Node runtime: `>=20.9.0`.

## Environment Variables

Create `.env.local` from `.env.example`:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
GOOGLE_WORKSPACE_DOMAIN=3twos.com
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
WORKSPACE_AUTH_PRODUCTION_HOST=
WORKSPACE_AUTH_PREVIEW_HOST=
WORKSPACE_AUTH_SECRET=
DATABASE_URL=
POSTGRES_URL=
BLOB_READ_WRITE_TOKEN=
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_BUSINESS_ID=
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=
APP_ENCRYPTION_SECRET=
META_GRAPH_VERSION=v22.0
CRON_SECRET=
```

Notes:
- Without a connected provider key (or env fallback key), generation falls back to deterministic local concepts.
- `POST /api/auth/llm/connect` uses `APP_ENCRYPTION_SECRET`, `META_APP_SECRET`, or `WORKSPACE_AUTH_SECRET` for encryption. If `POSTGRES_URL` or `DATABASE_URL` is configured, BYOK credentials are stored encrypted in private Postgres; otherwise they are stored in an encrypted `httpOnly` cookie fallback.
- `GOOGLE_WORKSPACE_DOMAIN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `WORKSPACE_AUTH_SECRET` are required for app login.
- `DATABASE_URL` is recommended for private persistent credential storage (LLM + Meta OAuth connection records).
- `POSTGRES_URL` is required for post draft persistence (`/api/posts*`) and should point to the same private Postgres instance.
- Provision DB schema before first credential write (recommended for least-privilege DB users):
  ```sql
  CREATE TABLE IF NOT EXISTS ig_poster_private_credentials (
    namespace TEXT NOT NULL,
    credential_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (namespace, credential_id)
  );
  ```
- `GOOGLE_OAUTH_REDIRECT_URI` is optional (defaults to `<origin>/api/auth/google/callback`).
- `WORKSPACE_AUTH_PRODUCTION_HOST` is optional and lets middleware redirect raw production deployment URLs to your stable production alias before auth.
- `WORKSPACE_AUTH_PREVIEW_HOST` is optional and lets middleware redirect raw preview deployment URLs to a stable preview alias before auth.
- Without `BLOB_READ_WRITE_TOKEN`, uploads/share links/scheduling are unavailable.
- For Meta OAuth connect, set `META_APP_ID`, `META_APP_SECRET`, and `META_REDIRECT_URI`. `POSTGRES_URL` or `DATABASE_URL` is required for persistent OAuth connections and scheduled OAuth publishing.
- In production, set one of `APP_ENCRYPTION_SECRET`, `META_APP_SECRET`, or `WORKSPACE_AUTH_SECRET` to encrypt OAuth/BYOK tokens at rest.
- In local/preview environments with no configured encryption secret, the app uses a process-scoped runtime fallback secret; restarting the server invalidates previously encrypted OAuth/BYOK credentials and you may need to reconnect.
- `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_BUSINESS_ID` remain supported as env fallback credentials.

Fast local iteration:

```bash
npm run test:watch
# or quick gate
npm run check
```

Full validation before PR:

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

Breaking DB migration in this branch:

```bash
psql "$POSTGRES_URL" -f drizzle/0001_blushing_zarda.sql
```

## API Endpoints

- `POST /api/generate`: Generate 3 creative variants
- `POST /api/assets/upload`: Upload image/logo/render to Blob
- `POST /api/projects/save`: Save shareable project snapshot
- `GET /api/projects/:id`: Load shared project snapshot
- `POST /api/meta/schedule`: Publish now or schedule Instagram post
- `GET /api/cron/publish`: Cron executor for due scheduled posts
- `GET /api/auth/llm/status`: Current LLM provider source/status
- `POST /api/auth/llm/connect`: Connect OpenAI/Anthropic key
- `POST /api/auth/llm/disconnect`: Disconnect saved LLM key
- `GET /api/auth/google/start`: Begin Google Workspace OAuth
- `GET /api/auth/google/callback`: Google Workspace OAuth callback
- `GET /api/auth/google/status`: Read current Workspace session
- `POST /api/auth/google/logout`: Clear Workspace session
- `GET /api/auth/meta/start`: Begin Meta OAuth
- `GET /api/auth/meta/callback`: OAuth callback
- `GET /api/auth/meta/status`: Current auth source/status
- `POST /api/auth/meta/disconnect`: Disconnect OAuth session

## Research Notes

Comprehensive research notes for Instagram growth mechanics + vineyard/wine compliance live here:
- `docs/instagram-playbook-2026-03-03.md`
- `docs/intelligent-ig-poster-competitive-research-2026-03-03.md`

## Planning Docs

- `docs/ai-leverage-roadmap-2026-03-03.md`

## GitHub + Vercel CI/CD

### GitHub CI (quality gates)
- Workflow: `.github/workflows/ci.yml`
- Runs lint + typecheck + test coverage + build on PRs and pushes

### CI timing monitor
Use the CI timing monitor to watch queue/exec/total durations and detect regressions against `main`:

```bash
# monitor current branch PR runs and compare to main push baseline
./scripts/monitor-ci-timing.sh --event pull_request --interval 20

# monitor a specific branch/workflow and tighten regression threshold
./scripts/monitor-ci-timing.sh --workflow CI --branch main --regression-threshold 15
```

Key options:
- `--repo <owner/repo>` (defaults from `origin` remote)
- `--workflow <name|id|file>` (default: `CI`)
- `--branch <branch>` + optional `--event <event>`
- `--baseline-branch <branch>` + `--baseline-event <event>` (defaults: `main`, `push`)
- `--window <count>` (default: 20 recent runs)
- `--top-jobs <count>` (default: 6 slowest jobs shown)
- `--regression-threshold <pct>` (default: 20)
- `--plain` for line-by-line logs instead of dashboard

### Vercel deployment workflow
- Workflow: `.github/workflows/vercel.yml`
- PRs deploy Preview
- `main` pushes deploy Production

Required GitHub repository secrets:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Quick setup with `gh`:

```bash
# 1) create a Vercel token in Vercel dashboard (Account -> Tokens)
gh secret set VERCEL_TOKEN --repo 3twos/ig-poster --body "<your_vercel_token>"

# 2) get IDs from Vercel project settings (or .vercel/project.json after `vercel link`)
gh secret set VERCEL_ORG_ID --repo 3twos/ig-poster --body "<your_org_id>"
gh secret set VERCEL_PROJECT_ID --repo 3twos/ig-poster --body "<your_project_id>"
```

After these are set, pushes to `main` auto-deploy production and PRs auto-deploy preview.

Monitor deployments continuously from your terminal (stop with `Ctrl+C`):

```bash
# watch recent project deployments (parallel-aware, recommended for day-to-day alerting)
VERCEL_TOKEN=... VERCEL_PROJECT_ID=... ./scripts/monitor-vercel-deployment.sh --project-name "ig poster" --interval 5

# watch one specific deployment id/url continuously
./scripts/monitor-vercel-deployment.sh <deployment-id-or-url> --interval 5
```

Environment options:
- `VERCEL_TOKEN` (recommended over `--token` for better shell-history hygiene)
- `VERCEL_PROJECT_ID` (for project watcher mode)
- `VERCEL_PROJECT_SHORT_NAME` (optional short name for spoken alerts)
- `VERCEL_TEAM_ID` or `VERCEL_ORG_ID` (optional, for team-scoped deploys)

CLI options:
- `--max-deployments <count>` controls how many recent deployments are shown in project mode
- `--event-mode auto|stream|poll` controls stream-vs-poll event ingestion (default: `auto`)

The monitor announces completion/failure in the terminal and uses spoken alerts (via `say`/`spd-say`/`espeak` if available). Completion duration is formatted as seconds when under 1 minute, otherwise `mm:ss`.
In an interactive terminal it refreshes the dashboard in place (without full-screen repaint/flicker) by default; use `--plain` for line-by-line logs.
Dashboard view includes visual status/alert icons, friendly relative timestamps (for example `3m ago`), and richer per-deployment progress bars.
Project mode now tracks multiple deployments in parallel, with separate status, step, timing, and error details per deployment.
Each deployment row includes context fields (`pr`, `source`, `actor`, `commit`) and falls back to PR/commit/actor/source labels when branch metadata is missing (instead of showing only `unknown`).
Voice alerts are queued so multiple deployment events do not speak over each other.
Preview vs Production and branch name are explicitly labeled in the dashboard and alerts.
Production voice alerts include a subtle two-hit beat before speech.

## Vercel Cron

Cron is configured in `vercel.json`:
- `*/15 * * * *` -> `/api/cron/publish`

Set `CRON_SECRET` in Vercel env; Vercel sends it as `Authorization: Bearer <CRON_SECRET>`.

## Parallel Agent Workflow

Use git worktrees so multiple agents can run in parallel without branch collisions:

```bash
# create isolated branch + worktree
./scripts/new-agent-worktree.sh <agent-name> main

# remove when finished
./scripts/remove-agent-worktree.sh <worktree-path>
```

Branch naming uses `codex/<agent>-<timestamp>` to keep PRs traceable.

## Repo Bootstrap (already applied for this project)

```bash
gh repo create 3twos/ig-poster --source=. --remote=origin --public --push
```
