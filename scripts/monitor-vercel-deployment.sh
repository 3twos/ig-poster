#!/usr/bin/env bash
set -euo pipefail

DASHBOARD_ENABLED=0
LAST_EVENT_MESSAGE="Starting..."
LAST_ALERT_MESSAGE="None"

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
  --project-name <name>     Short name used in spoken alerts
  --team-id <id>            Team/org id (default: $VERCEL_TEAM_ID or $VERCEL_ORG_ID)
  --token <token>           Vercel token (default: $VERCEL_TOKEN, or secure prompt)
  --no-speak                Disable spoken alerts
  --plain                   Print line-by-line logs instead of the dashboard view
  -h, --help                Show help

Examples:
  # Watch latest deployment for a project until Ctrl+C
  VERCEL_TOKEN=... VERCEL_PROJECT_ID=... ./scripts/monitor-vercel-deployment.sh --project-name "ig poster" --interval 5

  # Watch one deployment continuously until Ctrl+C
  ./scripts/monitor-vercel-deployment.sh dpl_123abc --interval 5
HELP
}

print_error() {
  echo "Error: $*" >&2
}

log_line() {
  local message="$*"
  LAST_EVENT_MESSAGE="$message"
  if (( DASHBOARD_ENABLED == 0 )); then
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $message"
  fi
}

warn_line() {
  local message="$*"
  LAST_EVENT_MESSAGE="$message"
  if (( DASHBOARD_ENABLED == 0 )); then
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $message" >&2
  fi
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

derive_short_project_name() {
  local deployment_url="$1"
  local fallback_id="$2"
  local host slug short_name

  if [[ -n "$PROJECT_SHORT_NAME" ]]; then
    printf '%s' "$PROJECT_SHORT_NAME"
    return
  fi

  host="$(normalize_target "$deployment_url")"
  host="${host%%/*}"
  slug="${host%.vercel.app}"

  # Typical preview domains look like "<project>-git-<branch>-<team>.vercel.app".
  if [[ "$slug" == *-git-* ]]; then
    slug="${slug%%-git-*}"
  fi
  if [[ "$slug" == *.* ]]; then
    slug="${slug%%.*}"
  fi

  short_name="$slug"
  if [[ -z "$short_name" ]]; then
    short_name="${PROJECT_ID#prj_}"
  fi
  if [[ -z "$short_name" ]]; then
    short_name="$fallback_id"
  fi
  if [[ -z "$short_name" ]]; then
    short_name="deployment"
  fi

  printf '%s' "$short_name"
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
const pick = (...values) =>
  values.find((value) => typeof value === "string" && value.trim().length > 0) ?? "";
const normalizeBranch = (value) => {
  let branch = pick(value).trim();
  if (!branch) return "";
  if (branch.startsWith("refs/heads/")) branch = branch.slice("refs/heads/".length);
  try {
    branch = decodeURIComponent(branch);
  } catch {}
  return branch;
};

const status = text(payload.readyState || payload.state).toUpperCase() || "UNKNOWN";
const deploymentId = text(payload.id || payload.uid);
const deploymentUrl = text(payload.url) ? `https://${payload.url}` : "";
const createdAtMs = intMs(payload.createdAt);
const readyAtMs = intMs(payload.ready);
const target = text(payload.target).toLowerCase();
const branch = normalizeBranch(
  pick(
    payload?.meta?.githubCommitRef,
    payload?.meta?.gitlabCommitRef,
    payload?.meta?.bitbucketCommitRef,
    payload?.meta?.gitCommitRef,
    payload?.meta?.branch,
    payload?.meta?.commitRef,
    payload?.gitSource?.ref,
  ),
);
const errorMessage = text(payload.errorMessage || payload.errorCode);

process.stdout.write(
  [status, deploymentId, deploymentUrl, createdAtMs, readyAtMs, target, branch, errorMessage].join("\u001f"),
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
const pick = (...values) =>
  values.find((value) => typeof value === "string" && value.trim().length > 0) ?? "";
const normalizeBranch = (value) => {
  let branch = pick(value).trim();
  if (!branch) return "";
  if (branch.startsWith("refs/heads/")) branch = branch.slice("refs/heads/".length);
  try {
    branch = decodeURIComponent(branch);
  } catch {}
  return branch;
};
const id = text(latest.uid || latest.id);
const state = text(latest.readyState || latest.state).toUpperCase() || "UNKNOWN";
const url = text(latest.url) ? `https://${latest.url}` : "";
const target = text(latest.target).toLowerCase();
const branch = normalizeBranch(
  pick(
    latest?.meta?.githubCommitRef,
    latest?.meta?.gitlabCommitRef,
    latest?.meta?.bitbucketCommitRef,
    latest?.meta?.gitCommitRef,
    latest?.meta?.branch,
    latest?.meta?.commitRef,
    latest?.gitSource?.ref,
  ),
);

process.stdout.write([id, state, url, target, branch].join("\u001f"));
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

format_spoken_duration() {
  local total_seconds="$1"
  local minutes seconds minute_word second_word

  if (( total_seconds < 60 )); then
    if (( total_seconds == 1 )); then
      printf '%s' "1 second"
    else
      printf '%s seconds' "$total_seconds"
    fi
    return
  fi

  minutes=$(( total_seconds / 60 ))
  seconds=$(( total_seconds % 60 ))
  minute_word="minutes"
  second_word="seconds"

  if (( minutes == 1 )); then
    minute_word="minute"
  fi
  if (( seconds == 1 )); then
    second_word="second"
  fi

  if (( seconds == 0 )); then
    printf '%s %s' "$minutes" "$minute_word"
  else
    printf '%s %s %s %s' "$minutes" "$minute_word" "$seconds" "$second_word"
  fi
}

friendly_status() {
  local status="$1"

  case "$status" in
    READY) printf '%s' "Ready" ;;
    BUILDING) printf '%s' "Building" ;;
    QUEUED) printf '%s' "Queued" ;;
    INITIALIZING) printf '%s' "Initializing" ;;
    CANCELED) printf '%s' "Canceled" ;;
    ERROR) printf '%s' "Failed" ;;
    UNKNOWN|"") printf '%s' "Unknown" ;;
    *) printf '%s' "$status" ;;
  esac
}

