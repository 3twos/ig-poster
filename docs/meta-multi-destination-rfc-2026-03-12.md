# Meta Multi-Destination Publishing RFC

Date: 2026-03-12

Status: Proposed

## Summary

IG Poster should evolve from an Instagram-only publisher into a destination-aware Meta publishing platform that can publish to Facebook, Instagram, or both from a shared creative workspace.

The app should treat Facebook Page publishing and Instagram professional-account publishing as separate but related delivery systems:

- Facebook should be remote-authoritative for drafts, scheduled posts, and published posts whenever we use supported public APIs.
- Instagram should be remote-authoritative for published media and engagement state.
- Instagram drafts and scheduled posts should remain app-managed unless Meta exposes supported public APIs for remote draft and planner parity.

This RFC proposes the target architecture, data model, sync model, API surface, rollout strategy, and PR breakdown needed to support the `inesueno.wines` use case and future Meta-connected customers.

## Background

The current product and codebase assume Instagram is the only publishing destination:

- OAuth is centered on an Instagram business account linked through a Page, but runtime publish flows use only the Instagram user ID.
- Publish jobs are modeled as a single-destination queue.
- Publish history stores Instagram-only identifiers.
- The planner and queue are app-local rather than destination-aware.

That assumption no longer matches how customers use Meta tooling in practice. For accounts configured to operate across both Facebook and Instagram, Meta's public platform exposes:

- a strong Page-based publishing and scheduling model for Facebook
- a separate content publishing model for Instagram
- webhook and read APIs that allow published-state reconciliation

What Meta does not publicly expose, based on current primary-source research, is a unified Business Suite draft/calendar/asset API that we can use to round-trip all cross-channel objects exactly as Business Suite does internally.

## Problem Statement

We need to solve two related but distinct problems:

1. Destination breadth
   - The app must support Facebook Page publishing in addition to Instagram publishing.

2. Synchronization expectations
   - Users expect work planned in our app to appear in Meta web tools when Meta supports that object type.
   - Users also expect work done in Meta tools to show up in our app where practical.

If we keep the current Instagram-only architecture, the app will continue to diverge from the operational source of truth used by teams publishing through Meta.

## Goals

- Publish a single post to `facebook`, `instagram`, or `both`.
- Preserve one shared creative workspace across destinations.
- Use public Meta APIs only.
- Keep Facebook drafts, scheduled posts, and published posts synchronized with Meta tools where supported.
- Keep Instagram published media synchronized with Meta tools where supported.
- Make sync boundaries explicit in the product so we do not imply parity we cannot guarantee.
- Preserve existing creative-generation, overlay-editing, and brand-kit workflows.

## Non-Goals

- Reverse-engineering private Meta Business Suite APIs.
- Claiming full parity for Instagram drafts or Instagram planner objects without supported public APIs.
- Replacing the app's asset system with a Meta-hosted asset library.
- Using Accounts Center auto-share as the backend contract for cross-posting.

## Primary Research Findings

These findings are based on Meta's public docs as available on March 12, 2026.

### 1. Facebook and Instagram are distinct publish systems

Meta documents Instagram publishing through Instagram container and media-publish endpoints, while Facebook Page publishing uses Page feed and media edges.

Implication:

- We should model Facebook and Instagram as separate destination services behind a shared orchestration layer.

### 2. Facebook has first-class remote planning objects

Meta's Page publishing docs support:

- unpublished posts
- scheduled posts
- listing published and unpublished posts through Page feed with `is_published`
- updating and deleting Page posts
- Page feed webhooks for change detection

Implication:

- Facebook drafts and scheduled posts can be remote-authoritative.

### 3. Instagram supports publishing and published-state reads, but not full planner parity

Meta's Instagram docs support:

- container creation
- media publishing
- content publishing limit lookup
- published media reads
- webhooks for comments, mentions, messaging, and related account activity

I did not find public API support for:

- Instagram draft objects
- Instagram scheduled planner objects that round-trip with Meta Planner
- Business Suite asset library parity

Implication:

- Instagram scheduled state should remain app-managed until publish time.
- After publish, the remote media object should become authoritative.

### 4. Facebook Login for Business is the better foundation for cross-destination use

Instagram Login now supports Instagram professional accounts without a linked Facebook Page, but Facebook Login for Business remains the more natural base for any workflow that needs Facebook Page publishing and Page webhooks.

Implication:

- `Both` and `Facebook` publishing should default to a Page-centric Meta account pair.
- Instagram Login can remain an optional IG-only path if we decide to keep supporting it.

### 5. Meta docs contain live constraint inconsistencies

The currently published docs conflict on at least two points:

- Instagram publish limit appears as both `100` and `50` per rolling 24 hours depending on doc page; the `content_publishing_limit` reference currently returns `quota_total: 50`.
- Facebook scheduling windows appear as both `30` days and `75` days depending on doc page/edge.

