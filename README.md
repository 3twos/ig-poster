# IG Poster Engine

SOTA Instagram poster app built for production with:
- Next.js 16 App Router
- TypeScript
- Tailwind CSS v4
- OpenAI structured generation
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
- Live poster preview
- Draggable/resizable text canvas editor
- PNG export
- Shareable project URL
- Publish now or schedule to Instagram
- Connect/disconnect Instagram via Meta OAuth
- Format-aware planning: single image, carousel, and reel edit blueprint

## Implemented SOTA Steps

1. Persistent media storage and share links
- Uploads images/logos/renders to Vercel Blob
- Saves project snapshots in Blob
- Generates share links at `/share/:id`

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

5. Google Workspace authentication gate
- Requires Google Workspace sign-in before loading pages or non-exempt APIs
- Restricts access to one Workspace domain (`GOOGLE_WORKSPACE_DOMAIN`)
- Adds sign-out/session status endpoints for browser session control

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

Create `.env.local` from `.env.example`:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
GOOGLE_WORKSPACE_DOMAIN=3twos.com
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
WORKSPACE_AUTH_SECRET=
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
- Without `OPENAI_API_KEY`, generation falls back to deterministic local concepts.
- `GOOGLE_WORKSPACE_DOMAIN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `WORKSPACE_AUTH_SECRET` are required for app login.
- `GOOGLE_OAUTH_REDIRECT_URI` is optional (defaults to `<origin>/api/auth/google/callback`).
- Without `BLOB_READ_WRITE_TOKEN`, uploads/share links/scheduling are unavailable.
- For OAuth connect, set `META_APP_ID`, `META_APP_SECRET`, and `META_REDIRECT_URI`.
- `APP_ENCRYPTION_SECRET` is required in production to encrypt OAuth tokens at rest.
- `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_BUSINESS_ID` remain supported as env fallback credentials.

## API Endpoints

- `POST /api/generate`: Generate 3 creative variants
- `POST /api/assets/upload`: Upload image/logo/render to Blob
- `POST /api/projects/save`: Save shareable project snapshot
- `GET /api/projects/:id`: Load shared project snapshot
- `POST /api/meta/schedule`: Publish now or schedule Instagram post
- `GET /api/cron/publish`: Cron executor for due scheduled posts
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