friendly_mode_label() {
  if [[ "$WATCH_MODE" == "project" ]]; then
    printf '%s' "Latest deployment"
  else
    printf '%s' "Single deployment"
  fi
}

friendly_environment_label() {
  local target="$1"

  case "$target" in
    production|PRODUCTION) printf '%s' "Production" ;;
    preview|PREVIEW|"") printf '%s' "Preview" ;;
    *)
      # Keep unknown targets visible instead of collapsing them.
      printf '%s' "$target"
      ;;
  esac
}

friendly_branch_label() {
  local branch="$1"
  local target="$2"

  if [[ -n "$branch" ]]; then
    printf '%s' "$branch"
    return
  fi
  if [[ "$target" == "production" || "$target" == "PRODUCTION" ]]; then
    printf '%s' "main"
    return
  fi
  printf '%s' "unknown"
}

spoken_branch_name() {
  local branch="$1"
  local normalized leaf

  leaf="${branch##*/}"
  if [[ -z "$leaf" ]]; then
    leaf="$branch"
  fi

  normalized="$leaf"
  normalized="${normalized//-/ }"
  normalized="${normalized//_/ }"
  printf '%s' "$normalized"
}

friendly_host() {
  local deployment_url="$1"
  local host

  host="$(normalize_target "$deployment_url")"
  if [[ -z "$host" ]]; then
    printf '%s' "n/a"
    return
  fi
  printf '%s' "$host"
}

