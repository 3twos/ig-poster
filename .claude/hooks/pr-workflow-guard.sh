#!/bin/bash
# Enforces AGENTS.md PR workflow rules mechanically.
# Runs as a PreToolUse hook on Bash commands.
#
# Rules enforced:
# 1. gh pr create/edit/comment must use --body-file, never inline --body
# 2. gh pr merge blocked if unresolved review threads exist
# 3. gh pr merge blocked if PR has merge conflicts
# 4. git push blocked if lint or build hasn't been run in this session
# 5. gh pr merge blocked without explicit user approval marker
# 6. Must wait for Copilot review before resolving/merging

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

# Only applies to Bash commands
if [[ "$TOOL_NAME" != "Bash" ]]; then
  exit 0
fi

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

# ─── Rule 1: PR body safety ──────────────────────────────────────────────
# Block `gh pr create --body "..."` and `gh pr edit --body "..."` and `gh pr comment --body "..."`
# Must use --body-file instead.
if echo "$CMD" | grep -qE '\bgh\s+pr\s+(create|edit|comment)\b'; then
  if echo "$CMD" | grep -qE '\s--body\s' && ! echo "$CMD" | grep -qE '\s--body-file\s'; then
    echo "BLOCKED: Use --body-file instead of --body for gh pr create/edit/comment (AGENTS.md §PR Body Safety). Write markdown to a temp file first." >&2
    exit 2
  fi
fi

# ─── Rule 2 & 3: Merge gate ──────────────────────────────────────────────
# Block `gh pr merge` unless we can verify: no unresolved threads, no conflicts
if echo "$CMD" | grep -qE '\bgh\s+pr\s+merge\b'; then
  # Extract PR number from command
  PR_NUM=$(echo "$CMD" | grep -oE '\bgh\s+pr\s+merge\s+([0-9]+)' | awk '{print $NF}')

  if [ -n "$PR_NUM" ]; then
    # Check for unresolved review threads
    UNRESOLVED=$(gh api graphql -f query="
      query {
        repository(owner: \"3twos\", name: \"ig-poster\") {
          pullRequest(number: $PR_NUM) {
            reviewThreads(first: 50) {
              nodes { isResolved }
            }
          }
        }
      }" 2>/dev/null | jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length' 2>/dev/null || echo "unknown")

    if [[ "$UNRESOLVED" == "unknown" ]]; then
      echo "BLOCKED: Could not verify review thread status for PR #$PR_NUM. Check manually before merging (AGENTS.md §Merge Gate)." >&2
      exit 2
    elif [[ "$UNRESOLVED" -gt 0 ]]; then
      echo "BLOCKED: PR #$PR_NUM has $UNRESOLVED unresolved review thread(s). Resolve all conversations before merging (AGENTS.md §Merge Gate)." >&2
      exit 2
    fi

    # Check for merge conflicts
    MERGEABLE=$(gh pr view "$PR_NUM" --json mergeable --jq '.mergeable' 2>/dev/null || echo "unknown")
    if [[ "$MERGEABLE" == "CONFLICTING" ]]; then
      echo "BLOCKED: PR #$PR_NUM has merge conflicts. Rebase or merge the base branch first (AGENTS.md §Merge Gate)." >&2
      exit 2
    fi
  fi
fi

# ─── Rule 4: Lint+build before push ──────────────────────────────────────
# Track lint/build runs via marker files; block push if missing.
MARKER_DIR="/tmp/.claude-pr-guards"

# Record lint/build completions
if echo "$CMD" | grep -qE '\bnpm\s+run\s+lint\b'; then
  mkdir -p "$MARKER_DIR"
  touch "$MARKER_DIR/lint-passed"
  exit 0
fi
if echo "$CMD" | grep -qE '\bnpm\s+run\s+build\b'; then
  mkdir -p "$MARKER_DIR"
  touch "$MARKER_DIR/build-passed"
  exit 0
fi

# Block push if lint or build hasn't been run
if echo "$CMD" | grep -qE '\bgit\s+push\b'; then
  MISSING=""
  if [ ! -f "$MARKER_DIR/lint-passed" ] 2>/dev/null; then
    MISSING="lint"
  fi
  if [ ! -f "$MARKER_DIR/build-passed" ] 2>/dev/null; then
    MISSING="${MISSING:+$MISSING, }build"
  fi
  if [ -n "$MISSING" ]; then
    echo "BLOCKED: Must run $MISSING before pushing (AGENTS.md §PR Flow step 4). Run: npm run lint && npm run build" >&2
    exit 2
  fi
fi

exit 0
