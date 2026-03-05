#!/bin/bash
# Blocks Edit/Write/Bash operations that target files outside the current worktree.
# Detects worktrees via git (git rev-parse --show-toplevel) or by .claude/worktrees/ path.
# Sessions running from the main repo checkout are unrestricted.

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
SESSION_CWD=$(echo "$INPUT" | jq -r '.cwd')

# Determine if we're in a worktree by checking git
WORKTREE_ROOT=""
if command -v git &>/dev/null; then
  GIT_TOPLEVEL=$(git -C "$SESSION_CWD" rev-parse --show-toplevel 2>/dev/null || echo "")
  GIT_COMMON=$(git -C "$SESSION_CWD" rev-parse --git-common-dir 2>/dev/null || echo "")
  GIT_DIR=$(git -C "$SESSION_CWD" rev-parse --git-dir 2>/dev/null || echo "")

  # If git-common-dir differs from git-dir, we're in a worktree
  if [ -n "$GIT_COMMON" ] && [ -n "$GIT_DIR" ] && [ -n "$GIT_TOPLEVEL" ]; then
    RESOLVED_COMMON=$(cd "$SESSION_CWD" && cd "$GIT_COMMON" 2>/dev/null && pwd || echo "")
    RESOLVED_DIR=$(cd "$SESSION_CWD" && cd "$GIT_DIR" 2>/dev/null && pwd || echo "")
    if [ -n "$RESOLVED_COMMON" ] && [ -n "$RESOLVED_DIR" ] && [ "$RESOLVED_COMMON" != "$RESOLVED_DIR" ]; then
      WORKTREE_ROOT="$GIT_TOPLEVEL"
    fi
  fi
fi

# Fallback: detect .claude/worktrees/ path pattern
if [ -z "$WORKTREE_ROOT" ] && [[ "$SESSION_CWD" == *"/.claude/worktrees/"* ]]; then
  WORKTREE_ROOT=$(echo "$SESSION_CWD" | sed 's|\(/.claude/worktrees/[^/]*\).*|\1|')
fi

# Not in a worktree — unrestricted
if [ -z "$WORKTREE_ROOT" ]; then
  exit 0
fi

get_file_path() {
  echo "$INPUT" | jq -r '.tool_input.file_path // empty'
}

check_path() {
  local fp="$1"
  [ -z "$fp" ] && return 0

  # Allow temp directories
  if [[ "$fp" == /tmp/* ]] || [[ "$fp" == /private/tmp/* ]]; then
    return 0
  fi

  # Allow paths inside the worktree
  if [[ "$fp" == "$WORKTREE_ROOT"/* ]]; then
    return 0
  fi

  echo "BLOCKED: File '$fp' is outside the worktree ($WORKTREE_ROOT). Create/use a proper worktree for this task." >&2
  exit 2
}

case "$TOOL_NAME" in
  Edit|Write)
    FILE_PATH=$(get_file_path)
    check_path "$FILE_PATH"
    ;;
  Bash)
    # For Bash, apply lightweight safeguards: allow a set of read-only/safe commands,
    # and detect certain git write commands that should not run from outside the worktree.
    # Note: this guard does NOT parse or validate shell redirections (>, >>, tee, cat >, etc.)
    # or arbitrary output paths; such operations may still write outside the worktree.
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

    # Allow read-only / safe commands unconditionally
    if echo "$CMD" | grep -qE '^\s*(cat|head|tail|ls|tree|pwd|cd|git (status|diff|log|show|branch|rev-parse|worktree)|npm run (lint|build|test)|npx vitest|echo|wc|du|stat|find|rg)\b'; then
      exit 0
    fi

    # Block git write commands — verify they target this worktree
    if echo "$CMD" | grep -qE '\bgit\s+(commit|add|push|stash|checkout|switch)\b'; then
      # Check if the command specifies a -C path outside the worktree
      GIT_C_PATH=$(echo "$CMD" | grep -oE '\bgit\s+-C\s+\S+' | awk '{print $3}' || echo "")
      if [ -n "$GIT_C_PATH" ]; then
        RESOLVED_C=$(cd "$SESSION_CWD" && cd "$GIT_C_PATH" 2>/dev/null && pwd || echo "$GIT_C_PATH")
        if [[ "$RESOLVED_C" != "$WORKTREE_ROOT"* ]]; then
          echo "BLOCKED: git write command targets '$RESOLVED_C' which is outside the worktree ($WORKTREE_ROOT)." >&2
          exit 2
        fi
      fi
    fi
    ;;
esac

exit 0