Implication:

- The app should prefer runtime capability and quota checks where Meta exposes them.
- We should remove or isolate hardcoded platform assumptions.

## Decision

Adopt a destination-aware architecture with:

- one shared post core
- one destination projection per enabled destination
- one Meta account pair centered on a Facebook Page and its linked Instagram professional account
- remote-authoritative Facebook planning
- app-managed Instagram planning until publish
- remote-authoritative Instagram published-state reconciliation after publish

## Proposed Architecture

### Shared Post Core

The shared post remains the product's creative center of gravity:

- brief
- brand context
- assets
- generated variants
- active variant
- overlay layouts
- media composition
- default caption/copy bundle

This object should not encode destination-specific remote state directly.

### Destination Projections

Each shared post can have zero or more destination records:

- `facebook`
- `instagram`

Each destination record stores:

- enabled state
- destination-specific caption and metadata
- publish mode
- desired publish time
- remote IDs and permalinks
- sync mode
- sync status
- errors and last reconciliation timestamps

### Meta Account Pair

Instead of resolving "Instagram auth" at runtime, the app should resolve a Meta publishing pair:

- Facebook Page identity
- Page access token
- Instagram professional account identity
- granted permissions/tasks
- webhook installation state
- capability snapshot

The Page becomes the root administrative unit for cross-destination publishing.

### Destination Services

- `FacebookPublisher`
  - create unpublished Page post
  - schedule Page post
  - publish now to Page
  - update/cancel/delete remote Page post where supported
  - import remote Page feed state

- `InstagramPublisher`
  - create containers
  - publish image/reel/carousel
  - post first comment
  - fetch published IG media state

### Sync Services

- `FacebookSync`
  - Page `feed` webhook consumer
  - scheduled/unpublished/published import
  - projection updates

- `InstagramSync`
  - Instagram webhook consumer
  - published media reconciliation
  - engagement-state refresh where needed

- `MetaSyncOrchestrator`
  - idempotency
  - conflict handling
  - polling backfills
  - stale-state detection

## Source-of-Truth Rules

### Facebook

- Drafts/unpublished posts: remote-authoritative
- Scheduled posts: remote-authoritative
- Published posts: remote-authoritative
- Metadata edits: remote-authoritative for fields we manage remotely

### Instagram

- Drafts: app-managed
- Scheduled publishes: app-managed until remote publish completes
- Published posts: remote-authoritative
- Publish metadata after publish: remote-authoritative if editable via supported APIs, otherwise read-only with clear limitation messaging

### Shared Creative

- The app remains authoritative for:
  - briefs
  - overlays
  - media composition
  - generation history
  - brand-specific creative decisions

## Data Model Proposal

### New Tables

#### `meta_accounts`

Stores the Meta publishing pair and its capabilities.

Suggested fields:

- `id`
- `owner_hash`
- `auth_mode` (`facebook_login`, `instagram_login`, `env`)
- `graph_version`
- `page_id`
- `page_name`
- `page_access_token_encrypted`
- `page_token_expires_at`
- `instagram_user_id`
- `instagram_username`
- `instagram_name`
- `instagram_picture_url`
- `capabilities_json`
- `webhook_state_json`
- `created_at`
- `updated_at`

#### `post_destinations`

Stores destination-specific desired and remote state.

Suggested fields:

- `id`
- `post_id`
- `meta_account_id`
- `destination` (`facebook`, `instagram`)
- `enabled`
- `sync_mode` (`remote_authoritative`, `app_managed`)
- `desired_state` (`draft`, `scheduled`, `published`, `canceled`)
- `remote_state` (`draft`, `scheduled`, `publishing`, `published`, `failed`, `canceled`, `out_of_sync`)
- `caption`
- `first_comment`
- `location_id`
- `tags_json`
- `publish_at`
- `remote_object_id`
- `remote_container_id`
- `remote_permalink`
- `remote_payload_snapshot`
- `last_synced_at`
- `last_error`
- `created_at`
- `updated_at`

#### `sync_events`

Stores normalized webhook and polling events with replay support.

Suggested fields:

- `id`
- `meta_account_id`
- `destination`
- `source` (`webhook`, `poll`, `manual_reconcile`)
- `event_type`
- `idempotency_key`
- `payload_json`
- `processed_at`
- `created_at`

#### `sync_cursors`

Stores account-scoped reconciliation checkpoints.

Suggested fields:

- `id`
- `meta_account_id`
- `destination`
- `cursor_type`
- `cursor_value`
- `updated_at`

### Existing Table Changes

#### `posts`

Keep the current creative core in `posts`, but reduce destination-specific meaning:

