#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Continuously monitor a Vercel deployment until it reaches a terminal state.

Usage:
  ./scripts/monitor-vercel-deployment.sh <deployment-id-or-url> [options]

Options:
  -i, --interval <seconds>  Poll interval in seconds (default: 10)
  --timeout <seconds>       Stop after this many seconds (default: 0, disabled)
  --team-id <id>            Team/org id (default: $VERCEL_TEAM_ID or $VERCEL_ORG_ID)
  --token <token>           Vercel token (default: $VERCEL_TOKEN)
  -h, --help                Show help

Examples:
  VERCEL_TOKEN=... ./scripts/monitor-vercel-deployment.sh dpl_123abc
  ./scripts/monitor-vercel-deployment.sh https://my-app-git-main-user.vercel.app --team-id team_123 --interval 5
EOF
}

print_error() {
  echo "Error: $*" >&2
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

  # When given a deployment/custom-domain URL, keep only the host.
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
const iso = (value) => (typeof value === "number" ? new Date(value).toISOString() : "");

const status = text(payload.readyState || payload.state).toUpperCase() || "UNKNOWN";
const deploymentId = text(payload.id);
const deploymentUrl = text(payload.url) ? `https://${payload.url}` : "";
const createdAt = iso(payload.createdAt);
const readyAt = iso(payload.ready);
const errorMessage = text(payload.errorMessage || payload.errorCode);

process.stdout.write(
  [status, deploymentId, deploymentUrl, createdAt, readyAt, errorMessage].join("\u001f"),
);
'
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
TOKEN="${VERCEL_TOKEN:-}"
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
      shift 2
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

if [[ -z "$TARGET" ]]; then
  print_error "Missing deployment id/url."
  usage
  exit 1
fi

if [[ -z "$TOKEN" ]]; then
  print_error "Missing token. Set VERCEL_TOKEN or pass --token."
  exit 1
fi

if ! [[ "$INTERVAL_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  print_error "--interval must be a positive integer."
  exit 1
fi

if ! [[ "$TIMEOUT_SECONDS" =~ ^[0-9]+$ ]]; then
  print_error "--timeout must be a non-negative integer."
  exit 1
fi

TARGET="$(normalize_target "$TARGET")"
if [[ -z "$TARGET" ]]; then
  print_error "Deployment target is empty after normalization."
  exit 1
fi

API_URL="https://api.vercel.com/v13/deployments/${TARGET}"
if [[ -n "$TEAM_ID" ]]; then
  API_URL="${API_URL}?teamId=${TEAM_ID}"
fi

echo "Monitoring deployment '${TARGET}' every ${INTERVAL_SECONDS}s..."
if [[ -n "$TEAM_ID" ]]; then
  echo "Using team id: ${TEAM_ID}"
fi

START_EPOCH="$(date +%s)"
LAST_STATUS=""

sleep_for_next_poll() {
  if (( TIMEOUT_SECONDS == 0 )); then
    sleep "${INTERVAL_SECONDS}"
    return
  fi

  local now_epoch elapsed_seconds remaining_seconds sleep_seconds now_utc
  now_epoch="$(date +%s)"
  elapsed_seconds=$(( now_epoch - START_EPOCH ))
  if (( elapsed_seconds >= TIMEOUT_SECONDS )); then
    now_utc="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    echo "[${now_utc}] Timeout reached after ${TIMEOUT_SECONDS}s without terminal status." >&2
    exit 124
  fi

  remaining_seconds=$(( TIMEOUT_SECONDS - elapsed_seconds ))
  sleep_seconds="${INTERVAL_SECONDS}"
  if (( remaining_seconds < sleep_seconds )); then
    sleep_seconds="${remaining_seconds}"
  fi

  sleep "${sleep_seconds}"
}

while true; do
  NOW_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  ELAPSED_SECONDS=$(( $(date +%s) - START_EPOCH ))
  if (( TIMEOUT_SECONDS > 0 && ELAPSED_SECONDS >= TIMEOUT_SECONDS )); then
    echo "[${NOW_UTC}] Timeout reached after ${TIMEOUT_SECONDS}s without terminal status." >&2
    exit 124
  fi

  if ! RESPONSE="$(
    curl --silent --show-error --location \
      --header "Authorization: Bearer ${TOKEN}" \
      --header "Accept: application/json" \
      "${API_URL}"
  )"; then
    echo "[${NOW_UTC}] Request failed. Retrying in ${INTERVAL_SECONDS}s..." >&2
    sleep_for_next_poll
    continue
  fi

  if ! PARSED="$(printf '%s' "${RESPONSE}" | parse_deployment_payload 2>&1)"; then
    ERROR_CODE="${PARSED%%$'\t'*}"
    ERROR_MESSAGE="${PARSED#*$'\t'}"
    if [[ "${ERROR_CODE}" == "${ERROR_MESSAGE}" ]]; then
      ERROR_MESSAGE="Unable to parse API response."
    fi
    echo "[${NOW_UTC}] API error (${ERROR_CODE}): ${ERROR_MESSAGE}" >&2
    exit 1
  fi

  IFS=$'\x1f' read -r STATUS DEPLOYMENT_ID DEPLOYMENT_URL CREATED_AT READY_AT ERROR_MESSAGE <<<"${PARSED}"
  ELAPSED_SECONDS=$(( $(date +%s) - START_EPOCH ))

  if [[ -n "${LAST_STATUS}" && "${STATUS}" != "${LAST_STATUS}" ]]; then
    echo "[${NOW_UTC}] Transition: ${LAST_STATUS} -> ${STATUS}"
  fi

  echo "[${NOW_UTC}] status=${STATUS} elapsed=${ELAPSED_SECONDS}s id=${DEPLOYMENT_ID:-unknown} url=${DEPLOYMENT_URL:-n/a}"

  case "${STATUS}" in
    READY)
      if [[ -n "${READY_AT}" ]]; then
        echo "[${NOW_UTC}] Deployment is READY at ${READY_AT}"
      else
        echo "[${NOW_UTC}] Deployment is READY"
      fi
      exit 0
      ;;
    ERROR|CANCELED)
      if [[ -n "${ERROR_MESSAGE}" ]]; then
        echo "[${NOW_UTC}] Deployment ended with ${STATUS}: ${ERROR_MESSAGE}" >&2
      else
        echo "[${NOW_UTC}] Deployment ended with ${STATUS}" >&2
      fi
      exit 1
      ;;
  esac

  LAST_STATUS="${STATUS}"
  sleep_for_next_poll
done
