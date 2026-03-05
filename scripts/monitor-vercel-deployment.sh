#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Continuously monitor Vercel deployment status until you stop the script (Ctrl+C).

Usage:
  ./scripts/monitor-vercel-deployment.sh [deployment-id-or-url] [options]

Modes:
  1) Deployment mode
     - Pass a deployment id/url as the first argument.
  2) Project mode (latest deployment watcher)
     - Omit the first argument and pass --project-id (or set VERCEL_PROJECT_ID).
     - Script automatically switches to each new latest deployment.

Options:
  -i, --interval <seconds>  Poll interval in seconds (default: 10)
  --timeout <seconds>       Optional script timeout (default: 0, disabled)
  --project-id <id>         Project id for latest-deployment watcher mode
  --team-id <id>            Team/org id (default: $VERCEL_TEAM_ID or $VERCEL_ORG_ID)
  --token <token>           Vercel token (default: $VERCEL_TOKEN, or secure prompt)
  --no-speak                Disable spoken alerts
  -h, --help                Show help

Examples:
  # Watch latest deployment for a project until Ctrl+C
  VERCEL_TOKEN=... VERCEL_PROJECT_ID=... ./scripts/monitor-vercel-deployment.sh --interval 5

  # Watch one deployment continuously until Ctrl+C
  ./scripts/monitor-vercel-deployment.sh dpl_123abc --interval 5
HELP
}

print_error() {
  echo "Error: $*" >&2
}

log_line() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"
}

warn_line() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*" >&2
}

