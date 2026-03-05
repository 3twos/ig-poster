#!/bin/bash
# Blocks Edit/Write/Bash operations that target files outside the current worktree.
# If the session cwd is inside .claude/worktrees/, only files under that worktree
# (or /tmp, /private/tmp) are allowed. Sessions running from the main repo are unrestricted.

set -euo pipefail

# Dependency check: jq is required to parse hook input
if ! command -v jq &>/dev/null; then
  exit 0  # Skip enforcement when jq is unavailable
fi

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
SESSION_CWD=$(echo "$INPUT" | jq -r '.cwd')

# Only enforce when the session is inside a worktree
if [[ "$SESSION_CWD" != *"/.claude/worktrees/"* ]]; then
  exit 0
fi

# Extract the worktree root (everything up to and including the worktree name)
WORKTREE_ROOT=$(echo "$SESSION_CWD" | sed 's|\(/.claude/worktrees/[^/]*\).*|\1|')

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
    # For Bash, scan the command for common file-writing patterns targeting outside the worktree.
    # We can't catch everything, but we block obvious cases like redirects and git commits.
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

    # Allow read-only / safe commands unconditionally
    if echo "$CMD" | grep -qE '^\s*(cat|head|tail|ls|tree|pwd|cd|git (status|diff|log|show|branch|rev-parse|worktree)|npm run (lint|build)|echo|wc|du|stat|find|rg)\b'; then
      exit 0
    fi

    # Block git commit/push/add from outside the worktree
    if echo "$CMD" | grep -qE '\bgit\s+(commit|add|push|stash|checkout|switch)\b'; then
      # Check if cwd would resolve to the main repo
      MAIN_REPO=$(echo "$WORKTREE_ROOT" | sed 's|/.claude/worktrees/[^/]*$||')
      if [[ "$SESSION_CWD" == "$MAIN_REPO" ]] || [[ "$SESSION_CWD" == "$MAIN_REPO/"* && "$SESSION_CWD" != *"/.claude/worktrees/"* ]]; then
        echo "BLOCKED: git write command detected outside worktree. Run git commands from inside your worktree ($WORKTREE_ROOT)." >&2
        exit 2
      fi
    fi
    ;;
esac

exit 0