short_deployment_label() {
  local deployment_id="$1"

  if [[ -z "$deployment_id" ]]; then
    printf '%s' "n/a"
    return
  fi
  if (( ${#deployment_id} > 18 )); then
    printf '%s...' "${deployment_id:0:18}"
    return
  fi
  printf '%s' "$deployment_id"
}

format_ms_local() {
  local epoch_ms="$1"
  local epoch_seconds

  if ! [[ "$epoch_ms" =~ ^[0-9]+$ ]]; then
    printf '%s' "n/a"
    return
  fi
  epoch_seconds=$(( epoch_ms / 1000 ))

  # Prefer BSD/macOS `date -r`, then GNU `date -d`.
  if date -r 0 '+%s' >/dev/null 2>&1; then
    if ! date -r "$epoch_seconds" '+%H:%M:%S'; then
      printf '%s' "n/a"
    fi
    return
  fi
  if date -d "@0" '+%s' >/dev/null 2>&1; then
    if ! date -d "@$epoch_seconds" '+%H:%M:%S'; then
      printf '%s' "n/a"
    fi
    return
  fi

  printf '%s' "n/a"
}

render_dashboard() {
  if (( DASHBOARD_ENABLED == 0 )); then
    return
  fi

  printf '\033[H\033[2J'
  printf 'Vercel Deploy Monitor\n'
  printf '=====================\n'
  printf 'Project      : %s\n' "${DASH_PROJECT_NAME:-n/a}"
  printf 'Mode         : %s\n' "${DASH_MODE_LABEL:-n/a}"
  printf 'Environment  : %s\n' "${DASH_ENV_LABEL:-Preview}"
  printf 'Branch       : %s\n' "${DASH_BRANCH_LABEL:-unknown}"
  printf 'Status       : %s\n' "${DASH_STATUS_LABEL:-Unknown}"
  printf 'Deployment   : %s\n' "${DASH_DEPLOYMENT_LABEL:-n/a}"
  printf 'URL          : %s\n' "${DASH_URL_LABEL:-n/a}"
  printf 'Started      : %s\n' "${DASH_STARTED_LABEL:-n/a}"
  printf 'Elapsed      : %s\n' "${DASH_DURATION_LABEL:-n/a}"
  printf 'Last Update  : %s\n' "$(date '+%H:%M:%S')"
  printf 'Last Event   : %s\n' "${LAST_EVENT_MESSAGE:-Starting...}"
  printf 'Last Alert   : %s\n' "${LAST_ALERT_MESSAGE:-None}"
  printf '\nPress Ctrl+C to stop.\n'
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

play_production_beat() {
  local deployment_target="$1"

  if (( ENABLE_SPEAK == 0 )); then
    return
  fi
  if [[ -z "$SPEAKER_CMD" ]]; then
    return
  fi
  if [[ "$deployment_target" != "production" && "$deployment_target" != "PRODUCTION" ]]; then
    return
  fi

  (
    if command -v afplay >/dev/null 2>&1 && [[ -f "/System/Library/Sounds/Pop.aiff" ]]; then
      afplay "/System/Library/Sounds/Pop.aiff" >/dev/null 2>&1
      sleep 0.12
      afplay "/System/Library/Sounds/Pop.aiff" >/dev/null 2>&1
    else
      printf '\a'
      sleep 0.12
      printf '\a'
    fi
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
    DASH_STATUS_LABEL="Timed out"
    render_dashboard
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
    DASH_STATUS_LABEL="Timed out"
    render_dashboard
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
PROJECT_SHORT_NAME="${VERCEL_PROJECT_SHORT_NAME:-}"
TOKEN="${VERCEL_TOKEN:-}"
TOKEN_FROM_ARG=0
ENABLE_SPEAK=1
FORCE_PLAIN=0
TARGET=""

DASH_PROJECT_NAME="n/a"
DASH_MODE_LABEL="n/a"
DASH_STATUS_LABEL="Waiting"
DASH_ENV_LABEL="Preview"
DASH_BRANCH_LABEL="unknown"
DASH_DEPLOYMENT_LABEL="n/a"
DASH_URL_LABEL="n/a"
DASH_STARTED_LABEL="n/a"
DASH_DURATION_LABEL="n/a"

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
    --project-name|--voice-project-name)
      if [[ $# -lt 2 ]]; then
        print_error "$1 requires a value."
        exit 1
      fi
      PROJECT_SHORT_NAME="$2"
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
    --plain)
      FORCE_PLAIN=1
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

if (( FORCE_PLAIN == 0 )) && [[ -t 1 ]]; then
  DASHBOARD_ENABLED=1
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

DASH_MODE_LABEL="$(friendly_mode_label)"
if [[ -n "$PROJECT_SHORT_NAME" ]]; then
  DASH_PROJECT_NAME="$PROJECT_SHORT_NAME"
elif [[ "$WATCH_MODE" == "project" ]]; then
  DASH_PROJECT_NAME="${PROJECT_ID#prj_}"
elif [[ -n "$TARGET" ]]; then
  DASH_PROJECT_NAME="$(derive_short_project_name "$TARGET" "$TARGET")"
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
if [[ -n "$PROJECT_SHORT_NAME" ]]; then
  log_line "Using spoken project name: ${PROJECT_SHORT_NAME}"
fi

render_dashboard

trap 'warn_line "Stopped deployment monitor."; DASH_STATUS_LABEL="Stopped"; render_dashboard; if (( DASHBOARD_ENABLED == 1 )); then echo; fi; exit 0' INT TERM

START_EPOCH="$(date +%s)"
ACTIVE_TARGET=""
ACTIVE_LAST_STATUS=""
ACTIVE_TERMINAL_ANNOUNCED=0
ACTIVE_FIRST_SEEN_EPOCH="$(date +%s)"
ACTIVE_PROJECT_SHORT_NAME=""
ACTIVE_TARGET_KIND=""
ACTIVE_BRANCH_NAME=""
NO_DEPLOYMENTS_REPORTED=0

while true; do
  check_timeout_or_exit

  if [[ "$WATCH_MODE" == "project" ]]; then
    if ! LATEST_RESPONSE="$(fetch_json "$(build_latest_deployment_url)")"; then
      warn_line "Failed to fetch latest project deployment. Retrying..."
      DASH_STATUS_LABEL="Connection issue"
      render_dashboard
      sleep_for_next_poll
      continue
    fi

    if ! LATEST_PARSED="$(printf '%s' "${LATEST_RESPONSE}" | parse_latest_deployment_payload 2>&1)"; then
      warn_line "Latest deployment API error: ${LATEST_PARSED}"
      DASH_STATUS_LABEL="API error"
      render_dashboard
      sleep_for_next_poll
      continue
    fi

    if [[ -z "$LATEST_PARSED" ]]; then
      if (( NO_DEPLOYMENTS_REPORTED == 0 )); then
        log_line "No deployments found yet for project '${PROJECT_ID}'."
        NO_DEPLOYMENTS_REPORTED=1
      fi
      DASH_STATUS_LABEL="Waiting for deployment"
      DASH_ENV_LABEL="Preview"
      DASH_BRANCH_LABEL="unknown"
      DASH_DEPLOYMENT_LABEL="n/a"
      DASH_URL_LABEL="n/a"
      DASH_STARTED_LABEL="n/a"
      DASH_DURATION_LABEL="n/a"
      render_dashboard
      sleep_for_next_poll
      continue
    fi

    NO_DEPLOYMENTS_REPORTED=0
    IFS=$'\x1f' read -r LATEST_ID LATEST_STATE LATEST_URL LATEST_TARGET LATEST_BRANCH <<<"${LATEST_PARSED}"

    if [[ -z "$LATEST_ID" ]]; then
      warn_line "Latest deployment payload did not include a deployment id. Retrying..."
      DASH_STATUS_LABEL="API error"
      render_dashboard
      sleep_for_next_poll
      continue
    fi

    if [[ "$ACTIVE_TARGET" != "$LATEST_ID" ]]; then
      ACTIVE_TARGET="$LATEST_ID"
      ACTIVE_LAST_STATUS=""
      ACTIVE_TERMINAL_ANNOUNCED=0
      ACTIVE_FIRST_SEEN_EPOCH="$(date +%s)"
      ACTIVE_PROJECT_SHORT_NAME="$(derive_short_project_name "${LATEST_URL}" "${ACTIVE_TARGET}")"
      ACTIVE_TARGET_KIND="$LATEST_TARGET"
      ACTIVE_BRANCH_NAME="$(friendly_branch_label "$LATEST_BRANCH" "$LATEST_TARGET")"
      DASH_PROJECT_NAME="$ACTIVE_PROJECT_SHORT_NAME"
      DASH_STATUS_LABEL="$(friendly_status "${LATEST_STATE}")"
      DASH_ENV_LABEL="$(friendly_environment_label "${LATEST_TARGET}")"
      DASH_BRANCH_LABEL="$ACTIVE_BRANCH_NAME"
      DASH_DEPLOYMENT_LABEL="$(short_deployment_label "${ACTIVE_TARGET}")"
      DASH_URL_LABEL="$(friendly_host "${LATEST_URL}")"
      DASH_STARTED_LABEL="n/a"
      DASH_DURATION_LABEL="n/a"
      log_line "Watching deployment id=${ACTIVE_TARGET} url=${LATEST_URL:-n/a} state=${LATEST_STATE:-UNKNOWN}"
      render_dashboard
    fi
  elif [[ -z "$ACTIVE_TARGET" ]]; then
    ACTIVE_TARGET="$TARGET"
    ACTIVE_FIRST_SEEN_EPOCH="$(date +%s)"
    ACTIVE_PROJECT_SHORT_NAME="$(derive_short_project_name "${TARGET}" "${ACTIVE_TARGET}")"
    DASH_PROJECT_NAME="$ACTIVE_PROJECT_SHORT_NAME"
    DASH_DEPLOYMENT_LABEL="$(short_deployment_label "${ACTIVE_TARGET}")"
  fi

  DETAIL_URL="$(build_deployment_url "$ACTIVE_TARGET")"
  if ! RESPONSE="$(fetch_json "$DETAIL_URL")"; then
    warn_line "Failed to fetch deployment '${ACTIVE_TARGET}'. Retrying..."
    DASH_STATUS_LABEL="Connection issue"
    render_dashboard
    sleep_for_next_poll
    continue
  fi

  if ! PARSED="$(printf '%s' "${RESPONSE}" | parse_deployment_payload 2>&1)"; then
    warn_line "Deployment API error for '${ACTIVE_TARGET}': ${PARSED}"
    DASH_STATUS_LABEL="API error"
    render_dashboard
    sleep_for_next_poll
    continue
  fi

  IFS=$'\x1f' read -r STATUS DEPLOYMENT_ID DEPLOYMENT_URL CREATED_AT_MS READY_AT_MS DEPLOYMENT_TARGET DEPLOYMENT_BRANCH ERROR_MESSAGE <<<"${PARSED}"
  if [[ -n "$DEPLOYMENT_ID" ]]; then
    ACTIVE_TARGET="$DEPLOYMENT_ID"
  else
    DEPLOYMENT_ID="$ACTIVE_TARGET"
  fi
  ACTIVE_PROJECT_SHORT_NAME="$(derive_short_project_name "${DEPLOYMENT_URL}" "${ACTIVE_TARGET}")"
  ACTIVE_TARGET_KIND="$DEPLOYMENT_TARGET"
  ACTIVE_ENV_LABEL="$(friendly_environment_label "${ACTIVE_TARGET_KIND}")"
  ACTIVE_BRANCH_NAME="$(friendly_branch_label "$DEPLOYMENT_BRANCH" "$DEPLOYMENT_TARGET")"
  ACTIVE_SPOKEN_BRANCH_NAME="$(spoken_branch_name "$ACTIVE_BRANCH_NAME")"
  DURATION_SECONDS="$(duration_seconds_for_active "$CREATED_AT_MS" "$READY_AT_MS")"
  DURATION_TEXT="$(format_duration "$DURATION_SECONDS")"

  DASH_PROJECT_NAME="$ACTIVE_PROJECT_SHORT_NAME"
  DASH_STATUS_LABEL="$(friendly_status "$STATUS")"
  DASH_ENV_LABEL="$ACTIVE_ENV_LABEL"
  DASH_BRANCH_LABEL="$ACTIVE_BRANCH_NAME"
  DASH_DEPLOYMENT_LABEL="$(short_deployment_label "$DEPLOYMENT_ID")"
  DASH_URL_LABEL="$(friendly_host "$DEPLOYMENT_URL")"
  DASH_STARTED_LABEL="$(format_ms_local "$CREATED_AT_MS")"
  DASH_DURATION_LABEL="$DURATION_TEXT"

  if [[ -n "$ACTIVE_LAST_STATUS" && "$STATUS" != "$ACTIVE_LAST_STATUS" ]]; then
    log_line "Transition: ${ACTIVE_LAST_STATUS} -> ${STATUS} (id=${DEPLOYMENT_ID})"
  fi

  log_line "Status ${DASH_STATUS_LABEL} for ${DASH_PROJECT_NAME} ${DASH_ENV_LABEL}/${DASH_BRANCH_LABEL} (${DASH_DEPLOYMENT_LABEL})"

  case "$STATUS" in
    READY)
      if (( ACTIVE_TERMINAL_ANNOUNCED == 0 )); then
        ALERT_MESSAGE="${ACTIVE_ENV_LABEL} ${ACTIVE_SPOKEN_BRANCH_NAME} deployment completed in ${DURATION_TEXT}."
        SPOKEN_DURATION_TEXT="$(format_spoken_duration "$DURATION_SECONDS")"
        SPOKEN_ALERT_MESSAGE="${ACTIVE_ENV_LABEL} ${ACTIVE_SPOKEN_BRANCH_NAME} deployment completed in ${SPOKEN_DURATION_TEXT}."
        LAST_ALERT_MESSAGE="$ALERT_MESSAGE"
        log_line "Alert: ${ALERT_MESSAGE}"
        play_production_beat "$ACTIVE_TARGET_KIND"
        speak_alert "$SPOKEN_ALERT_MESSAGE"
        ACTIVE_TERMINAL_ANNOUNCED=1
      fi
      ;;
    ERROR|CANCELED)
      if (( ACTIVE_TERMINAL_ANNOUNCED == 0 )); then
        ALERT_MESSAGE="${ACTIVE_ENV_LABEL} ${ACTIVE_SPOKEN_BRANCH_NAME} deployment ended with ${STATUS} after ${DURATION_TEXT}."
        SPOKEN_DURATION_TEXT="$(format_spoken_duration "$DURATION_SECONDS")"
        SPOKEN_ALERT_MESSAGE="${ACTIVE_ENV_LABEL} ${ACTIVE_SPOKEN_BRANCH_NAME} deployment ended with ${STATUS} after ${SPOKEN_DURATION_TEXT}."
        if [[ -n "$ERROR_MESSAGE" ]]; then
          ALERT_MESSAGE="${ALERT_MESSAGE} ${ERROR_MESSAGE}"
          SPOKEN_ALERT_MESSAGE="${SPOKEN_ALERT_MESSAGE} ${ERROR_MESSAGE}"
        fi
        LAST_ALERT_MESSAGE="$ALERT_MESSAGE"
        warn_line "Alert: ${ALERT_MESSAGE}"
        play_production_beat "$ACTIVE_TARGET_KIND"
        speak_alert "$SPOKEN_ALERT_MESSAGE"
        ACTIVE_TERMINAL_ANNOUNCED=1
      fi
      ;;
  esac

  ACTIVE_LAST_STATUS="$STATUS"
  render_dashboard
  sleep_for_next_poll
done
