# Meta Publishing Roadmap

Last updated: 2026-03-07

This document tracks the Meta/Instagram content publishing rollout in this repo so the plan is not trapped in PR history or chat context.

## Completed on `main`

1. Meta account setup moved into Settings
   - User-facing account connect/disconnect flow lives in Settings instead of the main publish panel.
   - Reference: merged in PR `#60`.

2. DB-backed publish queue foundation
   - Added `publish_jobs` persistence, lifecycle tracking, and queue management APIs.
   - Reference: merged in PR `#64`.

3. Queue management UI
   - Added queued/processing/failed job visibility plus cancel/edit/retry workflows.
   - References: merged in PRs `#66`, `#68`, `#69`, `#71`.

4. Publish-window and media safety guardrails
   - Added rolling 24-hour publish capacity enforcement and media URL preflight validation.
   - References: merged in PRs `#73`, `#74`.

5. First-comment support
   - Added immediate and scheduled first-comment posting after successful media publish.
   - Reference: merged in PR `#75`.

6. Advanced image metadata support
   - Added `locationId` and `userTags` across schedule, immediate publish, cron publish, queue edit, DB persistence, tests, and docs.
   - Reference: merged in PR `#76`.

## In Progress

1. Guided user-tag editor UX
   - Replace raw line-based tag text entry with structured `username/x/y` rows in the publish form and queue editor.
   - Normalize usernames before submission and block incomplete tag rows client-side.
   - Reference: PR `#77`.

## Remaining phases

1. Visual coordinate picker and location assist
   - Replace numeric-only placement with image-based tag placement and reduce manual location ID entry.
   - Goal: faster, less error-prone metadata authoring.

2. Additional Meta publishing controls
   - Expand support for other content-publishing options that materially improve authoring power or operational flexibility.
   - Candidate areas: collaborator workflows, richer reel-specific controls, and other Graph API publish metadata worth exposing.

3. Operational hardening
   - Strengthen idempotency, diagnostics, and publish-history observability around retries, deferred jobs, and downstream failures.
   - Goal: make the queue safer and easier to operate under real publishing load.

## Notes

- This roadmap is intentionally pragmatic. It tracks the concrete rollout already shipped in PRs instead of a speculative long-term platform plan.
- When a phase changes scope, update this file in the same PR so status stays current.