- keep current brief / result / overlays / composition fields
- evolve post-level status into a rollup rather than the only lifecycle source
- move remote publish state out of `publishHistory`

#### `publish_jobs`

Keep the queue, but make it destination-aware:

- add `meta_account_id`
- add `destination`
- add `remote_authority`
- add `job_kind`
- add remote correlation IDs where useful

## Status Model

### Post-Level Rollup Status

- `draft`
- `partially_scheduled`
- `scheduled`
- `partially_published`
- `published`
- `archived`

### Destination-Level Status

- `draft`
- `scheduled`
- `publishing`
- `published`
- `failed`
- `canceled`
- `out_of_sync`

## API Proposal

### Account APIs

- `GET /api/meta/accounts`
- `POST /api/meta/accounts/connect`
- `POST /api/meta/accounts/:id/disconnect`
- `POST /api/meta/accounts/:id/install-webhooks`
- `GET /api/meta/accounts/:id/capabilities`

### Post Destination APIs

- `GET /api/posts/:id/destinations`
- `PUT /api/posts/:id/destinations`
- `POST /api/posts/:id/publish`
- `POST /api/posts/:id/schedule`
- `POST /api/posts/:id/cancel`
- `POST /api/posts/:id/reconcile`

### Webhook APIs

- `POST /api/webhooks/meta/page`
- `POST /api/webhooks/meta/instagram`

### Operational APIs

- `POST /api/meta/sync/full`
- `POST /api/meta/sync/account/:id`
- `GET /api/meta/status`

## UI / UX Proposal

### Account Surface

Replace "Instagram Publishing Account" with "Meta Publishing Pair".

Display:

- Page name
- Instagram username
- granted capabilities
- webhook health
- quota health
- auth source

### Composer

Add destination controls:

- `Facebook`
- `Instagram`
- `Both`

Per-destination edit panels should support:

- caption overrides
- first comment where applicable
- schedule time
- destination-specific warnings

### Planner

Display a unified planner with destination badges:

- `Meta-synced`
- `App-managed`
- `Out of sync`

Behavior:

- Facebook scheduled items are backed by remote objects.
- Instagram scheduled items are backed by local jobs until publish.
- Posts targeting both destinations can show split status if one destination succeeds and the other fails.

### Publish History

Show destination-aware remote records:

- Facebook post ID and permalink
- Instagram media ID and permalink
- sync timestamps
- event/audit log

## Sync Model

### Facebook Sync

Inputs:

- Page `feed` webhook
- Page feed polling/import

Responsibilities:

- ingest remote state changes
- project remote status into `post_destinations`
- detect local-vs-remote divergence
- attach remote permalinks and IDs

### Instagram Sync

Inputs:

- Instagram webhooks
- IG media reads

Responsibilities:

- reconcile published media records
- attach media IDs, permalinks, timestamps
- refresh remote comment/share-to-feed state when useful

### Conflict Policy

- If `sync_mode=remote_authoritative`, remote state wins for remote-managed fields.
- If `sync_mode=app_managed`, local state wins until publish succeeds.
- If a conflict affects user-visible scheduling/publishing, mark the destination `out_of_sync` and surface the discrepancy instead of overwriting silently.

## Capability and Constraint Handling

### Quotas

Do not hardcode Instagram publish quotas as the only source of truth.

Instead:

- query IG content publishing limit during publish readiness checks
- persist the latest live quota snapshot on the Meta account pair
- use conservative local guardrails only as fallback behavior

### Scheduling Windows

Because Meta docs conflict on Facebook scheduling windows, the app should:

- validate against a configurable server-side horizon
- re-read the created remote object after scheduling
- surface remote normalization if Meta adjusts the final schedule

### Feature Flags

Roll out behind flags:

- `meta_destinations_v1`
- `facebook_remote_schedule_v1`
- `meta_sync_v1`
- `instagram_publish_reconcile_v1`

## Migration Strategy

### Step 1: Schema Introduction

- add new tables
- add new nullable columns to existing tables
- no behavior change yet

### Step 2: Account Backfill

- backfill existing Meta OAuth records into `meta_accounts`
- preserve current cookie and env fallback behavior during transition

### Step 3: Destination Backfill

- create one `instagram` destination record for each existing post
- mark legacy posts as `instagram-only`

### Step 4: Adapter Layer

- route current publish flows through the new destination service interfaces
- keep existing endpoints functional during migration

### Step 5: UI Cutover

- progressively move UI reads to destination-aware projections

### Step 6: Legacy Cleanup

- retire single-destination assumptions once all reads and writes use destination projections

## Rollout Plan

### Phase 0: RFC and alignment

- land this RFC
- confirm cross-functional expectations on sync boundaries

### Phase 1: Meta account pair foundation

- introduce `meta_accounts`
- update auth resolution to produce a Page-centric account pair
- add capability health checks

