#!/usr/bin/env zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI_ENTRY="$REPO_ROOT/dist/cli/main.js"

HOST="${IG_SHOWCASE_HOST:-${IG_POSTER_HOST:-http://localhost:3000}}"
PROFILE="${IG_SHOWCASE_PROFILE:-${IG_POSTER_PROFILE:-default}}"
CONFIG_DIR="${IG_SHOWCASE_CONFIG_DIR:-${IG_POSTER_CONFIG_DIR:-}}"
POST_ID="${IG_SHOWCASE_POST_ID:-}"
CHAT_PROMPT="${IG_SHOWCASE_CHAT_PROMPT:-Give me three stronger hooks for this draft.}"
IMAGE_URL="${IG_SHOWCASE_IMAGE_URL:-}"
CAPTION="${IG_SHOWCASE_CAPTION:-CLI showcase dry run}"
BRAND_KIT_ID="${IG_SHOWCASE_BRAND_KIT_ID:-bk_showcase}"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/ig-cli-showcase.XXXXXX")"
PROJECT_DIR="$TMP_ROOT/project"
FLAGS_FILE="$TMP_ROOT/showcase.flags"
COMPLETION_FILE="$TMP_ROOT/_ig"

cleanup() {
  rm -rf "$TMP_ROOT"
}

trap cleanup EXIT

if [[ -n "$CONFIG_DIR" ]]; then
  export IG_POSTER_CONFIG_DIR="$CONFIG_DIR"
fi

section() {
  print
  print "== $1 =="
}

show_env() {
  print "repo: $REPO_ROOT"
  print "host: $HOST"
  print "profile: $PROFILE"
  if [[ -n "$CONFIG_DIR" ]]; then
    print "configDir: $CONFIG_DIR"
  else
    print "configDir: default (~/.config/ig-poster)"
  fi
}

run_repo_cli() {
  (
    cd "$REPO_ROOT"
    node "$CLI_ENTRY" "$@"
  )
}

run_project_cli() {
  (
    cd "$PROJECT_DIR"
    node "$CLI_ENTRY" "$@"
  )
}

run_step() {
  local label="$1"
  shift

  section "$label"
  if "$@"; then
    return 0
  fi

  local exit_code=$?
  print "step exited with status $exit_code"
  return 0
}

build_cli() {
  if [[ ! -x "$REPO_ROOT/node_modules/.bin/tsc" ]]; then
    print -u2 "Missing local dev dependencies."
    print -u2 "Run: cd $REPO_ROOT && npm install"
    exit 1
  fi

  (
    cd "$REPO_ROOT"
    npm run build:cli --silent
  )
}

write_flags_file() {
  print -r -- "--json" > "$FLAGS_FILE"
  print -r -- "--timeout" >> "$FLAGS_FILE"
  print -r -- "30000" >> "$FLAGS_FILE"
}

preview_completion() {
  run_repo_cli completion zsh > "$COMPLETION_FILE"
  print "saved zsh completion preview to $COMPLETION_FILE"
  sed -n '1,12p' "$COMPLETION_FILE"
}

optional_post_demo() {
  if [[ -z "$POST_ID" ]]; then
    section "Post-backed demo skipped"
    print "Set IG_SHOWCASE_POST_ID to run generate/chat/refine examples."
    return 0
  fi

  run_step \
    "Generate run (JSON)" \
    run_project_cli --json generate run --post "$POST_ID"

  run_step \
    "Chat ask (JSON)" \
    run_project_cli --json chat ask --post "$POST_ID" "$CHAT_PROMPT"

  run_step \
    "Generate refine (JSON)" \
    run_project_cli --json generate refine \
      --post "$POST_ID" \
      --instruction "Make this more editorial and concise."
}

optional_publish_demo() {
  if [[ -z "$IMAGE_URL" ]]; then
    section "Publish demo skipped"
    print "Set IG_SHOWCASE_IMAGE_URL to run an ig publish --dry-run example."
    return 0
  fi

  run_step \
    "Publish dry run (JSON)" \
    run_project_cli --json --dry-run publish \
      --image "$IMAGE_URL" \
      --caption "$CAPTION"
}

main() {
  mkdir -p "$PROJECT_DIR"
  write_flags_file

  section "Build CLI"
  build_cli

  section "Showcase environment"
  show_env

  run_step "CLI help" run_repo_cli help
  run_step "Configured host" run_repo_cli --host "$HOST" --profile "$PROFILE" config get host
  run_step "Completion preview" preview_completion

  run_step \
    "Link temp project defaults" \
    run_project_cli link \
      --host "$HOST" \
      --profile "$PROFILE" \
      --brand-kit "$BRAND_KIT_ID" \
      --output-dir out

  run_step \
    "Status via project link + --flags-file" \
    run_project_cli --flags-file "$FLAGS_FILE" status

  run_step "Auth status (JSON)" run_project_cli --json auth status
  run_step "Brand kits list (JSON)" run_project_cli --json brand-kits list
  run_step "Posts list (JSON)" run_project_cli --json posts list
  run_step "Queue list (JSON)" run_project_cli --json queue list --limit 5
  run_step "Raw API /api/v1/status" run_project_cli --json api GET /api/v1/status

  optional_post_demo
  optional_publish_demo

  run_step "Unlink temp project" run_project_cli --json unlink
}

main "$@"
