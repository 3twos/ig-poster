# Fix Auto-Save Failures: Robust & Reliable Solution

## Context

The auto-save system has had 4+ fix attempts (PRs #166, #174, branches `fix-autosave-*`, `investigate-save-failures`). Each addressed a symptom without fixing the root causes:

- **PR #166** (`d142cba`): Stripped `destinations` from serialization to stop infinite loops — but left infinite retry on all other errors
- **PR #174** (`66ce57f`, on `origin/main` but not this branch): Added `post-draft.ts` with explicit field mapping and user tag sanitization — but didn't add retry limits or error classification

**Remaining failures:** Any 400 (Zod validation), 404 (deleted post), or 409 (locked post) triggers infinite 5-second retries forever. The `.passthrough()` on schemas masks client bugs. The `beforeunload` handler fires redundant saves.

## Changes

### 1. New file: `src/lib/post-draft.ts`
Port from PR #174 (commit `66ce57f`). Explicit field mapping + user tag sanitization.

- `buildPostUpdateRequest(draft)` — maps only the 17 API-accepted fields, excludes `id`/`archivedAt`/`destinations`/`activeSlideIndex`
- Normalizes `mediaComposition.items[].userTags`: trims whitespace, strips leading `@`, drops empty usernames, omits `userTags` key if array becomes empty
- `serializePostDraft(draft)` — `JSON.stringify(buildPostUpdateRequest(draft))`

### 2. New file: `src/lib/post-draft.test.ts`
- Omits transient/read-only fields (`id`, `archivedAt`, `destinations`, `activeSlideIndex`)
- Includes all 17 API fields
- User tag normalization edge cases
- Output passes `PostUpdateRequestSchema.parse()`

### 3. Modify: `src/hooks/use-auto-save.ts`
**Error classification + retry limits + exponential backoff:**

- Permanent errors (400, 401, 403, 404, 409, 422): set `"error"`, **no retry**
- Transient errors (500, network): retry up to 3 times with exponential backoff (5s → 15s → 45s)
- Reset retry counter on success or new draft change (so user edits after failure get fresh attempts)
- Add `retryCountRef` alongside existing refs

**Delegate serialization:**
- `serializeDraft()` calls `serializePostDraft()` from `post-draft.ts` (keeps export for compat)
- All internal calls use `serializePostDraft()` directly

**Expose `lastSavedRef`** in return value for beforeunload comparison.

### 4. Extend: `src/hooks/use-auto-save.test.tsx`
New test cases:
- 400/404/409 → `"error"` status, no retry (fetch called once)
- 500 → retries with backoff, succeeds on 3rd attempt
- 500 → gives up after MAX_RETRIES (4 total calls: 1 + 3 retries)
- Network error → retries like transient
- New draft change resets retry counter after failure

### 5. Modify: `src/lib/post-schemas.ts`
Change `.passthrough()` → `.strip()` on both `PostUpdateRequestSchema` and `PostCreateRequestSchema`. Unknown fields get silently removed instead of passing through. Safe because `updatePost`/`createPost` already use explicit field picking.

### 6. Modify: `src/contexts/post-context.tsx`
- Import `serializePostDraft` from `post-draft.ts`, drop `serializeDraft` import
- Use `lastSavedRef` from `useAutoSave` return value
- `beforeunload` handler: compare serialized draft against `lastSavedRef.current`, skip fetch if equal

## Verification
1. `npm run lint` — no import/unused-variable issues
2. `npm run test` — all existing + new tests pass
3. `npm run build` — no type errors
