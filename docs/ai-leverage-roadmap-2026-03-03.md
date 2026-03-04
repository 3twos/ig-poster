# AI Leverage Roadmap (Revised)

Last updated: March 3, 2026.
Status: Tiers 1-2 implemented. Tier 3 is future work.

## Context

This plan replaced the original 7-phase multi-agent execution plan with a practical, incremental approach organized by impact. The original plan was over-engineered for the project's scope (single-developer Next.js app, no database, Vercel Blob persistence).

## What was implemented

### Tier 1 — High-impact wins (done)

**1a. Website body text extraction**
- `website-style.ts` now extracts visible page text (up to 3000 chars) alongside metadata.
- `buildWebsiteStyleContext` returns `{ notes, bodyText }` instead of a plain string.
- Body text is injected into both the generation and autofill prompts, giving the LLM actual brand messaging to work with.

**1b. Enriched generation prompt**
- `instagram-playbook.ts` now includes `ENGAGEMENT_PATTERNS` (hook formulas, CTA patterns, caption structure, carousel/reel retention) and a `FEW_SHOT_VARIANT_EXAMPLE`.
- Both are injected into every generation prompt via `buildPromptBestPracticeContext()`.

**1c. Iterative variant refinement**
- New endpoint: `POST /api/generate/refine` accepts a variant + instruction + brand context.
- Uses focused LLM call (temp 0.5, 2000 tokens) to refine a single variant per user instruction.
- UI: text input + "Refine" button in the variant detail section on the create page.

### Tier 2 — Meaningful improvements (done)

**2a. Multi-page brand analysis**
- `buildMultiPageStyleContext()` in `website-style.ts` crawls up to 3 pages (homepage + about + product page).
- Discovers internal links from homepage HTML, finds about/product pages intelligently.
- Used by autofill route only (generation route stays single-page for speed).

**2b. Brand memory persistence**
- `UserSettingsSchema` includes a `brandMemory` field (websiteUrl, bodyText, notes, fetchedAt).
- Autofill persists extracted context to Vercel Blob after successful extraction.
- Generation route checks for cached brand memory before scraping, skipping the live fetch when a match exists.

**2c. Generate 6 candidates, surface top 3**
- Generation prompt now requests 6 variants instead of 3.
- `selectTopVariants()` scores by caption quality, CTA presence, hook strength, hashtag count, and ensures postType diversity.
- Top 3 are surfaced to the user.

## Tier 3 — Future work (not implemented)

**3a. Scoring/ranking with explainability**
LLM-as-judge scoring of variants on engagement potential, brand alignment, and format fit. Returns scores + reasoning alongside each variant. Replaces the heuristic scoring with more nuanced evaluation.

**3b. Rewrite presets**
Pre-defined one-click transforms: "More saveable", "Shorter caption", "Premium tone", "Educational angle". Use the existing refine endpoint with preset instructions, exposed as quick-action buttons.

**3c. Closed-loop learning**
Track which variants get published, their engagement metrics via Meta Graph API Insights, and feed data back into future generation prompts. Requires publishing volume and an outcomes data model.

## Key files modified

| File | Changes |
|---|---|
| `src/lib/website-style.ts` | Body text extraction, multi-page crawl, structured return type |
| `src/lib/instagram-playbook.ts` | Engagement patterns, few-shot example |
| `src/lib/creative.ts` | Prompt builder updates, internal schema, variant selection |
| `src/lib/user-settings.ts` | brandMemory schema |
| `src/app/api/generate/route.ts` | Body text + brand memory cache + 6-to-3 filtering |
| `src/app/api/generate/refine/route.ts` | New refinement endpoint |
| `src/app/api/brand/autofill/route.ts` | Body text + multi-page + memory persistence |
| `src/app/api/settings/route.ts` | brandMemory merge in PUT |
| `src/app/page.tsx` | Refinement UI |
