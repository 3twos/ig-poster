#!/bin/bash
# Enforces AGENTS.md PR workflow rules mechanically.
# Runs as a PreToolUse hook on Bash commands.
#
# Rules enforced:
# 1. gh pr create/edit/comment must use --body-file, never inline --body
# 2. gh pr merge blocked if unresolved review threads exist
# 3. gh pr merge blocked if PR has merge conflicts or conflict status unknown
# 4. git push blocked unless lint, test, and build have been run this session
#
# Note: Additional workflow rules (e.g., explicit user approval, Copilot review waits)
# are defined in AGENTS.md but enforced by convention, not this hook.

set -euo pipefail

# Dependency check: jq and gh are required
if ! command -v jq &>/dev/null || ! command -v gh &>/dev/null; then
  echo "BLOCKED: jq and gh are required for pr-workflow-guard but were not found in PATH. Install them to proceed." >&2
  exit 2  # Deny-by-default when dependencies are missing
fi

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
  # Extract PR number from command, or resolve from current branch
  PR_NUM=$(echo "$CMD" | grep -oE '\bgh\s+pr\s+merge\s+([0-9]+)' | awk '{print $NF}')

  if [ -z "$PR_NUM" ]; then
    # Try to resolve PR number from current branch
    PR_NUM=$(gh pr view --json number --jq .number 2>/dev/null || echo "")
  fi

  if [ -z "$PR_NUM" ]; then
    echo "BLOCKED: Could not determine PR number. Specify it explicitly: gh pr merge <number> (AGENTS.md §Merge Gate)." >&2
    exit 2
  fi

  # Determine repository owner/name dynamically
  REPO_NWO=""
  if [[ -n "${GH_REPO:-}" ]]; then
    REPO_NWO="$GH_REPO"
  else
    REPO_NWO=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || echo "")
  fi

  if [ -z "$REPO_NWO" ]; then
    echo "BLOCKED: Could not determine repository. Check manually before merging (AGENTS.md §Merge Gate)." >&2
    exit 2
  fi

  REPO_OWNER="${REPO_NWO%%/*}"
  REPO_NAME="${REPO_NWO##*/}"

  # Check for unresolved review threads
  UNRESOLVED=$(gh api graphql -f query="
    query(\$owner: String!, \$name: String!, \$number: Int!) {
      repository(owner: \$owner, name: \$name) {
        pullRequest(number: \$number) {
          reviewThreads(first: 50) {
            nodes { isResolved }
          }
        }
      }
    }" -F owner="$REPO_OWNER" -F name="$REPO_NAME" -F number="$PR_NUM" 2>/dev/null | jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length' 2>/dev/null || echo "unknown")

  if [[ "$UNRESOLVED" == "unknown" ]]; then
    echo "BLOCKED: Could not verify review thread status for PR #$PR_NUM. Check manually before merging (AGENTS.md §Merge Gate)." >&2
    exit 2
  elif [[ "$UNRESOLVED" -gt 0 ]]; then
    echo "BLOCKED: PR #$PR_NUM has $UNRESOLVED unresolved review thread(s). Resolve all conversations before merging (AGENTS.md §Merge Gate)." >&2
    exit 2
  fi

  # Check for merge conflicts
  MERGEABLE=$(gh pr view "$PR_NUM" --json mergeable --jq '.mergeable' 2>/dev/null || echo "unknown")
  if [[ "$MERGEABLE" == "unknown" ]]; then
    echo "BLOCKED: Could not verify merge conflict status for PR #$PR_NUM. Check manually before merging (AGENTS.md §Merge Gate)." >&2
    exit 2
  elif [[ "$MERGEABLE" == "CONFLICTING" ]]; then
    echo "BLOCKED: PR #$PR_NUM has merge conflicts. Rebase or merge the base branch first (AGENTS.md §Merge Gate)." >&2
    exit 2
  fi
fi

# ─── Rule 4: Lint+test+build before push ─────────────────────────────────
# Track lint/test/build runs via marker files; block push if missing.
# Namespace markers by repo root to avoid cross-repo contamination.
MARKER_BASE_DIR="/tmp/.claude-pr-guards"
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
if [ -n "$REPO_ROOT" ]; then
  REPO_HASH=$(printf '%s' "$REPO_ROOT" | shasum | awk '{print $1}')
  MARKER_DIR="$MARKER_BASE_DIR/$REPO_HASH"
else
  MARKER_DIR="$MARKER_BASE_DIR/unknown-repo"
fi

# Record lint/test/build completions
if echo "$CMD" | grep -qE '\bnpm\s+run\s+lint\b'; then
  mkdir -p "$MARKER_DIR"
  touch "$MARKER_DIR/lint-passed"
  exit 0
fi
if echo "$CMD" | grep -qE '\bnpm\s+(run\s+test|test)\b'; then
  mkdir -p "$MARKER_DIR"
  touch "$MARKER_DIR/test-passed"
  exit 0
fi
if echo "$CMD" | grep -qE '\bnpx\s+vitest\b'; then
  mkdir -p "$MARKER_DIR"
  touch "$MARKER_DIR/test-passed"
  exit 0
fi
if echo "$CMD" | grep -qE '\bnpm\s+run\s+build\b'; then
  mkdir -p "$MARKER_DIR"
  touch "$MARKER_DIR/build-passed"
  exit 0
fi

# Block push if lint, test, or build hasn't been run
if echo "$CMD" | grep -qE '\bgit\s+push\b'; then
  MISSING=""
  if [ ! -f "$MARKER_DIR/lint-passed" ] 2>/dev/null; then
    MISSING="lint"
  fi
  if [ ! -f "$MARKER_DIR/test-passed" ] 2>/dev/null; then
    MISSING="${MISSING:+$MISSING, }test"
  fi
  if [ ! -f "$MARKER_DIR/build-passed" ] 2>/dev/null; then
    MISSING="${MISSING:+$MISSING, }build"
  fi
  if [ -n "$MISSING" ]; then
    echo "BLOCKED: Must run $MISSING before pushing (AGENTS.md §PR Flow step 4). Run: npm run lint && npm test && npm run build" >&2
    exit 2
  fi
fi

exit 0