### Phase 2: Destination data model

- introduce `post_destinations`
- make publish jobs destination-aware
- backfill legacy Instagram-only records

### Phase 3: Facebook destination service

- create Page publish now flow
- create remote draft flow
- create remote schedule flow
- import and reconcile Page state

### Phase 4: Instagram destination refactor

- wrap current IG publishing behind destination interfaces
- add published-state reconciliation and remote permalink capture

### Phase 5: Sync engine and webhooks

- ingest Page and Instagram webhook events
- add polling backfills and out-of-sync detection

### Phase 6: UI cutover

- destination toggles in composer
- unified planner
- destination-aware queue and history

### Phase 7: Pilot and stabilization

- pilot with `inesueno.wines`
- run shadow sync
- compare app state against Meta web tools before broad rollout

## PR Breakdown

The implementation should be delivered in small reviewable PRs.

### PR 1: RFC and roadmap alignment

Scope:

- add this RFC
- link it from the Meta publishing roadmap

Validation:

- docs-only review

### PR 2: Meta account pair schema and auth refactor

Scope:

- add `meta_accounts`
- refactor auth resolution around Page + Instagram pair
- add capability snapshot plumbing

Validation:

- auth unit tests
- migration tests

### PR 3: Destination schema and legacy backfill

Scope:

- add `post_destinations`
- add destination-aware publish job columns
- backfill legacy posts/jobs

Validation:

- migration tests
- post service tests

### PR 4: Facebook publish and schedule service

Scope:

- implement Page publish now
- implement unpublished/scheduled Page post creation
- add cancel/update/delete where supported

Validation:

- service tests with mocked Graph responses
- API route tests

### PR 5: Facebook sync import and webhook ingestion

Scope:

- Page feed import
- Page webhook endpoint
- remote-authoritative projection updates

Validation:

- webhook tests
- reconciliation tests

### PR 6: Instagram destination adapter

Scope:

- adapt current IG flow to destination service contract
- attach remote IDs/permalinks consistently
- remove IG-only assumptions from job orchestration

Validation:

- publish tests
- queue tests

### PR 7: Instagram reconciliation and sync state

Scope:

- published-media reads
- webhook ingestion
- out-of-sync detection

Validation:

- reconciliation tests
- polling/import tests

### PR 8: Composer and planner UI cutover

Scope:

- destination toggles
- destination-aware queue and planner
- sync badges and error states

Validation:

- component tests
- end-to-end happy paths

### PR 9: Operational hardening

Scope:

- quota health
- capability caching
- retry/idempotency tuning
- observability and audit trail polish

Validation:

- integration tests
- manual pilot runbook

## Risks

### 1. Meta product/API mismatch

Business Suite may surface internal concepts that public APIs do not expose directly.

Mitigation:

- clearly label `Meta-synced` vs `App-managed`
- never promise planner parity for unsupported Instagram objects

### 2. Doc inconsistencies

Meta's public docs currently conflict on quotas and scheduling windows.

Mitigation:

- prefer runtime inspection
- keep server-side validation configurable

### 3. State divergence

Users may edit Facebook-side objects in Meta tools and Instagram-side content in Instagram-native tools.

Mitigation:

- webhooks + polling
- out-of-sync state
- remote-wins policy for remote-authoritative destinations

### 4. Token and permissions complexity

Cross-destination publishing requires more nuanced permission, task, and token handling.

Mitigation:

- centralize capability resolution in `meta_accounts`
- surface capability health in settings/status

## Open Questions

1. Should we retain Instagram Login as a first-class auth path in v1, or standardize on Facebook Login for Business for all Meta-connected workspaces?
2. Should destination captions diverge immediately, or should the first release default to one shared caption with optional overrides later?
3. Should Facebook remote drafts be created eagerly when a user enables `Facebook`, or only when they explicitly save/schedule/publish?
4. How aggressively should we import pre-existing remote Facebook scheduled posts into local posts during initial sync?
5. Do we want a dedicated `out_of_sync` inbox or activity panel for operators?

## Acceptance Criteria

- Users can publish a post to `facebook`, `instagram`, or `both`.
- Facebook scheduled content created by the app appears in Meta tools and can be reconciled back into the app.
- Instagram publishes create remote media records that reconcile IDs, permalinks, and timestamps back into the app.
- The planner clearly distinguishes remote-authoritative vs app-managed destination state.
- Destination errors do not silently collapse into a single post-level status.
- No unsupported sync promise is implied for Instagram drafts, planner objects, or Business Suite assets.

## Recommendation

Proceed with the architecture in this RFC.

The best first implementation slice is:

1. account-pair foundation
2. destination schema
3. Facebook destination service
4. Instagram adapter refactor

That sequence produces the most user-visible strategic value while minimizing churn to the existing Instagram publisher.
