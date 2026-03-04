# AI Leverage Roadmap + Multi-Agent Execution Plan

Last updated: March 3, 2026 (America/Vancouver).
Owner: Growth + Product Engineering.
Status: Active implementation plan.

## 1) Why this exists

This document is the persistent execution plan for deepening AI capabilities in IG Poster.  
It is designed so multiple agents can implement work in parallel with clear boundaries.

## 2) Success outcomes

Primary outcomes:
- Improve output quality (brand fit + platform fit).
- Improve workflow speed (fewer manual rewrites).
- Improve performance outcomes (saves, shares, watch-through, profile actions).

Target KPIs:
- `brand_field_acceptance_rate >= 80%` without manual rewrite.
- `top_ranked_variant_selected_rate >= 60%`.
- `save_share_rate_lift >= 15%` vs current baseline after controlled rollout.
- `generation_failure_rate <= 2%` with deterministic fallback always available.

## 3) Architecture target

Core pipeline:
1. Brand Intelligence Engine (multi-page extraction + evidence).
2. Brand Memory (versioned, confidence-scored, reusable).
3. Format-specific generation agents (reel/carousel/single/story).
4. Candidate scoring + ranking + diversity selection.
5. Rewrite copilot (constrained edits with impact estimates).
6. Guardrails (recommendation eligibility + compliance).
7. Closed-loop learning from post outcomes.

## 4) Phase plan

## Phase 0: Foundations (Week 1)

Deliverables:
- Tracking contract for generation, selection, rewrite, publish, and outcomes.
- Offline eval harness and regression suite for prompts and output schema quality.
- Codified best-practice policy artifacts:
  - Human-readable: `docs/ai/instagram-best-practices.md`
  - Runtime policy: `src/config/ai/instagram-best-practices.v1.yaml`
  - Typed loader: `src/lib/ai/best-practices.ts`

Exit criteria:
- Policies are loaded at runtime and injected into generation/guardrail paths.
- CI runs deterministic eval checks for core generation routes.

## Phase 1: Brand Intelligence Engine (Weeks 2-3)

Deliverables:
- `POST /api/brand/analyze` that crawls selected pages (`/`, `/about`, product/service pages, blog entry, contact).
- Structured extraction with evidence:
  - positioning, audience pains, proof points, voice traits, visual cues, claim restrictions.
- Field-level confidence scores and low-confidence fallbacks.
- Versioned `brand_memory` persistence.

Exit criteria:
- Brand analysis output is reproducible and references concrete evidence snippets.

## Phase 2: Brand-to-Field Translation (Weeks 3-4)

Deliverables:
- Multi-step transform pipeline: extract -> normalize -> critique -> finalize.
- Contradiction detection and resolution rules.
- UI explanations for each field (`why this value`, `source evidence`).

Exit criteria:
- Autofill output quality exceeds baseline on internal eval set.

## Phase 3: Format-specific generation agents (Weeks 5-6)

Deliverables:
- Specialized agents:
  - `reelAgent`
  - `carouselAgent`
  - `singleImageAgent`
  - `storySequenceAgent`
- Objective-aware generation modes:
  - discovery, saves, shares, profile visits, conversion.
- Internal candidate expansion (for example 12 candidates) before top-3 selection.

Exit criteria:
- Top-3 variants are diverse, format-correct, and schema-valid across test corpus.

## Phase 4: Scoring + ranking (Weeks 6-8)

Deliverables:
- Variant scoring service with explainable feature breakdown.
- Diversity-aware selector (avoid near-duplicate top results).
- UI score transparency (`why this ranked high`).

Exit criteria:
- Highest ranked variant is chosen by users more often than random baseline.

## Phase 5: Rewrite copilot (Weeks 8-10)

Deliverables:
- One-click transforms:
  - more saveable
  - more shareable
  - shorter
  - more premium tone
  - stronger CTA
  - lower policy risk
- Diff view + revision history.
- Constrained rewrites (caption only, CTA only, hook only).

Exit criteria:
- Rewrite cycle time and manual editing effort drop measurably.

## Phase 6: Closed-loop learning (Weeks 10-12)

