# IG Poster Engine

SOTA Instagram poster app built for production with:
- Next.js 16 App Router
- TypeScript
- Tailwind CSS v4
- OpenAI structured generation
- Vercel Blob storage
- Meta Graph API publishing
- GitHub Actions + Vercel deployment workflow

## What It Does

Input:
- Brand kit (values, principles, visual system, voice, story, palette, logo notes)
- Post brief (theme, subject, thought, objective, audience, mood)
- Post image set + logo

Output:
- 3 high-impact creative variants
- Strategy rationale
- Caption + hashtag bundle
- Live poster preview
- Draggable/resizable text canvas editor
- PNG export
- Shareable project URL
- Publish now or schedule to Instagram

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
- Publish immediately via Meta Graph API
- Optional future schedule stored in Blob
- Vercel Cron endpoint (`/api/cron/publish`) executes due jobs every 15 minutes

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
BLOB_READ_WRITE_TOKEN=
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_BUSINESS_ID=
META_GRAPH_VERSION=v22.0
CRON_SECRET=
```

Notes:
- Without `OPENAI_API_KEY`, generation falls back to deterministic local concepts.
- Without `BLOB_READ_WRITE_TOKEN`, uploads/share links/scheduling are unavailable.
- Meta publish requires a valid IG Business account token and ID.

## API Endpoints

- `POST /api/generate`: Generate 3 creative variants
- `POST /api/assets/upload`: Upload image/logo/render to Blob
- `POST /api/projects/save`: Save shareable project snapshot
- `GET /api/projects/:id`: Load shared project snapshot
- `POST /api/meta/schedule`: Publish now or schedule Instagram post
- `GET /api/cron/publish`: Cron executor for due scheduled posts

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

## Vercel Cron

Cron is configured in `vercel.json`:
- `*/15 * * * *` -> `/api/cron/publish`

Set `CRON_SECRET` in Vercel env; Vercel sends it as `Authorization: Bearer <CRON_SECRET>`.

## Repo Bootstrap (already applied for this project)

```bash
gh repo create 3twos/ig-poster --source=. --remote=origin --public --push
```
