#!/usr/bin/env bash
set -euo pipefail

if [[ ${1:-} == "" ]]; then
  echo "Usage: $0 <worktree-path>"
  echo "Example: $0 ../ig-poster-worktrees/codex-copy-agent-20260303-123000"
  exit 1
fi

WORKTREE_PATH="$1"

if [[ ! -d "$WORKTREE_PATH" ]]; then
  echo "Worktree path not found: $WORKTREE_PATH" >&2
  exit 1
fi

REPO_ROOT="$(git -C "$WORKTREE_PATH" rev-parse --show-toplevel)"
BRANCH="$(git -C "$WORKTREE_PATH" branch --show-current)"

git -C "$REPO_ROOT" worktree remove "$WORKTREE_PATH"

if [[ -n "$BRANCH" ]]; then
  if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git -C "$REPO_ROOT" branch -D "$BRANCH"
  fi
fi

echo "Removed worktree: $WORKTREE_PATH"
if [[ -n "$BRANCH" ]]; then
  echo "Deleted local branch: $BRANCH"
fi
