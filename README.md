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
- BYOK stores encrypted provider keys in private Postgres (`DATABASE_URL`); browser only keeps a short connection-id cookie
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
ANTHROPIC_MODEL=claude-sonnet-4-20250514
GOOGLE_WORKSPACE_DOMAIN=3twos.com
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
WORKSPACE_AUTH_PRODUCTION_HOST=
WORKSPACE_AUTH_PREVIEW_HOST=
WORKSPACE_AUTH_SECRET=
DATABASE_URL=
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
- `POST /api/auth/llm/connect` uses `APP_ENCRYPTION_SECRET`, `META_APP_SECRET`, or `WORKSPACE_AUTH_SECRET` for encryption. If `DATABASE_URL` is configured, BYOK credentials are stored encrypted in private Postgres; otherwise they are stored in an encrypted `httpOnly` cookie fallback.
- `GOOGLE_WORKSPACE_DOMAIN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `WORKSPACE_AUTH_SECRET` are required for app login.
- `DATABASE_URL` is recommended for private persistent credential storage (LLM + Meta OAuth connection records).
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
- For Meta OAuth connect, set `META_APP_ID`, `META_APP_SECRET`, and `META_REDIRECT_URI`. `DATABASE_URL` is required for persistent OAuth connections and scheduled OAuth publishing.
- In production, set one of `APP_ENCRYPTION_SECRET`, `META_APP_SECRET`, or `WORKSPACE_AUTH_SECRET` to encrypt OAuth/BYOK tokens at rest.
- In local/preview environments with no configured encryption secret, the app uses a process-scoped runtime fallback secret; restarting the server invalidates previously encrypted OAuth/BYOK credentials and you may need to reconnect.
- `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_BUSINESS_ID` remain supported as env fallback credentials.

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
- Runs lint + build on PRs and pushes

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
