# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server on localhost:3000
npm run build        # Production build (also used as CI quality gate)
npm run lint         # ESLint check
npm run test         # Run Vitest tests
npm run test:watch   # Run Vitest in watch mode
npm install          # Install dependencies
```

CI runs `lint`, `test`, then `build`.

## Architecture

Next.js 16 App Router application (React 19, TypeScript 5, Tailwind CSS v4) deployed on Vercel. The entire app lives under `src/`.

### Core flow

1. User configures brand kit on `/brand` and LLM provider on `/settings` (persisted to Vercel Blob via `PUT /api/settings`)
2. On the Create page (`/`), user fills a post brief, uploads assets, and generates
3. `POST /api/generate` streams SSE progress events, calls OpenAI/Anthropic, and returns 3 creative variants
4. User previews/edits variants in a draggable/resizable canvas (`src/components/poster-preview.tsx` using `react-rnd`) with interactive carousel navigation
5. User can export PNG, save a shareable project snapshot, or publish/schedule to Instagram via Meta Graph API

### Pages

| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | Posts home — post brief, asset upload, generate, preview, results, publish |
| `/brand` | `src/app/brand/page.tsx` | Redirects to `/` |
| `/settings` | `src/app/settings/page.tsx` | Settings page — sidebar tabs for General, LLM Provider, Brand Kits |

Settings is a dedicated full page at `/settings` with master/detail sidebar navigation:
- `src/components/settings/general-section.tsx` — Instagram publishing (Meta OAuth connect/disconnect)
- `src/components/settings/llm-provider-section.tsx` — LLM provider connections, model ordering, execution mode
- `src/components/settings/brand-kits-section.tsx` — Master/detail brand kit editor (multiple kits, logos, overlay defaults)

Deep-link to tabs via query param: `/settings?tab=general`, `/settings?tab=llm`, `/settings?tab=brand-kits`.

All pages share `<AppShell>` (`src/components/app-shell.tsx`) which wraps content with `<AppNav>` (`src/components/app-nav.tsx`).

### Key modules in `src/lib/`

| File | Purpose |
|---|---|
| `types.ts` | Shared types (`LocalAsset`, `BrandState`, `PostState`, etc.) and constants (`INITIAL_BRAND`, `INITIAL_POST`, `RATIO_OPTIONS`) |
| `upload-helpers.ts` | Client-side helpers: `parseApiError`, `statusChip`, `mediaTypeFromFile`, `formatDuration`, `extractVideoMetadata` |
| `user-settings.ts` | Zod schema for user settings persistence, `getUserSettingsPath()` |
| `creative.ts` | Zod schemas for generation request/response, prompt builder, fallback generator, overlay layout defaults. Defines 4 layout templates and 3 post types (single-image, carousel, reel) |
| `meta.ts` | Meta Graph API wrapper — image, carousel, and reel publishing |
| `meta-auth.ts` | OAuth connection management with AES-256-GCM token encryption, session-based + env-based auth fallback |
| `blob-store.ts` | Vercel Blob storage helpers for images, projects, and schedules |
| `instagram-playbook.ts` | Wine/alcohol compliance guardrails and Instagram best-practice context injected into generation prompts |
| `secure.ts` | AES-256-GCM encrypt/decrypt utilities |
| `project.ts` | `SavedProject` Zod schema for persistence |
| `utils.ts` | `cn()` (tailwind-merge + clsx), `hexToRgba()`, `slugify()` |

### API routes (`src/app/api/`)

- `generate/` — AI creative generation via SSE streaming (OpenAI/Anthropic, falls back to deterministic local concepts)
- `settings/` — GET/PUT user settings (brand, AI config, prompt config) persisted to Vercel Blob
- `assets/upload/` — Upload media to Vercel Blob
- `projects/save/` and `projects/[id]/` — Project snapshot CRUD
- `meta/schedule/` — Publish now or schedule future Instagram post
- `cron/publish/` — Vercel Cron job (every 15 min) publishes due scheduled posts
- `auth/meta/` — Instagram OAuth start, callback, status, disconnect
- `auth/llm/` — LLM provider connect, disconnect, status
- `auth/google/` — Workspace Google OAuth

### Storage

Structured data (posts, brand kits) is stored in Neon Postgres via Drizzle ORM. Media, project snapshots, and schedules use Vercel Blob. Requires `POSTGRES_URL` (or `DATABASE_URL`) and `BLOB_READ_WRITE_TOKEN`.

### Database workflow

Schema is defined in `src/db/schema.ts` using Drizzle ORM. Migrations live in `drizzle/`.

```bash
npm run db:generate  # Generate migration after changing schema.ts
npm run db:push      # Push schema directly to DB (dev shortcut)
npm run db:check     # CI check: fails if schema.ts changed without a committed migration
npm run db:studio    # Open Drizzle Studio
```

**When changing the schema**: edit `src/db/schema.ts`, run `npm run db:generate`, commit the new migration file, then apply it to the DB with `npm run db:push`. CI runs `db:check` to catch uncommitted migrations.

### Environment

Copy `.env.example` to `.env.local`. Key dependencies:
- `OPENAI_API_KEY` — without it, generation uses deterministic fallback
- `BLOB_READ_WRITE_TOKEN` — without it, uploads/sharing/scheduling are disabled
- `META_APP_ID` + `META_APP_SECRET` + `META_REDIRECT_URI` — for OAuth connect
- `APP_ENCRYPTION_SECRET` — encrypts OAuth tokens at rest (required in production)

### Validation

Zod schemas are used pervasively for request validation in API routes and for typing generation inputs/outputs. All API routes validate with Zod before processing.

## PR and Branch Policy

**Use `/pr <task>` to run the full PR lifecycle** — worktree setup, implementation, validation, PR creation, review handling, and cleanup. Read `AGENTS.md` for detailed rules on merge gates, review handling, and branch policy. Key points: branches use `claude/` prefix, never self-merge — wait for explicit user approval, and treat review comments as required inputs.

## CI/CD

- `.github/workflows/ci.yml` — lint + test + build on PRs and main pushes (Node 22)
- Vercel Git integration — automatic production deploys on push to main
- `vercel.json` — Cron config for `/api/cron/publish` every 15 minutes
