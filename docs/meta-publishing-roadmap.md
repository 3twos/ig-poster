# Meta Publishing Roadmap

Last updated: 2026-03-12

This document tracks the Meta/Instagram content publishing rollout in this repo so the plan is not trapped in PR history or chat context.

## Completed

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

7. Guided user-tag editor UX
   - Replaced raw line-based tag text entry with structured `username/x/y` rows in the publish form and queue editor.
   - Normalizes usernames before submission and blocks incomplete tag rows client-side.
   - Reference: merged in PR `#77`.

8. Visual coordinate picker and location assist
   - Added click-to-place user tagging on the rendered poster preview in the main publish form and on stored image URLs in queue edits.
   - Added Meta place search that fills the existing `locationId` field while preserving manual ID entry as fallback.
   - Reference: merged in PR `#79`.

9. Additional Meta publishing controls
   - Exposed reel `share_to_feed` as a user-facing toggle in the publish form, queue edit flow, and runtime publish pipeline.
   - Reference: merged in PR `#80`.

## In Progress

1. Operational hardening
   - First slice: fail stale `processing` jobs after a timeout so quota does not stay wedged behind abandoned work, and expose recent publish-job activity in the queue UI.
   - Goal: make retries, deferrals, and downstream failures easier to diagnose and safer to recover.

## Remaining phases

- No additional phases are queued right now. Extend this roadmap when the next concrete Meta publishing slice is selected.

## Notes

- This roadmap is intentionally pragmatic. It tracks the concrete rollout already shipped in PRs instead of a speculative long-term platform plan.
- Strategic future-state planning for Facebook + Instagram support now lives in [docs/meta-multi-destination-rfc-2026-03-12.md](./meta-multi-destination-rfc-2026-03-12.md).
- When a phase changes scope, update this file in the same PR so status stays current.
