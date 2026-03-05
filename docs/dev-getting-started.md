# Developer Getting Started

## Prerequisites

- Node.js 20+ and npm.
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

### Required for login (minimum usable app)

- `GOOGLE_WORKSPACE_DOMAIN`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `WORKSPACE_AUTH_SECRET` (or `APP_ENCRYPTION_SECRET`)

### Recommended for generation quality

- `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`
- Optional model overrides: `OPENAI_MODEL`, `ANTHROPIC_MODEL`

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

```bash
npm run lint
npm run build
```

Run these before opening or updating a PR.

## Monitor Vercel Deployments

Use the monitor script to poll deployment status until it reaches `READY`, `ERROR`, or `CANCELED`:

```bash
./scripts/monitor-vercel-deployment.sh <deployment-id-or-url> --interval 5
```

Optional environment variables:
- `VERCEL_TOKEN` (required unless you pass `--token`)
- `VERCEL_TEAM_ID` or `VERCEL_ORG_ID` (use for team-scoped deployments)

## Project Map

- `src/app/page.tsx`: main editor UI and client orchestration.
- `src/components/poster-preview.tsx`: poster renderer + editable overlay blocks.
- `src/app/share/[id]/page.tsx`: shared project view.
- `src/app/api/**/route.ts`: API endpoints for generation, auth, uploads, projects, and publishing.
- `src/lib/creative.ts`: generation schemas, prompt builders, fallback output.
- `src/lib/llm.ts`: provider adapters and structured JSON generation.
- `src/lib/llm-auth.ts`: LLM credential persistence/resolution.
- `src/lib/meta.ts`: Meta Graph publishing primitives.
- `src/lib/meta-auth.ts`: Meta OAuth flow and credential resolution.
- `src/lib/workspace-auth.ts`: Google Workspace OAuth + session tokens.
- `src/proxy.ts`: Next.js 16 Proxy entrypoint for auth gate and canonical host redirect logic.

## Day-to-Day Dev Workflow

1. Create an isolated worktree + `codex/*` branch.
2. Run pre-flight `git status --short`.
3. Implement changes.
4. Run `npm run lint` and `npm run build`.
5. Update docs when behavior/architecture/dev workflow changes.
6. Commit, push, and open PR.

## Common Implementation Notes

- All API inputs should be schema-validated with Zod.
- Prefer adding logic to `src/lib/*` and keeping route handlers thin.
- Keep LLM prompts and output constraints in `src/lib/creative.ts`.
- Preserve fallback behavior so generation still works without provider credentials.
- For security-sensitive features, use existing encryption helpers and auth resolvers.

## Troubleshooting for Developers

- 401s on most routes:
  - Workspace session cookie missing/expired; re-run Google OAuth login.

- Upload/share/schedule endpoints return 503:
  - Blob is not configured (`BLOB_READ_WRITE_TOKEN` missing).

- LLM connect fails:
  - Key/model validation failed against provider API; check provider/model pairing.

- Meta publish fails:
  - Verify OAuth connection, Instagram business account linkage, or env fallback credentials.
