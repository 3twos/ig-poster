# Meta Editor Parity Roadmap

Date: 2026-03-08

## Goal

Reach practical parity with Meta's current Instagram posting surface for feed posts and carousels while preserving IG Poster's differentiator: generated creative plus editable brand overlays.

This roadmap targets the baseline that Meta currently documents for:

- carousel creation on desktop, including reorder/remove/crop/filter/tag flow:
  [Share a post with multiple photos or videos on Instagram](https://www.facebook.com/help/instagram/269314186824048?locale=en_GB)
- supported image ratios and crop behavior:
  [Image resolution of photos you share on Instagram](https://www.facebook.com/help/instagram/1631821640426723?locale=en_GB)
- post-publish caption edits:
  [Add, edit or delete the caption of an existing Instagram post](https://www.facebook.com/help/instagram/235006173747734?locale=en_GB)
- post-publish location edits:
  [Add or edit the location of an existing Instagram post](https://www.facebook.com/help/instagram/841545179210359?locale=en_GB)
- Meta Business Suite draft and schedule workflow:
  [Create posts and save drafts for your Facebook Page](https://www.facebook.com/help/642707099175171/)
  [Schedule a post and manage scheduled posts for your Facebook Page](https://www.facebook.com/help/389849807718635)

## What "Parity" Means Here

Parity does not mean cloning every Meta surface.

It means a user should be able to do the core pre-publish work that Meta supports for feed posts without leaving IG Poster:

1. Start and return to drafts intentionally.
2. Build a carousel of up to 10 items.
3. Reorder and remove carousel items before publish.
4. Apply crop/orientation choices that match Instagram's supported constraints.
5. Edit post-level caption, location, and tags in-app.
6. Revisit scheduled drafts and modify them before publish.
7. Edit the parts Meta allows after publish: caption and location, plus tagged accounts if API support allows it.

IG Poster should then go beyond parity by keeping generated copy, overlay layouts, and brand-safe templates on top of that baseline.

## Current Gap Summary

Already in place:

- autosaved text-overlay canvas with drag/resize
- direct text overrides, hide/show, and custom text boxes
- share snapshots
- scheduling and queue management
- location and user-tag metadata for single-image publish flow

Still below Meta baseline:

- no pre-publish carousel item removal inside the canvas/editor flow
- no crop/orientation editor with persisted per-item transforms
- no per-item carousel tagging UI
- no media filter/edit surface
- no explicit "Finish later" draft affordance near the composer
- no planner/calendar entry point for editing scheduled content from the main editor
- no post-publish caption/location edit workflow

## Delivery Plan

### Phase 1: Media Composer Baseline

Objective:
Bring pre-publish media handling to Meta baseline for feed posts and carousels.

Deliverables:

- add a filmstrip-based media composer beside the poster preview
- support 1 to 10 carousel items with explicit reorder and remove controls
- persist a global orientation mode for the post (`square`, `portrait`, `landscape`) because Meta applies one orientation across the whole carousel
- store per-item crop rectangles within that shared orientation
- render preview using the saved crop rectangles rather than raw uploaded media
- add validation that blocks publish when the composed asset set violates Instagram limits

Data model changes:

- extend stored asset/editor state with:
  - `orientation`
  - `cropRect`
  - `rotation`
  - `hidden` or `excludedFromPost`
  - optional `coverPriority`

Acceptance criteria:

- user can add up to 10 carousel items
- user can drag to reorder items
- user can remove an item before publish
- crop changes survive reload, post switching, scheduling, and sharing
- preview and published output match the same composed media order

### Phase 2: Crop and Visual Adjustments

Objective:
Match Meta's crop/edit flow closely enough that users do not need Instagram for final polish.

Deliverables:

- add a crop modal with fixed Instagram-safe bounds based on Meta's documented ratio range
- show safe-area overlays for headline/logo placement relative to crop
- support per-item basic adjustments:
  - brightness
  - contrast
  - saturation
  - warmth
- support reusable filter presets if full parity filters are too expensive initially

Implementation notes:

- prefer server-side image processing for publish output consistency
- keep editor preview and export path on the same transform model to avoid drift

Acceptance criteria:

- user can crop each item and see the exact resulting composition before publish
- export/share/publish all use the same transform pipeline
- transform settings remain stable across browsers and sessions

### Phase 3: Caption, Location, and Tagging Parity

Objective:
Match the edit controls Meta exposes around feed post metadata.

Deliverables:

- promote caption editing from "copy bundle" to a dedicated post composer field
- keep generated caption as a suggestion, not the only source of truth
- add location search + selection for all eligible post types supported by our publish path
- add per-image tagging for carousel items, not just single-image posts
- add account-tag editing for scheduled posts from the queue

API feasibility spike:

- confirm whether Instagram Graph/Content Publishing endpoints allow post-publish edits for:
  - caption
  - location
  - tagged users/accounts
- if API support is missing, surface that explicitly and stop parity at pre-publish editing

Acceptance criteria:

- user can edit caption/location/tags before publish without touching raw JSON or queue internals
- scheduled posts can be reopened and edited from a clear composer UI
- any unsupported post-publish edits are clearly labeled as platform/API limitations

### Phase 4: Draft and Planner Workflow

Objective:
Reach Meta Business Suite parity for deliberate draft handling and scheduled-content editing.

Deliverables:

- add `Finish later` as an explicit draft action in the main composer
- add a `Drafts` view distinct from generated/published state
- add `Duplicate post`
- add a planner/calendar view for scheduled content
- allow reschedule, move-to-draft, and delete from the planner
- add draft thumbnails derived from the current composed media and overlay state

Acceptance criteria:

- user can intentionally pause work and resume later from a drafts list
- scheduled posts are editable from calendar/planner without opening queue internals
- duplicate + edit is fast enough for campaign batch work

### Phase 5: Post-Publish Edit Surface

Objective:
Cover the subset of post-publish edits that Meta allows and the API can support.

Deliverables:

- post detail view for published entries
- edit caption for published posts
- edit location for published posts
- edit tagged accounts if supported by Meta APIs
- fetch and display edit outcomes/errors per publish record

Acceptance criteria:

- post-publish caption/location edits can be initiated from IG Poster
- publish history reflects the latest editable metadata state
- unsupported changes fail clearly and do not leave local state ambiguous

### Phase 6: Quality, Constraints, and Operational Hardening

Objective:
Make parity reliable, not just feature-complete.

Deliverables:

- add component tests for crop, reorder, remove, and draft restore flows
- add end-to-end tests for single image, carousel, and scheduled edit flows
- add media preflight for composed outputs before publish
- add migration/backfill for legacy posts so old drafts get safe defaults
- instrument editor failures:
  - autosave failures
  - invalid transform state
  - publish-time media rejection

Acceptance criteria:

- no silent autosave failure modes for editor state
- legacy drafts open without manual repair
- publish-time media validation errors are actionable

## Recommended Build Order

1. Phase 1
2. Phase 3 pre-publish parts
3. Phase 4
4. Phase 2
5. Phase 5
6. Phase 6 throughout, with hardening checkpoints after each phase

Reasoning:

- parity is currently blocked more by media composition than by overlay editing
- crop/orientation persistence is foundational for reliable previews, exports, and publish outputs
- post-publish editing should wait until the API feasibility spike is closed

## Non-Goals For The First Parity Push

- stories/reels sticker parity
- music library parity
- every Instagram-native filter by exact name
- mobile-only camera capture flows
- direct cloning of Meta's UI language or layout

## Decision Gates

Before starting Phase 2:

- confirm whether image processing will be browser-side, server-side, or hybrid

Before starting Phase 5:

- confirm Instagram Graph API support for post-publish metadata edits

Before declaring parity complete:

- run a side-by-side checklist against the official Meta behaviors linked above
- verify that preview, share snapshot, and published result all use the same media transform state
