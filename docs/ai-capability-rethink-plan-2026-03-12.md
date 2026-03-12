# AI Capability Rethink Plan (2026-03-12)

## Why this exists

The current AI flow is trying to solve three jobs at once:

1. Generate strategic post concepts
2. Write overlay-ready copy
3. Implicitly choose text density that fits fixed canvas boxes

That coupling is producing the reported issues:

- overlay blocks overlap because fixed positions and sizes are not layout-aware
- prompts include the user brief, but stronger house heuristics still bias output toward generic save/share CTA patterns
- refine requests are too context-poor to reliably realign content to the original brief or current canvas state
- there is no first-class way to inspect the exact prompt used for a run

## Target direction

We should move toward a constraint-first pipeline:

1. Generate concept and messaging intent
2. Produce slot-specific copy with explicit layout-fit budgets
3. Fit the copy into a deterministic canvas layout
4. Refine using the original brief, the current variant, and the current canvas state

## Implementation phases

### Phase 1: Observability and constraint hygiene

- Show the exact generation prompt used in the UI
- Carry the original brief and current overlay context into refine requests
- Remove the strongest hard-coded CTA bias from prompt guidance, fallback output, and selection heuristics
- Introduce layout-aware copy budgets so generation/refine targets more realistic text lengths

### Phase 2: Constraint-first refinement

- Model refine requests as structured operations such as:
  - shorten headline
  - shorten body
  - remove CTA
  - change tone
  - retarget audience
- Make CTA optional instead of universally required
- Score outputs on brief alignment and constraint satisfaction before generic engagement heuristics

### Phase 3: Deterministic layout fitting

- Add safe-area templates keyed by layout and aspect ratio
- Measure rendered text and resolve font scale / block height before display
- Prevent block overlap and out-of-bounds placement with deterministic packing rules

### Phase 4: Regression coverage

- Prompt snapshot tests
- Refine adherence tests
- No-CTA tests
- Geometry tests that prove blocks do not overlap or exceed the frame

## First implementation slice in this branch

This branch starts Phase 1:

- prompt snapshots in the agent activity panel
- richer refine context
- softer CTA assumptions
- layout-aware copy budgets for generated/refined variants
