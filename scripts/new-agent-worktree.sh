#!/usr/bin/env bash
set -euo pipefail

if [[ ${1:-} == "" ]]; then
  echo "Usage: $0 <agent-name> [base-branch]"
  echo "Example: $0 copy-agent main"
  exit 1
fi

AGENT_NAME="$1"
BASE_BRANCH="${2:-main}"

ROOT_DIR="$(git rev-parse --show-toplevel)"
REPO_NAME="$(basename "$ROOT_DIR")"
SAFE_AGENT="$(echo "$AGENT_NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g;s/^-+|-+$//g')"

if [[ -z "$SAFE_AGENT" ]]; then
  echo "Agent name produced empty slug. Use letters/numbers." >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BRANCH="codex/${SAFE_AGENT}-${TIMESTAMP}"
WORKTREE_PARENT="$(dirname "$ROOT_DIR")/${REPO_NAME}-worktrees"
WORKTREE_PATH="$WORKTREE_PARENT/${BRANCH//\//-}"

mkdir -p "$WORKTREE_PARENT"

cd "$ROOT_DIR"
git fetch origin --prune

if ! git show-ref --verify --quiet "refs/remotes/origin/${BASE_BRANCH}"; then
  echo "Base branch origin/${BASE_BRANCH} not found" >&2
  exit 1
fi

git worktree add -b "$BRANCH" "$WORKTREE_PATH" "origin/${BASE_BRANCH}"

cat <<INFO
Created worktree:
  Path:   $WORKTREE_PATH
  Branch: $BRANCH

Next steps:
  cd "$WORKTREE_PATH"
  git push -u origin "$BRANCH"
  gh pr create --base "$BASE_BRANCH" --head "$BRANCH" --fill
INFO