normalize_target() {
  local target="$1"

  target="${target#https://}"
  target="${target#http://}"
  target="${target%%\?*}"
  target="${target%%#*}"
  target="${target%/}"

  # Allow dashboard URLs like vercel.com/<team>/<project>/<deployment-id>.
  if [[ "$target" == vercel.com/* ]]; then
    target="${target##*/}"
  fi

  # For URLs with paths, keep only the host.
  if [[ "$target" == */* ]]; then
    target="${target%%/*}"
  fi

  printf '%s' "$target"
}

parse_deployment_payload() {
  node -e '
const fs = require("node:fs");

const input = fs.readFileSync(0, "utf8");
let payload;

try {
  payload = JSON.parse(input);
} catch (error) {
  console.error(`PARSE_ERROR\t${error.message}`);
  process.exit(2);
}

if (payload && payload.error) {
  const code = typeof payload.error.code === "string" ? payload.error.code : "API_ERROR";
  const message =
    typeof payload.error.message === "string" ? payload.error.message : "Unknown API error.";
  console.error(`${code}\t${message}`);
  process.exit(3);
}

const text = (value) => (typeof value === "string" ? value : "");
const intMs = (value) =>
  typeof value === "number" && Number.isFinite(value) ? String(Math.trunc(value)) : "";

const status = text(payload.readyState || payload.state).toUpperCase() || "UNKNOWN";
const deploymentId = text(payload.id || payload.uid);
const deploymentUrl = text(payload.url) ? `https://${payload.url}` : "";
const createdAtMs = intMs(payload.createdAt);
const readyAtMs = intMs(payload.ready);
const errorMessage = text(payload.errorMessage || payload.errorCode);

process.stdout.write(
  [status, deploymentId, deploymentUrl, createdAtMs, readyAtMs, errorMessage].join("\u001f"),
);
'
}

parse_latest_deployment_payload() {
  node -e '
const fs = require("node:fs");

const input = fs.readFileSync(0, "utf8");
let payload;

try {
  payload = JSON.parse(input);
} catch (error) {
  console.error(`PARSE_ERROR\t${error.message}`);
  process.exit(2);
}

if (payload && payload.error) {
  const code = typeof payload.error.code === "string" ? payload.error.code : "API_ERROR";
  const message =
    typeof payload.error.message === "string" ? payload.error.message : "Unknown API error.";
  console.error(`${code}\t${message}`);
  process.exit(3);
}

const deployments = Array.isArray(payload.deployments) ? payload.deployments : [];
if (deployments.length === 0) {
  process.stdout.write("");
  process.exit(0);
}

const latest = deployments[0] ?? {};
const text = (value) => (typeof value === "string" ? value : "");
const id = text(latest.uid || latest.id);
const state = text(latest.readyState || latest.state).toUpperCase() || "UNKNOWN";
const url = text(latest.url) ? `https://${latest.url}` : "";

process.stdout.write([id, state, url].join("\u001f"));
'
}

build_deployment_url() {
  local target="$1"
  local url="https://api.vercel.com/v13/deployments/${target}"

  if [[ -n "$TEAM_ID" ]]; then
    url="${url}?teamId=${TEAM_ID}"
  fi

  printf '%s' "$url"
}

build_latest_deployment_url() {
  local url="https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&limit=1"

  if [[ -n "$TEAM_ID" ]]; then
    url="${url}&teamId=${TEAM_ID}"
  fi

  printf '%s' "$url"
}

fetch_json() {
  local url="$1"

  curl --silent --show-error --location \
    --header "Authorization: Bearer ${TOKEN}" \
    --header "Accept: application/json" \
    "$url"
}

format_duration() {
  local total_seconds="$1"

  if (( total_seconds < 60 )); then
    printf '%ss' "$total_seconds"
    return
  fi

  printf '%02d:%02d' $(( total_seconds / 60 )) $(( total_seconds % 60 ))
}

duration_seconds_for_active() {
  local created_at_ms="$1"
  local ready_at_ms="$2"

  local now_seconds start_seconds end_seconds
  now_seconds="$(date +%s)"

  if [[ "$created_at_ms" =~ ^[0-9]+$ ]]; then
    start_seconds=$(( created_at_ms / 1000 ))
  else
    start_seconds="$ACTIVE_FIRST_SEEN_EPOCH"
  fi

  if [[ "$ready_at_ms" =~ ^[0-9]+$ ]]; then
    end_seconds=$(( ready_at_ms / 1000 ))
  else
    end_seconds="$now_seconds"
  fi

  if (( end_seconds < start_seconds )); then
    end_seconds="$now_seconds"
  fi

  echo $(( end_seconds - start_seconds ))
}

speak_alert() {
  local message="$1"

  if [[ -z "$SPEAKER_CMD" ]]; then
    return
  fi

  # Speak asynchronously so polling is not blocked.
  (
    "$SPEAKER_CMD" "$message" >/dev/null 2>&1
  ) &
}

check_timeout_or_exit() {
  local elapsed_seconds

  if (( TIMEOUT_SECONDS == 0 )); then
    return
  fi

  elapsed_seconds=$(( $(date +%s) - START_EPOCH ))
  if (( elapsed_seconds >= TIMEOUT_SECONDS )); then
    warn_line "Timeout reached after ${TIMEOUT_SECONDS}s."
    exit 124
  fi
}

sleep_for_next_poll() {
  local elapsed_seconds remaining_seconds sleep_seconds

  if (( TIMEOUT_SECONDS == 0 )); then
    sleep "${INTERVAL_SECONDS}"
    return
  fi

  elapsed_seconds=$(( $(date +%s) - START_EPOCH ))
  if (( elapsed_seconds >= TIMEOUT_SECONDS )); then
    warn_line "Timeout reached after ${TIMEOUT_SECONDS}s."
    exit 124
  fi

  remaining_seconds=$(( TIMEOUT_SECONDS - elapsed_seconds ))
  sleep_seconds="${INTERVAL_SECONDS}"
  if (( remaining_seconds < sleep_seconds )); then
    sleep_seconds="${remaining_seconds}"
  fi

  sleep "${sleep_seconds}"
}

if ! command -v curl >/dev/null 2>&1; then
  print_error "curl is required."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  print_error "node is required."
  exit 1
fi

INTERVAL_SECONDS=10
TIMEOUT_SECONDS=0
TEAM_ID="${VERCEL_TEAM_ID:-${VERCEL_ORG_ID:-}}"
PROJECT_ID="${VERCEL_PROJECT_ID:-}"
TOKEN="${VERCEL_TOKEN:-}"
TOKEN_FROM_ARG=0
ENABLE_SPEAK=1
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -i|--interval)
      if [[ $# -lt 2 ]]; then
        print_error "$1 requires a value."
        exit 1
      fi
      INTERVAL_SECONDS="$2"
      shift 2
      ;;
    --timeout)
      if [[ $# -lt 2 ]]; then
        print_error "$1 requires a value."
        exit 1
      fi
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --project-id)
      if [[ $# -lt 2 ]]; then
        print_error "$1 requires a value."
        exit 1
      fi
      PROJECT_ID="$2"
      shift 2
      ;;
    --team-id|--scope|--org-id)
      if [[ $# -lt 2 ]]; then
        print_error "$1 requires a value."
        exit 1
      fi
      TEAM_ID="$2"
      shift 2
      ;;
    --token)
      if [[ $# -lt 2 ]]; then
        print_error "$1 requires a value."
        exit 1
      fi
      TOKEN="$2"
      TOKEN_FROM_ARG=1
      shift 2
      ;;
    --no-speak)
      ENABLE_SPEAK=0
      shift
      ;;
    --)
      shift
      break
      ;;
    -*)
      print_error "Unknown option: $1"
      usage
      exit 1
      ;;
    *)
      if [[ -n "$TARGET" ]]; then
        print_error "Unexpected argument: $1"
        usage
        exit 1
      fi
      TARGET="$1"
      shift
      ;;
  esac
done

if [[ -z "$TOKEN" && -t 0 ]]; then
  read -r -s -p "Vercel token: " TOKEN
  echo
fi

if [[ -z "$TOKEN" ]]; then
  print_error "Missing token. Use VERCEL_TOKEN, --token, or secure prompt in an interactive terminal."
  exit 1
fi

if (( TOKEN_FROM_ARG == 1 )); then
  warn_line "Warning: --token can leak via shell history/process list. Prefer VERCEL_TOKEN or secure prompt."
fi

if ! [[ "$INTERVAL_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  print_error "--interval must be a positive integer."
  exit 1
fi

if ! [[ "$TIMEOUT_SECONDS" =~ ^[0-9]+$ ]]; then
  print_error "--timeout must be a non-negative integer."
  exit 1
fi

WATCH_MODE="deployment"
if [[ -n "$TARGET" ]]; then
  TARGET="$(normalize_target "$TARGET")"
  if [[ -z "$TARGET" ]]; then
    print_error "Deployment target is empty after normalization."
    exit 1
  fi
else
  if [[ -z "$PROJECT_ID" ]]; then
    print_error "Provide a deployment id/url or set --project-id (or VERCEL_PROJECT_ID)."
    usage
    exit 1
  fi
  WATCH_MODE="project"
fi

SPEAKER_CMD=""
if (( ENABLE_SPEAK == 1 )); then
  if command -v say >/dev/null 2>&1; then
    SPEAKER_CMD="say"
  elif command -v spd-say >/dev/null 2>&1; then
    SPEAKER_CMD="spd-say"
  elif command -v espeak >/dev/null 2>&1; then
    SPEAKER_CMD="espeak"
  else
    warn_line "Speech command not found (checked: say, spd-say, espeak). Alerts will be text-only."
  fi
fi

if [[ "$WATCH_MODE" == "deployment" ]]; then
  log_line "Monitoring deployment '${TARGET}' every ${INTERVAL_SECONDS}s (Ctrl+C to stop)..."
else
  log_line "Monitoring latest deployment for project '${PROJECT_ID}' every ${INTERVAL_SECONDS}s (Ctrl+C to stop)..."
fi

if [[ -n "$TEAM_ID" ]]; then
  log_line "Using team id: ${TEAM_ID}"
fi

if [[ -n "$SPEAKER_CMD" ]]; then
  log_line "Spoken alerts enabled via '${SPEAKER_CMD}'."
fi

trap 'warn_line "Stopped deployment monitor."; exit 0' INT TERM

START_EPOCH="$(date +%s)"
ACTIVE_TARGET=""
ACTIVE_LAST_STATUS=""
ACTIVE_TERMINAL_ANNOUNCED=0
ACTIVE_FIRST_SEEN_EPOCH="$(date +%s)"
NO_DEPLOYMENTS_REPORTED=0

while true; do
  check_timeout_or_exit

  if [[ "$WATCH_MODE" == "project" ]]; then
    if ! LATEST_RESPONSE="$(fetch_json "$(build_latest_deployment_url)")"; then
      warn_line "Failed to fetch latest project deployment. Retrying..."
      sleep_for_next_poll
      continue
    fi

    if ! LATEST_PARSED="$(printf '%s' "${LATEST_RESPONSE}" | parse_latest_deployment_payload 2>&1)"; then
      warn_line "Latest deployment API error: ${LATEST_PARSED}"
      sleep_for_next_poll
      continue
    fi

    if [[ -z "$LATEST_PARSED" ]]; then
      if (( NO_DEPLOYMENTS_REPORTED == 0 )); then
        log_line "No deployments found yet for project '${PROJECT_ID}'."
        NO_DEPLOYMENTS_REPORTED=1
      fi
      sleep_for_next_poll
      continue
    fi

    NO_DEPLOYMENTS_REPORTED=0
    IFS=$'\x1f' read -r LATEST_ID LATEST_STATE LATEST_URL <<<"${LATEST_PARSED}"

    if [[ -z "$LATEST_ID" ]]; then
      warn_line "Latest deployment payload did not include a deployment id. Retrying..."
      sleep_for_next_poll
      continue
    fi

    if [[ "$ACTIVE_TARGET" != "$LATEST_ID" ]]; then
      ACTIVE_TARGET="$LATEST_ID"
      ACTIVE_LAST_STATUS=""
      ACTIVE_TERMINAL_ANNOUNCED=0
      ACTIVE_FIRST_SEEN_EPOCH="$(date +%s)"
      log_line "Watching deployment id=${ACTIVE_TARGET} url=${LATEST_URL:-n/a} state=${LATEST_STATE:-UNKNOWN}"
    fi
  elif [[ -z "$ACTIVE_TARGET" ]]; then
    ACTIVE_TARGET="$TARGET"
    ACTIVE_FIRST_SEEN_EPOCH="$(date +%s)"
  fi

  DETAIL_URL="$(build_deployment_url "$ACTIVE_TARGET")"
  if ! RESPONSE="$(fetch_json "$DETAIL_URL")"; then
    warn_line "Failed to fetch deployment '${ACTIVE_TARGET}'. Retrying..."
    sleep_for_next_poll
    continue
  fi

  if ! PARSED="$(printf '%s' "${RESPONSE}" | parse_deployment_payload 2>&1)"; then
    warn_line "Deployment API error for '${ACTIVE_TARGET}': ${PARSED}"
    sleep_for_next_poll
    continue
  fi

  IFS=$'\x1f' read -r STATUS DEPLOYMENT_ID DEPLOYMENT_URL CREATED_AT_MS READY_AT_MS ERROR_MESSAGE <<<"${PARSED}"
  if [[ -n "$DEPLOYMENT_ID" ]]; then
    ACTIVE_TARGET="$DEPLOYMENT_ID"
  else
    DEPLOYMENT_ID="$ACTIVE_TARGET"
  fi

  if [[ -n "$ACTIVE_LAST_STATUS" && "$STATUS" != "$ACTIVE_LAST_STATUS" ]]; then
    log_line "Transition: ${ACTIVE_LAST_STATUS} -> ${STATUS} (id=${DEPLOYMENT_ID})"
  fi

  log_line "status=${STATUS} id=${DEPLOYMENT_ID} url=${DEPLOYMENT_URL:-n/a}"

  case "$STATUS" in
    READY)
      if (( ACTIVE_TERMINAL_ANNOUNCED == 0 )); then
        DURATION_SECONDS="$(duration_seconds_for_active "$CREATED_AT_MS" "$READY_AT_MS")"
        DURATION_TEXT="$(format_duration "$DURATION_SECONDS")"
        ALERT_MESSAGE="Deployment ${DEPLOYMENT_ID} completed in ${DURATION_TEXT}."
        log_line "ALERT: ${ALERT_MESSAGE}"
        speak_alert "$ALERT_MESSAGE"
        ACTIVE_TERMINAL_ANNOUNCED=1
      fi
      ;;
    ERROR|CANCELED)
      if (( ACTIVE_TERMINAL_ANNOUNCED == 0 )); then
        DURATION_SECONDS="$(duration_seconds_for_active "$CREATED_AT_MS" "$READY_AT_MS")"
        DURATION_TEXT="$(format_duration "$DURATION_SECONDS")"
        ALERT_MESSAGE="Deployment ${DEPLOYMENT_ID} ended with ${STATUS} after ${DURATION_TEXT}."
        if [[ -n "$ERROR_MESSAGE" ]]; then
          ALERT_MESSAGE="${ALERT_MESSAGE} ${ERROR_MESSAGE}"
        fi
        warn_line "ALERT: ${ALERT_MESSAGE}"
        speak_alert "$ALERT_MESSAGE"
        ACTIVE_TERMINAL_ANNOUNCED=1
      fi
      ;;
  esac

  ACTIVE_LAST_STATUS="$STATUS"
  sleep_for_next_poll
done
