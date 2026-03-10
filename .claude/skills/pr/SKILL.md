---
name: pr
description: >
  Full PR lifecycle: worktree, branch, implement, validate, PR, review, address comments, cleanup.
  Use when the user wants to make a change via PR workflow.
argument-hint: <task-description>
---

# Full PR Lifecycle

Execute the complete PR workflow for: $ARGUMENTS

Follow every phase in order. Do not skip phases. Refer to AGENTS.md for detailed rules.

---

## Phase 1: Setup

1. Derive a short kebab-case slug from the task (e.g. `fix-login-bug`).
2. Create worktree: `./scripts/new-agent-worktree.sh <slug>`
3. `cd` into the worktree path printed by the script.
4. Pre-flight: `git status --short` — if unexpected files, stop and ask.

## Phase 2: Implement

1. Implement the requested changes.
2. Run full validation:
   ```
   npm run lint && npm run test && npm run build
   ```
3. Fix any failures before proceeding.
4. Commit with a clear message. Push: `git push -u origin HEAD`

## Phase 3: Create PR

1. Write PR body markdown to a temp file (never inline `--body`).
   - Include: summary of changes, validation evidence, doc impact, risks/follow-ups.
2. Create PR: `gh pr create --title "<title>" --body-file <temp-file>`
3. Verify rendering: `gh pr view <number> --json body --jq .body`
4. Save the PR number for subsequent phases.

## Phase 4: Wait for Copilot review

Copilot review is auto-requested — do NOT manually request it.

Poll every 30s (up to 8 minutes):
```
gh api repos/{owner}/{repo}/pulls/<number>/reviews --jq '[.[] | select(.state != "PENDING")] | length'
gh api repos/{owner}/{repo}/pulls/<number>/comments --jq 'length'
```

Once review activity appears (or timeout), proceed.

## Phase 5: Address review comments

1. Fetch review comments: `gh api repos/{owner}/{repo}/pulls/<number>/comments`
2. Fetch thread node IDs via GraphQL `pullRequest.reviewThreads`.
3. For each comment:
   - Actionable: fix, commit, push, reply with resolution.
   - Disagreed: reply with technical justification.
   - Resolve thread via GraphQL `resolveReviewThread` mutation.
4. Re-run validation: `npm run lint && npm run test && npm run build`
5. If no review comments, skip to Phase 6.

## Phase 6: Final update

1. Check merge status: `gh pr view <number> --json mergeable --jq .mergeable`
2. If CONFLICTING: rebase on main and push with `git push --force-with-lease` (intentional history rewrite after rebase).
3. Post a final PR comment (via `--body-file`) summarizing:
   - Changes made after review
   - All review comments resolved
   - Validation results
   - Doc impact assessment

## Phase 7: Await merge

Tell the user: **"PR #<number> is ready for review. Merge when ready, or let me know if you'd like changes."**

**STOP. Do not merge unless the user explicitly says to merge.**

If user approves merge:
- `gh pr merge <number> --squash --delete-branch`

## Phase 8: Cleanup

After merge (or if user abandons):
```
cd $CLAUDE_PROJECT_DIR
./scripts/remove-agent-worktree.sh <worktree-path>
```

Confirm cleanup complete.