Deliverables:
- Outcome ingestion pipeline (publish metadata + performance snapshots).
- Joined analytics dataset (`generation_run` -> `variant_candidate` -> `publish_event` -> `performance_snapshot`).
- Weekly adaptation job for scoring weights and prompt guidance.

Exit criteria:
- Model strategy updates are data-backed and versioned.

## Phase 7: Guardrails + recommendation eligibility (Parallel track)

Deliverables:
- Pre-publish policy checker with pass/warn/block outcomes.
- Eligibility checks for quality/originality/restriction signals.
- Vertical compliance modules (wine/alcohol first, extensible).

Exit criteria:
- Every publish attempt receives guardrail evaluation and actionable remediation.

## 5) Multi-agent execution model

Yes, multiple agents are both possible and efficient if contracts are fixed.

Parallel tracks:
- Track A (Foundations + policy): Phase 0.
- Track B (Brand intelligence): Phases 1-2.
- Track C (Generation agents): Phase 3.
- Track D (Scoring/ranking): Phase 4.
- Track E (Rewrite UX): Phase 5.
- Track F (Learning loop): Phase 6.
- Track G (Guardrails): Phase 7.

Recommended concurrency by dependency:
1. Start Track A immediately.
2. Start Tracks B and G once Track A contracts exist.
3. Start Track C once Brand Memory schema is stable.
4. Start Track D in parallel with late Track C once candidate schema is frozen.
5. Start Track E once ranking output and variant payload shape are stable.
6. Start Track F once publish/outcome events are emitting.

Integration contracts (must be versioned):
- `BrandMemory.v1`
- `VariantCandidate.v1`
- `VariantScore.v1`
- `GuardrailResult.v1`
- `PerformanceSnapshot.v1`

## 6) Work breakdown (agent-ready)

EPIC-0 Foundations:
- E0-T1 Define analytics event schemas.
- E0-T2 Build eval harness and baseline snapshots.
- E0-T3 Implement best-practice runtime policy loader.

EPIC-1 Brand Intelligence:
- E1-T1 Build controlled website crawler and parser.
- E1-T2 Implement extraction + evidence spans.
- E1-T3 Persist and version `brand_memory`.

EPIC-2 Brand Translation:
- E2-T1 Build normalization + contradiction checks.
- E2-T2 Build explainability payload for UI.

EPIC-3 Generation:
- E3-T1 Split monolithic generation into format agents.
- E3-T2 Generate N candidates and enforce diversity constraints.

EPIC-4 Scoring:
- E4-T1 Build scoring service and feature logging.
- E4-T2 Implement ranker + selector and UI score explanations.

EPIC-5 Rewrite:
- E5-T1 Implement constrained rewrite API.
- E5-T2 Add rewrite presets + diff UX.

EPIC-6 Learning:
- E6-T1 Persist publish/performance snapshots.
- E6-T2 Implement weekly adaptation job.

EPIC-7 Guardrails:
- E7-T1 Build recommendation-eligibility checks.
- E7-T2 Build vertical compliance modules and pre-publish gating.

## 7) Collaboration protocol for multi-agent work

- Each agent uses a dedicated worktree and `codex/*` branch.
- Each PR references one epic/task ID.
- Avoid cross-epic file overlap where possible.
- If shared types change, submit contract PR first.
- Rebase frequently; merge behind feature flags when needed.

PR checklist:
1. Contract changes documented and version bumped if breaking.
2. Tests/evals updated.
3. Telemetry events validated.
4. Guardrail impact assessed.

## 8) Risks and mitigations

Risks:
- Overfitting to benchmarks instead of brand-specific performance.
- Prompt drift causing regressions.
- Schema churn across tracks.
- Quality degradation under provider/model changes.

Mitigations:
- Freeze contract versions per milestone.
- Keep deterministic fallback path.
- Run eval harness in CI on every generation-related PR.
- Add provider/model compatibility tests.

## 9) Immediate next actions

1. Implement Phase 0 artifacts and policy loader.
2. Freeze `BrandMemory.v1` and `VariantCandidate.v1` contracts.
3. Spin up parallel agents for EPIC-1, EPIC-3, and EPIC-7 behind feature flags.
