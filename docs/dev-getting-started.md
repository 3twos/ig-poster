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

- `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` -- models configured via these env vars auto-appear in the multi-model list alongside any BYOK connections.
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

## Project Map

- `src/app/page.tsx`: main editor page — composes a 3-column resizable layout from focused section components.
- `src/components/post-brief-form.tsx`: post brief fields, template gallery, generate/export buttons.
- `src/components/asset-manager.tsx`: drag-and-drop reorderable asset list (uses `@dnd-kit/sortable`).
- `src/components/agent-activity-panel.tsx`: agent run progress, step cards, LLM reasoning stream display.
- `src/components/poster-section.tsx`: poster preview wrapper with empty state.
- `src/components/strategy-section.tsx`: strategy text, variant tiles, caption bundles, refine controls.
- `src/components/publish-section.tsx`: share link, Instagram auth, schedule, publish form.
- `src/components/poster-preview.tsx`: poster renderer + editable overlay blocks.
- `src/hooks/use-generation.ts`: SSE-based generation orchestration, agent run state, thinking token handling.
- `src/lib/agent-types.ts`: agent run/step types and UI utility functions.
- `src/app/share/[id]/page.tsx`: shared project view.
- `src/app/api/**/route.ts`: API endpoints for generation, auth, uploads, projects, and publishing.
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
3. Use `AGENTS.md` command permissions: common read/search/web commands are pre-approved, and write/update commands must stay inside the active repo/worktree.
4. Implement changes.
5. Run `npm run lint` and `npm run build`.
6. Update docs when behavior/architecture/dev workflow changes.
7. Commit, push, and open PR.
8. Wait for automatic Copilot review, address all comments, resolve all conversations, and clear merge conflicts before asking for merge approval.

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

- Model ordering not persisting:
  - Verify `PUT /api/auth/llm/reorder` is called with the desired `connectionOrder` and `mode` (`"fallback"` or `"parallel"`). The user-settings `aiConfig` stores these fields.

- Meta publish fails:
  - Verify OAuth connection, Instagram business account linkage, or env fallback credentials.
