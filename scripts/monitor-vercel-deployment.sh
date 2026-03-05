#!/usr/bin/env bash
set -euo pipefail

DASHBOARD_ENABLED=0
LAST_EVENT_MESSAGE="Starting..."
LAST_ALERT_MESSAGE="None"
LAST_EVENT_EPOCH=0
LAST_ALERT_EPOCH=0
LAST_ALERT_LEVEL="info"

usage() {
  cat <<'HELP'
Continuously monitor Vercel deployment status until you stop the script (Ctrl+C).

Usage:
  ./scripts/monitor-vercel-deployment.sh [deployment-id-or-url] [options]

Modes:
  1) Deployment mode
     - Pass a deployment id/url as the first argument.
  2) Project mode (parallel deployment watcher)
     - Omit the first argument and pass --project-id (or set VERCEL_PROJECT_ID).
     - Script tracks multiple recent deployments with separate status rows.

Options:
  -i, --interval <seconds>     Poll interval in seconds (default: 10)
  --timeout <seconds>          Optional script timeout (default: 0, disabled)
  --project-id <id>            Project id for project watcher mode
  --project-name <name>        Short name used in spoken alerts
  --team-id <id>               Team/org id (default: $VERCEL_TEAM_ID or $VERCEL_ORG_ID)
  --token <token>              Vercel token (default: $VERCEL_TOKEN, or secure prompt)
  --max-deployments <count>    Number of recent deployments to display (default: 6)
  --event-mode <mode>          auto | stream | poll (default: auto)
  --no-speak                   Disable spoken alerts
  --plain                      Print line-by-line logs instead of the dashboard view
  -h, --help                   Show help

Examples:
  # Watch multiple recent deployments for a project until Ctrl+C
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
  LAST_EVENT_EPOCH="$(date +%s)"
  if (( DASHBOARD_ENABLED == 0 )); then
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $message"
  fi
}

warn_line() {
  local message="$*"
  LAST_EVENT_MESSAGE="$message"
  LAST_EVENT_EPOCH="$(date +%s)"
  if (( DASHBOARD_ENABLED == 0 )); then
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $message" >&2
  fi
}

sanitize_field() {
  local value="$1"

  value="${value//$'\x1f'/ }"
  value="${value//$'\n'/ }"
  value="${value//$'\r'/ }"
  value="${value//$'\t'/ }"
  value="${value#${value%%[![:space:]]*}}"
  value="${value%${value##*[![:space:]]}}"
  printf '%s' "$value"
}

truncate_text() {
  local text="$1"
  local max_len="$2"

  if ! [[ "$max_len" =~ ^[0-9]+$ ]] || (( max_len <= 0 )); then
    printf '%s' "$text"
    return
  fi

  if (( ${#text} <= max_len )); then
    printf '%s' "$text"
    return
  fi

  if (( max_len <= 3 )); then
    printf '%s' "${text:0:max_len}"
    return
  fi

  printf '%s...' "${text:0:$(( max_len - 3 ))}"
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

parse_project_deployments_payload() {
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

const rows = [];
for (const item of deployments) {
  const id = text(item.uid || item.id);
  if (!id) continue;

  const state = text(item.readyState || item.state).toUpperCase() || "UNKNOWN";
  const deploymentUrl = text(item.url) ? `https://${item.url}` : "";
  const target = text(item.target).toLowerCase();
  const branch = normalizeBranch(
    pick(
      item?.meta?.githubCommitRef,
      item?.meta?.gitlabCommitRef,
      item?.meta?.bitbucketCommitRef,
      item?.meta?.gitCommitRef,
      item?.meta?.branch,
      item?.meta?.commitRef,
      item?.gitSource?.ref,
    ),
  );
  const createdAtMs = intMs(item.createdAt);
  const readyAtMs = intMs(item.ready);
  const errorMessage = text(item.errorMessage || item.errorCode);

  rows.push([id, state, deploymentUrl, createdAtMs, readyAtMs, target, branch, errorMessage].join("\u001f"));
}

process.stdout.write(rows.join("\n"));
'
}

parse_deployment_events_snapshot_payload() {
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

const events = Array.isArray(payload) ? payload : [];
const sanitize = (value) =>
  String(value ?? "")
    .replace(/\u001f/g, " ")
    .replace(/[\n\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const text = (value) => (typeof value === "string" ? value : "");
const pick = (...values) =>
  values.find((value) => typeof value === "string" && value.trim().length > 0) ?? "";
const toNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;

let latestCreated = 0;
let latestState = "";
let latestStep = "";
let latestText = "";

for (const event of events) {
  const payloadObj = event && typeof event.payload === "object" && event.payload ? event.payload : {};
  const info = payloadObj && typeof payloadObj.info === "object" && payloadObj.info ? payloadObj.info : {};
  const created =
    toNumber(event?.created) || toNumber(payloadObj?.created) || toNumber(payloadObj?.date) || 0;

  const step = sanitize(pick(info?.step, info?.name, info?.type));
  const state = sanitize(text(pick(info?.readyState, payloadObj?.readyState, event?.readyState)).toUpperCase());
  const logText = sanitize(pick(payloadObj?.text, event?.text));

  if (created > latestCreated) {
    latestCreated = created;
  }
  if (step) {
    latestStep = step;
  }
  if (state) {
    latestState = state;
  }
  if (logText) {
    latestText = logText;
  }
}

process.stdout.write([
  latestCreated > 0 ? String(latestCreated) : "",
  latestState,
  latestStep,
  latestText,
].join("\u001f"));
'
}

parse_deployment_events_stream_payload() {
  node -e '
const sanitize = (value) =>
  String(value ?? "")
    .replace(/\u001f/g, " ")
    .replace(/[\n\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const text = (value) => (typeof value === "string" ? value : "");
const pick = (...values) =>
  values.find((value) => typeof value === "string" && value.trim().length > 0) ?? "";
const toNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;

const emitRecord = (event) => {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return;
  }

  const payloadObj = event && typeof event.payload === "object" && event.payload ? event.payload : {};
  const info = payloadObj && typeof payloadObj.info === "object" && payloadObj.info ? payloadObj.info : {};
  const created =
    toNumber(event?.created) || toNumber(payloadObj?.created) || toNumber(payloadObj?.date) || 0;
  const state = sanitize(text(pick(info?.readyState, payloadObj?.readyState, event?.readyState)).toUpperCase());
  const step = sanitize(pick(info?.step, info?.name, info?.type));
  const logText = sanitize(pick(payloadObj?.text, event?.text));
  const eventType = sanitize(text(event?.type));

  process.stdout.write(
    [created > 0 ? String(created) : "", state, step, logText, eventType].join("\u001f") + "\n",
  );
};

let buffer = "";
let depth = 0;
let start = -1;
let inString = false;
let escaped = false;

const consumeObjects = () => {
  for (let i = 0; i < buffer.length; i += 1) {
    const char = buffer[i];

    if (start === -1) {
      if (char === "{") {
        start = i;
        depth = 1;
        inString = false;
        escaped = false;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const objectText = buffer.slice(start, i + 1);
        try {
          emitRecord(JSON.parse(objectText));
        } catch {}

        buffer = buffer.slice(i + 1);
        i = -1;
        start = -1;
      }
    }
  }

  if (start === -1 && buffer.length > 200000) {
    buffer = buffer.slice(-10000);
  }
};

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  consumeObjects();
});
process.stdin.on("end", () => {
  consumeObjects();
});
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

build_project_deployments_url() {
  local url="https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&limit=${MAX_DEPLOYMENTS}"

  if [[ -n "$TEAM_ID" ]]; then
    url="${url}&teamId=${TEAM_ID}"
  fi

  printf '%s' "$url"
}

build_deployment_events_url() {
  local target="$1"
  local since_ms="${2:-}"
  local follow="${3:-0}"
  local direction="${4:-forward}"
  local url="https://api.vercel.com/v3/deployments/${target}/events?limit=120&builds=1&delimiter=1&direction=${direction}"

  if [[ "$follow" == "1" ]]; then
    url="${url}&follow=1"
  fi

  if [[ "$since_ms" =~ ^[0-9]+$ ]] && (( since_ms > 0 )); then
    url="${url}&since=${since_ms}"
  fi

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
    ERROR|FAILED) printf '%s' "Failed" ;;
    UNKNOWN|"") printf '%s' "Unknown" ;;
    *) printf '%s' "$status" ;;
  esac
}

friendly_mode_label() {
  if [[ "$WATCH_MODE" == "project" ]]; then
    printf '%s' "Project deployments"
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

relative_time_from_seconds() {
  local elapsed_seconds="$1"

  if ! [[ "$elapsed_seconds" =~ ^-?[0-9]+$ ]]; then
    printf '%s' "n/a"
    return
  fi
  if (( elapsed_seconds < 0 )); then
    elapsed_seconds=0
  fi

  if (( elapsed_seconds < 5 )); then
    printf '%s' "just now"
    return
  fi
  if (( elapsed_seconds < 60 )); then
    printf '%ss ago' "$elapsed_seconds"
    return
  fi
  if (( elapsed_seconds < 3600 )); then
    printf '%sm ago' $(( elapsed_seconds / 60 ))
    return
  fi
  if (( elapsed_seconds < 86400 )); then
    printf '%sh ago' $(( elapsed_seconds / 3600 ))
    return
  fi

  printf '%sd ago' $(( elapsed_seconds / 86400 ))
}

relative_time_from_epoch() {
  local epoch_seconds="$1"
  local now_seconds elapsed_seconds

  if ! [[ "$epoch_seconds" =~ ^[0-9]+$ ]]; then
    printf '%s' "n/a"
    return
  fi
  if (( epoch_seconds <= 0 )); then
    printf '%s' "n/a"
    return
  fi

  now_seconds="$(date +%s)"
  elapsed_seconds=$(( now_seconds - epoch_seconds ))
  relative_time_from_seconds "$elapsed_seconds"
}

relative_time_from_ms() {
  local epoch_ms="$1"
  local epoch_seconds

  if ! [[ "$epoch_ms" =~ ^[0-9]+$ ]]; then
    printf '%s' "n/a"
    return
  fi

  epoch_seconds=$(( epoch_ms / 1000 ))
  relative_time_from_epoch "$epoch_seconds"
}

format_ms_with_relative() {
  local epoch_ms="$1"
  local local_clock relative_time

  local_clock="$(format_ms_local "$epoch_ms")"
  if [[ "$local_clock" == "n/a" ]]; then
    printf '%s' "n/a"
    return
  fi

  relative_time="$(relative_time_from_ms "$epoch_ms")"
  if [[ "$relative_time" == "n/a" ]]; then
    printf '%s' "$local_clock"
    return
  fi

  printf '%s (%s)' "$local_clock" "$relative_time"
}

format_epoch_with_relative() {
  local epoch_seconds="$1"
  local epoch_ms local_clock relative_time

  if ! [[ "$epoch_seconds" =~ ^[0-9]+$ ]]; then
    printf '%s' "n/a"
    return
  fi
  if (( epoch_seconds <= 0 )); then
    printf '%s' "n/a"
    return
  fi

  epoch_ms=$(( epoch_seconds * 1000 ))
  local_clock="$(format_ms_local "$epoch_ms")"
  relative_time="$(relative_time_from_epoch "$epoch_seconds")"

  if [[ "$local_clock" == "n/a" ]]; then
    printf '%s' "$relative_time"
    return
  fi
  if [[ "$relative_time" == "n/a" ]]; then
    printf '%s' "$local_clock"
    return
  fi

  printf '%s (%s)' "$local_clock" "$relative_time"
}

status_icon() {
  local status="$1"

  case "$status" in
    READY) printf '%s' "✓" ;;
    ERROR|CANCELED|FAILED) printf '%s' "✖" ;;
    BUILDING|INITIALIZING|QUEUED) printf '%s' "⏳" ;;
    WAITING) printf '%s' "…" ;;
    CONNECTION_ISSUE|API_ERROR|TIMED_OUT) printf '%s' "⚠" ;;
    STOPPED) printf '%s' "■" ;;
    *) printf '%s' "?" ;;
  esac
}

environment_icon() {
  local target="$1"

  case "$target" in
    production|PRODUCTION) printf '%s' "🚀" ;;
    preview|PREVIEW|"") printf '%s' "🧪" ;;
    *) printf '%s' "•" ;;
  esac
}

alert_icon() {
  local level="$1"

  case "$level" in
    success) printf '%s' "✓" ;;
    error) printf '%s' "✖" ;;
    warning) printf '%s' "⚠" ;;
    info|"") printf '%s' "ℹ" ;;
    *) printf '%s' "ℹ" ;;
  esac
}

is_terminal_status() {
  local status="$1"

  case "$status" in
    READY|ERROR|CANCELED|FAILED) return 0 ;;
    *) return 1 ;;
  esac
}

is_active_status() {
  local status="$1"

  case "$status" in
    QUEUED|INITIALIZING|BUILDING) return 0 ;;
    *) return 1 ;;
  esac
}

status_progress_percent() {
  local status="$1"
  local step_text="${2:-}"
  local normalized

  normalized="$(printf '%s' "$step_text" | tr '[:upper:]' '[:lower:]')"

  case "$status" in
    READY) printf '%s' "100" ;;
    ERROR|CANCELED|FAILED) printf '%s' "100" ;;
    QUEUED) printf '%s' "12" ;;
    INITIALIZING) printf '%s' "28" ;;
    BUILDING)
      if [[ "$normalized" == *"clone"* ]] || [[ "$normalized" == *"checkout"* ]]; then
        printf '%s' "32"
      elif [[ "$normalized" == *"install"* ]] || [[ "$normalized" == *"depend"* ]]; then
        printf '%s' "48"
      elif [[ "$normalized" == *"build"* ]] || [[ "$normalized" == *"compile"* ]]; then
        printf '%s' "72"
      elif [[ "$normalized" == *"upload"* ]] || [[ "$normalized" == *"deploy"* ]] || [[ "$normalized" == *"final"* ]]; then
        printf '%s' "88"
      else
        printf '%s' "64"
      fi
      ;;
    WAITING) printf '%s' "5" ;;
    CONNECTION_ISSUE|API_ERROR|TIMED_OUT|STOPPED) printf '%s' "0" ;;
    *) printf '%s' "10" ;;
  esac
}

spinner_frame() {
  local frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
  local now idx

  now="$(date +%s)"
  idx=$(( now % ${#frames[@]} ))
  printf '%s' "${frames[idx]}"
}

render_progress_bar() {
  local percent="$1"
  local width="${2:-20}"
  local status="${3:-UNKNOWN}"
  local fill_count empty_count i bar fill_char empty_char spinner

  if ! [[ "$percent" =~ ^[0-9]+$ ]]; then
    percent=0
  fi
  if (( percent < 0 )); then
    percent=0
  fi
  if (( percent > 100 )); then
    percent=100
  fi
  if ! [[ "$width" =~ ^[0-9]+$ ]] || (( width <= 0 )); then
    width=20
  fi

  fill_char="█"
  empty_char="░"
  if [[ "$status" == "ERROR" || "$status" == "CANCELED" || "$status" == "FAILED" ]]; then
    fill_char="▓"
  fi

  fill_count=$(( (percent * width) / 100 ))
  empty_count=$(( width - fill_count ))

  bar=""
  for (( i = 0; i < fill_count; i++ )); do
    bar="${bar}${fill_char}"
  done
  for (( i = 0; i < empty_count; i++ )); do
    bar="${bar}${empty_char}"
  done

  if is_active_status "$status"; then
    spinner="$(spinner_frame)"
    printf '%s %s' "$bar" "$spinner"
  else
    printf '%s  ' "$bar"
  fi
}

duration_seconds_for_record() {
  local created_at_ms="$1"
  local ready_at_ms="$2"
  local first_seen_epoch="$3"
  local now_seconds start_seconds end_seconds

  now_seconds="$(date +%s)"

  if [[ "$created_at_ms" =~ ^[0-9]+$ ]]; then
    start_seconds=$(( created_at_ms / 1000 ))
  else
    start_seconds="$first_seen_epoch"
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
    DASH_STATUS_RAW="TIMED_OUT"
    LAST_ALERT_MESSAGE="Monitor timed out after ${TIMEOUT_SECONDS}s."
    LAST_ALERT_LEVEL="warning"
    LAST_ALERT_EPOCH="$(date +%s)"
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
    DASH_STATUS_RAW="TIMED_OUT"
    LAST_ALERT_MESSAGE="Monitor timed out after ${TIMEOUT_SECONDS}s."
    LAST_ALERT_LEVEL="warning"
    LAST_ALERT_EPOCH="$(date +%s)"
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

deployment_index_by_id() {
  local deployment_id="$1"
  local i

  for (( i = 0; i < ${#DEP_IDS[@]}; i++ )); do
    if [[ "${DEP_IDS[i]}" == "$deployment_id" ]]; then
      printf '%s' "$i"
      return
    fi
  done

  printf '%s' "-1"
}

stream_worker_index_by_id() {
  local deployment_id="$1"
  local i

  for (( i = 0; i < ${#STREAM_IDS[@]}; i++ )); do
    if [[ "${STREAM_IDS[i]}" == "$deployment_id" ]]; then
      printf '%s' "$i"
      return
    fi
  done

  printf '%s' "-1"
}

remove_stream_worker_by_index() {
  local remove_index="$1"
  local i
  local -a next_ids=()
  local -a next_pids=()

  for (( i = 0; i < ${#STREAM_IDS[@]}; i++ )); do
    if (( i == remove_index )); then
      continue
    fi
    next_ids+=("${STREAM_IDS[i]}")
    next_pids+=("${STREAM_PIDS[i]}")
  done

  STREAM_IDS=("${next_ids[@]}")
  STREAM_PIDS=("${next_pids[@]}")
}

stop_stream_worker_by_index() {
  local stop_index="$1"
  local pid

  if (( stop_index < 0 || stop_index >= ${#STREAM_PIDS[@]} )); then
    return
  fi

  pid="${STREAM_PIDS[stop_index]}"
  if [[ "$pid" =~ ^[0-9]+$ ]]; then
    kill "$pid" >/dev/null 2>&1 || true
    wait "$pid" >/dev/null 2>&1 || true
  fi

  remove_stream_worker_by_index "$stop_index"
}

stop_all_event_stream_workers() {
  local i

  for (( i = ${#STREAM_PIDS[@]} - 1; i >= 0; i-- )); do
    stop_stream_worker_by_index "$i"
  done
}

start_event_stream_worker() {
  local deployment_id="$1"
  local since_ms="${2:-}"
  local stream_url

  if [[ "$EVENT_MODE_ACTIVE" != "stream" ]]; then
    return
  fi
  if [[ -z "$EVENT_BUS_FILE" ]]; then
    return
  fi

  stream_url="$(build_deployment_events_url "$deployment_id" "$since_ms" 1 "forward")"

  (
    set +e
    while true; do
      curl --silent --show-error --no-buffer --location \
        --header "Authorization: Bearer ${TOKEN}" \
        --header "Accept: application/json" \
        "$stream_url" |
        parse_deployment_events_stream_payload |
        while IFS=$'\x1f' read -r created_ms event_state event_step event_text event_type; do
          if [[ -z "${created_ms}${event_state}${event_step}${event_text}${event_type}" ]]; then
            continue
          fi
          printf '%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\n' \
            "$deployment_id" "$created_ms" "$event_state" "$event_step" "$event_text" "$event_type" >>"$EVENT_BUS_FILE"
        done

      # Streams can disconnect; reconnect after a short backoff.
      sleep 1
    done
  ) &

  STREAM_IDS+=("$deployment_id")
  STREAM_PIDS+=("$!")
}

record_event_update_for_index() {
  local index="$1"
  local created_ms="$2"
  local event_state="$3"
  local event_step="$4"
  local event_text="$5"
  local _source="${6:-poll}"
  local previous_event_ms event_epoch event_message short_id

  previous_event_ms="${DEP_LAST_EVENT_MS[index]:-0}"

  event_step="$(sanitize_field "$event_step")"
  event_text="$(sanitize_field "$event_text")"

  if [[ "$created_ms" =~ ^[0-9]+$ ]] && (( created_ms > previous_event_ms )); then
    DEP_LAST_EVENT_MS[index]="$created_ms"
    event_epoch=$(( created_ms / 1000 ))
    if (( event_epoch > 0 )); then
      LAST_EVENT_EPOCH="$event_epoch"
    fi

    event_message="$event_step"
    if [[ -z "$event_message" ]]; then
      event_message="$event_text"
    fi
    if [[ -n "$event_message" ]]; then
      event_message="$(truncate_text "$event_message" 88)"
      short_id="$(short_deployment_label "${DEP_IDS[index]}")"
      LAST_EVENT_MESSAGE="[${short_id}] ${event_message}"
    fi
  fi

  if [[ -n "$event_step" ]]; then
    DEP_STEP[index]="$event_step"
  fi
  if [[ -n "$event_text" ]]; then
    DEP_LAST_EVENT_TEXT[index]="$event_text"
  fi

  if [[ -n "$event_state" ]]; then
    if [[ "${DEP_STATUS[index]}" == "UNKNOWN" || "${DEP_STATUS[index]}" == "WAITING" ]]; then
      DEP_STATUS[index]="$event_state"
    fi
  fi
}

consume_event_bus_updates() {
  local total_lines start_line line deployment_id created_ms event_state event_step event_text event_type index

  if [[ -z "$EVENT_BUS_FILE" || ! -f "$EVENT_BUS_FILE" ]]; then
    return
  fi

  total_lines="$(wc -l < "$EVENT_BUS_FILE" | tr -d ' ')"
  if ! [[ "$total_lines" =~ ^[0-9]+$ ]]; then
    return
  fi
  if (( total_lines <= EVENT_BUS_OFFSET )); then
    return
  fi

  start_line=$(( EVENT_BUS_OFFSET + 1 ))
  while IFS= read -r line; do
    if [[ -z "$line" ]]; then
      continue
    fi

    IFS=$'\x1f' read -r deployment_id created_ms event_state event_step event_text event_type <<<"$line"
    if [[ -z "$deployment_id" ]]; then
      continue
    fi

    index="$(deployment_index_by_id "$deployment_id")"
    if (( index < 0 )); then
      continue
    fi

    record_event_update_for_index "$index" "$created_ms" "$event_state" "$event_step" "$event_text" "stream"
  done < <(sed -n "${start_line},${total_lines}p" "$EVENT_BUS_FILE")

  EVENT_BUS_OFFSET="$total_lines"
}

reconcile_event_stream_workers() {
  local i worker_id worker_pid idx dep_id dep_status since_ms existing_idx

  if [[ "$EVENT_MODE_ACTIVE" != "stream" ]]; then
    stop_all_event_stream_workers
    return
  fi

  # Drop workers that already exited.
  for (( i = ${#STREAM_PIDS[@]} - 1; i >= 0; i-- )); do
    worker_pid="${STREAM_PIDS[i]}"
    if ! kill -0 "$worker_pid" >/dev/null 2>&1; then
      remove_stream_worker_by_index "$i"
    fi
  done

  # Stop workers for deployments that no longer exist or are terminal.
  for (( i = ${#STREAM_IDS[@]} - 1; i >= 0; i-- )); do
    worker_id="${STREAM_IDS[i]}"
    idx="$(deployment_index_by_id "$worker_id")"
    if (( idx < 0 )); then
      stop_stream_worker_by_index "$i"
      continue
    fi

    if is_terminal_status "${DEP_STATUS[idx]}"; then
      stop_stream_worker_by_index "$i"
      continue
    fi
  done

  # Start workers for active deployments, up to MAX_STREAM_WORKERS.
  for (( i = 0; i < ${#DEP_IDS[@]}; i++ )); do
    if (( ${#STREAM_IDS[@]} >= MAX_STREAM_WORKERS )); then
      break
    fi

    dep_id="${DEP_IDS[i]}"
    dep_status="${DEP_STATUS[i]}"
    if is_terminal_status "$dep_status"; then
      continue
    fi

    existing_idx="$(stream_worker_index_by_id "$dep_id")"
    if (( existing_idx >= 0 )); then
      continue
    fi

    since_ms="${DEP_LAST_EVENT_MS[i]:-0}"
    if [[ "$since_ms" =~ ^[0-9]+$ ]] && (( since_ms > 0 )); then
      since_ms=$(( since_ms + 1 ))
    else
      since_ms=""
    fi

    start_event_stream_worker "$dep_id" "$since_ms"
  done
}

refresh_project_deployments() {
  local response parsed record
  local dep_id dep_status dep_url dep_created_at dep_ready_at dep_target dep_branch dep_error
  local old_idx first_seen last_status announced step_label last_event_ms last_event_text project_name
  local -a next_ids=()
  local -a next_status=()
  local -a next_url=()
  local -a next_created_at=()
  local -a next_ready_at=()
  local -a next_target=()
  local -a next_branch=()
  local -a next_error=()
  local -a next_first_seen=()
  local -a next_last_status=()
  local -a next_announced=()
  local -a next_step=()
  local -a next_last_event_ms=()
  local -a next_last_event_text=()
  local -a next_project_name=()

  if ! response="$(fetch_json "$(build_project_deployments_url)")"; then
    warn_line "Failed to fetch project deployments. Retrying..."
    return 1
  fi

  if ! parsed="$(printf '%s' "$response" | parse_project_deployments_payload 2>&1)"; then
    warn_line "Project deployments API error: ${parsed}"
    return 1
  fi

  if [[ -z "$parsed" ]]; then
    DEP_IDS=()
    DEP_STATUS=()
    DEP_URL=()
    DEP_CREATED_AT_MS=()
    DEP_READY_AT_MS=()
    DEP_TARGET=()
    DEP_BRANCH=()
    DEP_ERROR_MESSAGE=()
    DEP_FIRST_SEEN_EPOCH=()
    DEP_LAST_STATUS=()
    DEP_TERMINAL_ANNOUNCED=()
    DEP_STEP=()
    DEP_LAST_EVENT_MS=()
    DEP_LAST_EVENT_TEXT=()
    DEP_PROJECT_NAME=()
    return 0
  fi

  while IFS= read -r record; do
    if [[ -z "$record" ]]; then
      continue
    fi

    IFS=$'\x1f' read -r dep_id dep_status dep_url dep_created_at dep_ready_at dep_target dep_branch dep_error <<<"$record"

    if [[ -z "$dep_id" ]]; then
      continue
    fi

    old_idx="$(deployment_index_by_id "$dep_id")"
    if (( old_idx >= 0 )); then
      first_seen="${DEP_FIRST_SEEN_EPOCH[old_idx]}"
      last_status="${DEP_LAST_STATUS[old_idx]}"
      announced="${DEP_TERMINAL_ANNOUNCED[old_idx]}"
      step_label="${DEP_STEP[old_idx]}"
      last_event_ms="${DEP_LAST_EVENT_MS[old_idx]}"
      last_event_text="${DEP_LAST_EVENT_TEXT[old_idx]}"
      project_name="${DEP_PROJECT_NAME[old_idx]}"
    else
      first_seen="$(date +%s)"
      last_status=""
      announced="0"
      step_label=""
      last_event_ms="0"
      last_event_text=""
      project_name="$(derive_short_project_name "$dep_url" "$dep_id")"
    fi

    dep_status="${dep_status:-UNKNOWN}"

    next_ids+=("$dep_id")
    next_status+=("$dep_status")
    next_url+=("$dep_url")
    next_created_at+=("$dep_created_at")
    next_ready_at+=("$dep_ready_at")
    next_target+=("$dep_target")
    next_branch+=("$dep_branch")
    next_error+=("$dep_error")
    next_first_seen+=("$first_seen")
    next_last_status+=("$last_status")
    next_announced+=("$announced")
    next_step+=("$step_label")
    next_last_event_ms+=("$last_event_ms")
    next_last_event_text+=("$last_event_text")
    next_project_name+=("$project_name")
  done <<<"$parsed"

  DEP_IDS=("${next_ids[@]}")
  DEP_STATUS=("${next_status[@]}")
  DEP_URL=("${next_url[@]}")
  DEP_CREATED_AT_MS=("${next_created_at[@]}")
  DEP_READY_AT_MS=("${next_ready_at[@]}")
  DEP_TARGET=("${next_target[@]}")
  DEP_BRANCH=("${next_branch[@]}")
  DEP_ERROR_MESSAGE=("${next_error[@]}")
  DEP_FIRST_SEEN_EPOCH=("${next_first_seen[@]}")
  DEP_LAST_STATUS=("${next_last_status[@]}")
  DEP_TERMINAL_ANNOUNCED=("${next_announced[@]}")
  DEP_STEP=("${next_step[@]}")
  DEP_LAST_EVENT_MS=("${next_last_event_ms[@]}")
  DEP_LAST_EVENT_TEXT=("${next_last_event_text[@]}")
  DEP_PROJECT_NAME=("${next_project_name[@]}")

  return 0
}

refresh_single_deployment() {
  local response parsed
  local dep_status dep_id dep_url dep_created_at dep_ready_at dep_target dep_branch dep_error
  local old_idx first_seen last_status announced step_label last_event_ms last_event_text project_name

  if [[ -z "$ACTIVE_SINGLE_TARGET" ]]; then
    ACTIVE_SINGLE_TARGET="$TARGET"
  fi

  if ! response="$(fetch_json "$(build_deployment_url "$ACTIVE_SINGLE_TARGET")")"; then
    warn_line "Failed to fetch deployment '${ACTIVE_SINGLE_TARGET}'. Retrying..."
    return 1
  fi

  if ! parsed="$(printf '%s' "$response" | parse_deployment_payload 2>&1)"; then
    warn_line "Deployment API error for '${ACTIVE_SINGLE_TARGET}': ${parsed}"
    return 1
  fi

  IFS=$'\x1f' read -r dep_status dep_id dep_url dep_created_at dep_ready_at dep_target dep_branch dep_error <<<"$parsed"
  if [[ -n "$dep_id" ]]; then
    ACTIVE_SINGLE_TARGET="$dep_id"
  else
    dep_id="$ACTIVE_SINGLE_TARGET"
  fi

  old_idx="$(deployment_index_by_id "$dep_id")"
  if (( old_idx >= 0 )); then
    first_seen="${DEP_FIRST_SEEN_EPOCH[old_idx]}"
    last_status="${DEP_LAST_STATUS[old_idx]}"
    announced="${DEP_TERMINAL_ANNOUNCED[old_idx]}"
    step_label="${DEP_STEP[old_idx]}"
    last_event_ms="${DEP_LAST_EVENT_MS[old_idx]}"
    last_event_text="${DEP_LAST_EVENT_TEXT[old_idx]}"
    project_name="${DEP_PROJECT_NAME[old_idx]}"
  else
    first_seen="$(date +%s)"
    last_status=""
    announced="0"
    step_label=""
    last_event_ms="0"
    last_event_text=""
    project_name="$(derive_short_project_name "$dep_url" "$dep_id")"
  fi

  dep_status="${dep_status:-UNKNOWN}"

  DEP_IDS=("$dep_id")
  DEP_STATUS=("$dep_status")
  DEP_URL=("$dep_url")
  DEP_CREATED_AT_MS=("$dep_created_at")
  DEP_READY_AT_MS=("$dep_ready_at")
  DEP_TARGET=("$dep_target")
  DEP_BRANCH=("$dep_branch")
  DEP_ERROR_MESSAGE=("$dep_error")
  DEP_FIRST_SEEN_EPOCH=("$first_seen")
  DEP_LAST_STATUS=("$last_status")
  DEP_TERMINAL_ANNOUNCED=("$announced")
  DEP_STEP=("$step_label")
  DEP_LAST_EVENT_MS=("$last_event_ms")
  DEP_LAST_EVENT_TEXT=("$last_event_text")
  DEP_PROJECT_NAME=("$project_name")

  return 0
}

update_events_for_index() {
  local index="$1"
  local deployment_id since_ms request_since direction response parsed
  local created_ms event_state event_step event_text

  deployment_id="${DEP_IDS[index]}"
  since_ms="${DEP_LAST_EVENT_MS[index]:-0}"
  request_since=""
  direction="backward"

  if [[ "$since_ms" =~ ^[0-9]+$ ]] && (( since_ms > 0 )); then
    request_since=$(( since_ms + 1 ))
    direction="forward"
  fi

  if ! response="$(fetch_json "$(build_deployment_events_url "$deployment_id" "$request_since" 0 "$direction")")"; then
    return 1
  fi

  if ! parsed="$(printf '%s' "$response" | parse_deployment_events_snapshot_payload 2>/dev/null)"; then
    return 1
  fi

  IFS=$'\x1f' read -r created_ms event_state event_step event_text <<<"$parsed"
  if [[ -z "${created_ms}${event_state}${event_step}${event_text}" ]]; then
    return 0
  fi

  record_event_update_for_index "$index" "$created_ms" "$event_state" "$event_step" "$event_text" "poll"
  return 0
}

deployment_step_label() {
  local index="$1"
  local step_text event_text

  step_text="$(sanitize_field "${DEP_STEP[index]:-}")"
  event_text="$(sanitize_field "${DEP_LAST_EVENT_TEXT[index]:-}")"

  if [[ -n "$step_text" ]]; then
    printf '%s' "$step_text"
    return
  fi
  if [[ -n "$event_text" ]]; then
    printf '%s' "$event_text"
    return
  fi

  printf '%s' "$(friendly_status "${DEP_STATUS[index]:-UNKNOWN}")"
}

process_deployment_transitions_and_alerts() {
  local i status old_status dep_id env_label branch_label spoken_branch duration_seconds duration_text spoken_duration
  local alert_message spoken_alert error_message

  for (( i = 0; i < ${#DEP_IDS[@]}; i++ )); do
    dep_id="${DEP_IDS[i]}"
    status="${DEP_STATUS[i]:-UNKNOWN}"
    old_status="${DEP_LAST_STATUS[i]:-}"

    if [[ -z "$old_status" ]]; then
      log_line "Watching deployment id=${dep_id} state=${status}"
    elif [[ "$status" != "$old_status" ]]; then
      log_line "Transition: ${old_status} -> ${status} (id=${dep_id})"
    fi

    env_label="$(friendly_environment_label "${DEP_TARGET[i]:-preview}")"
    branch_label="$(friendly_branch_label "${DEP_BRANCH[i]:-}" "${DEP_TARGET[i]:-preview}")"
    spoken_branch="$(spoken_branch_name "$branch_label")"

    duration_seconds="$(duration_seconds_for_record "${DEP_CREATED_AT_MS[i]:-}" "${DEP_READY_AT_MS[i]:-}" "${DEP_FIRST_SEEN_EPOCH[i]:-$(date +%s)}")"
    duration_text="$(format_duration "$duration_seconds")"
    error_message="$(sanitize_field "${DEP_ERROR_MESSAGE[i]:-}")"

    if is_terminal_status "$status"; then
      if (( ${DEP_TERMINAL_ANNOUNCED[i]:-0} == 0 )); then
        spoken_duration="$(format_spoken_duration "$duration_seconds")"

        case "$status" in
          READY)
            alert_message="${env_label} ${spoken_branch} deployment completed in ${duration_text}."
            spoken_alert="${env_label} ${spoken_branch} deployment completed in ${spoken_duration}."
            LAST_ALERT_LEVEL="success"
            log_line "Alert: ${alert_message}"
            ;;
          ERROR|CANCELED|FAILED)
            alert_message="${env_label} ${spoken_branch} deployment ended with ${status} after ${duration_text}."
            spoken_alert="${env_label} ${spoken_branch} deployment ended with ${status} after ${spoken_duration}."
            if [[ -n "$error_message" ]]; then
              alert_message="${alert_message} ${error_message}"
              spoken_alert="${spoken_alert} ${error_message}"
            fi
            LAST_ALERT_LEVEL="error"
            warn_line "Alert: ${alert_message}"
            ;;
          *)
            alert_message="${env_label} ${spoken_branch} deployment ended with ${status} after ${duration_text}."
            spoken_alert="$alert_message"
            LAST_ALERT_LEVEL="warning"
            log_line "Alert: ${alert_message}"
            ;;
        esac

        LAST_ALERT_MESSAGE="$alert_message"
        LAST_ALERT_EPOCH="$(date +%s)"
        play_production_beat "${DEP_TARGET[i]:-preview}"
        speak_alert "$spoken_alert"
        DEP_TERMINAL_ANNOUNCED[i]=1
      fi
    else
      DEP_TERMINAL_ANNOUNCED[i]=0
    fi

    DEP_LAST_STATUS[i]="$status"
  done
}

update_dashboard_overview() {
  local i status

  DASH_DEPLOYMENTS_TOTAL="${#DEP_IDS[@]}"
  DASH_DEPLOYMENTS_ACTIVE=0
  DASH_DEPLOYMENTS_READY=0
  DASH_DEPLOYMENTS_FAILED=0

  for (( i = 0; i < ${#DEP_IDS[@]}; i++ )); do
    status="${DEP_STATUS[i]:-UNKNOWN}"

    if is_active_status "$status"; then
      DASH_DEPLOYMENTS_ACTIVE=$(( DASH_DEPLOYMENTS_ACTIVE + 1 ))
      continue
    fi

    case "$status" in
      READY)
        DASH_DEPLOYMENTS_READY=$(( DASH_DEPLOYMENTS_READY + 1 ))
        ;;
      ERROR|CANCELED|FAILED)
        DASH_DEPLOYMENTS_FAILED=$(( DASH_DEPLOYMENTS_FAILED + 1 ))
        ;;
    esac
  done

  if (( DASH_DEPLOYMENTS_TOTAL == 0 )); then
    DASH_STATUS_LABEL="Waiting for deployment"
    DASH_STATUS_RAW="WAITING"
  elif (( DASH_DEPLOYMENTS_ACTIVE > 0 && DASH_DEPLOYMENTS_FAILED > 0 )); then
    DASH_STATUS_LABEL="Deploying (with failures)"
    DASH_STATUS_RAW="BUILDING"
  elif (( DASH_DEPLOYMENTS_ACTIVE > 0 )); then
    DASH_STATUS_LABEL="Deploying"
    DASH_STATUS_RAW="BUILDING"
  elif (( DASH_DEPLOYMENTS_FAILED > 0 && DASH_DEPLOYMENTS_READY == 0 )); then
    DASH_STATUS_LABEL="Failed"
    DASH_STATUS_RAW="ERROR"
  elif (( DASH_DEPLOYMENTS_READY > 0 )); then
    DASH_STATUS_LABEL="Ready"
    DASH_STATUS_RAW="READY"
  else
    DASH_STATUS_LABEL="Unknown"
    DASH_STATUS_RAW="UNKNOWN"
  fi

  if [[ -n "$PROJECT_SHORT_NAME" ]]; then
    DASH_PROJECT_NAME="$PROJECT_SHORT_NAME"
  elif [[ "$WATCH_MODE" == "project" ]]; then
    DASH_PROJECT_NAME="${PROJECT_ID#prj_}"
  elif (( ${#DEP_PROJECT_NAME[@]} > 0 )); then
    DASH_PROJECT_NAME="${DEP_PROJECT_NAME[0]}"
  fi

  DASH_UPDATED_AT_LABEL="$(date '+%H:%M:%S')"
}

render_dashboard() {
  local status_mark alert_mark event_time_display alert_time_display
  local i status env_mark branch_label status_label step_label progress_percent progress_bar
  local id_label url_label started_display duration_text event_display error_text row_status_icon

  if (( DASHBOARD_ENABLED == 0 )); then
    return
  fi

  status_mark="$(status_icon "${DASH_STATUS_RAW:-UNKNOWN}")"
  alert_mark="$(alert_icon "${LAST_ALERT_LEVEL:-info}")"
  event_time_display="$(format_epoch_with_relative "$LAST_EVENT_EPOCH")"
  alert_time_display="$(format_epoch_with_relative "$LAST_ALERT_EPOCH")"

  printf '\033[H\033[2J'
  printf 'Vercel Deploy Monitor\n'
  printf '=====================\n'
  printf 'Project      : %s\n' "${DASH_PROJECT_NAME:-n/a}"
  printf 'Mode         : %s\n' "${DASH_MODE_LABEL:-n/a}"
  printf 'Event Feed   : %s\n' "${DASH_FEED_LABEL:-polling}"
  printf 'Last Update  : %s\n' "${DASH_UPDATED_AT_LABEL:-n/a}"

  printf '\nCurrent Status\n'
  printf '%s\n' '--------------'
  printf 'Overall      : %s %s\n' "$status_mark" "${DASH_STATUS_LABEL:-Unknown}"
  printf 'Deployments  : %s total | %s active | %s ready | %s failed\n' \
    "${DASH_DEPLOYMENTS_TOTAL:-0}" "${DASH_DEPLOYMENTS_ACTIVE:-0}" "${DASH_DEPLOYMENTS_READY:-0}" "${DASH_DEPLOYMENTS_FAILED:-0}"
  printf 'Last Event   : %s\n' "${LAST_EVENT_MESSAGE:-Starting...}"
  printf 'Event Time   : %s\n' "$event_time_display"
  printf 'Last Alert   : %s %s\n' "$alert_mark" "${LAST_ALERT_MESSAGE:-None}"
  printf 'Alert Time   : %s\n' "$alert_time_display"

  printf '\nDeployment Details\n'
  printf '%s\n' '------------------'

  if (( ${#DEP_IDS[@]} == 0 )); then
    printf 'No deployments detected yet.\n'
  else
    for (( i = 0; i < ${#DEP_IDS[@]}; i++ )); do
      status="${DEP_STATUS[i]:-UNKNOWN}"
      row_status_icon="$(status_icon "$status")"
      env_mark="$(environment_icon "${DEP_TARGET[i]:-preview}")"
      branch_label="$(friendly_branch_label "${DEP_BRANCH[i]:-}" "${DEP_TARGET[i]:-preview}")"
      branch_label="$(truncate_text "$branch_label" 24)"
      status_label="$(friendly_status "$status")"

      step_label="$(deployment_step_label "$i")"
      step_label="$(truncate_text "$step_label" 78)"

      progress_percent="$(status_progress_percent "$status" "$step_label")"
      progress_bar="$(render_progress_bar "$progress_percent" 24 "$status")"

      id_label="$(short_deployment_label "${DEP_IDS[i]}")"
      url_label="$(friendly_host "${DEP_URL[i]:-}")"
      url_label="$(truncate_text "$url_label" 38)"

      started_display="$(format_ms_with_relative "${DEP_CREATED_AT_MS[i]:-}")"
      duration_text="$(format_duration "$(duration_seconds_for_record "${DEP_CREATED_AT_MS[i]:-}" "${DEP_READY_AT_MS[i]:-}" "${DEP_FIRST_SEEN_EPOCH[i]:-$(date +%s)}")")"
      event_display="$(format_ms_with_relative "${DEP_LAST_EVENT_MS[i]:-0}")"

      printf '%2d. %s %s %-24s %-12s %s %3d%%\n' \
        "$(( i + 1 ))" "$env_mark" "$row_status_icon" "$branch_label" "$status_label" "$progress_bar" "$progress_percent"
      printf '    step     : %s\n' "$step_label"
      printf '    id / url : %s | %s\n' "$id_label" "$url_label"
      printf '    started  : %s | elapsed %s | last event %s\n' "$started_display" "$duration_text" "$event_display"

      error_text="$(sanitize_field "${DEP_ERROR_MESSAGE[i]:-}")"
      if [[ -n "$error_text" && ( "$status" == "ERROR" || "$status" == "FAILED" || "$status" == "CANCELED" ) ]]; then
        error_text="$(truncate_text "$error_text" 90)"
        printf '    error    : %s\n' "$error_text"
      fi

      printf '\n'
    done
  fi

  printf 'Press Ctrl+C to stop.\n'
}

cleanup_runtime() {
  stop_all_event_stream_workers

  if [[ -n "${RUNTIME_DIR:-}" && -d "${RUNTIME_DIR}" ]]; then
    rm -rf "${RUNTIME_DIR}" >/dev/null 2>&1 || true
  fi
}

handle_interrupt() {
  warn_line "Stopped deployment monitor."
  DASH_STATUS_LABEL="Stopped"
  DASH_STATUS_RAW="STOPPED"
  render_dashboard
  if (( DASHBOARD_ENABLED == 1 )); then
    echo
  fi
  exit 0
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
MAX_DEPLOYMENTS=6
EVENT_MODE="auto"

DASH_PROJECT_NAME="n/a"
DASH_MODE_LABEL="n/a"
DASH_STATUS_LABEL="Waiting"
DASH_STATUS_RAW="WAITING"
DASH_FEED_LABEL="Polling"
DASH_UPDATED_AT_LABEL="n/a"
DASH_DEPLOYMENTS_TOTAL=0
DASH_DEPLOYMENTS_ACTIVE=0
DASH_DEPLOYMENTS_READY=0
DASH_DEPLOYMENTS_FAILED=0

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
    --max-deployments)
      if [[ $# -lt 2 ]]; then
        print_error "$1 requires a value."
        exit 1
      fi
      MAX_DEPLOYMENTS="$2"
      shift 2
      ;;
    --event-mode)
      if [[ $# -lt 2 ]]; then
        print_error "$1 requires a value."
        exit 1
      fi
      EVENT_MODE="$2"
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

if ! [[ "$MAX_DEPLOYMENTS" =~ ^[1-9][0-9]*$ ]]; then
  print_error "--max-deployments must be a positive integer."
  exit 1
fi

EVENT_MODE="$(printf '%s' "$EVENT_MODE" | tr '[:upper:]' '[:lower:]')"
if [[ "$EVENT_MODE" != "auto" && "$EVENT_MODE" != "stream" && "$EVENT_MODE" != "poll" ]]; then
  print_error "--event-mode must be one of: auto, stream, poll."
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

EVENT_MODE_ACTIVE="$EVENT_MODE"
if [[ "$EVENT_MODE_ACTIVE" == "auto" ]]; then
  if (( DASHBOARD_ENABLED == 1 )); then
    EVENT_MODE_ACTIVE="stream"
  else
    EVENT_MODE_ACTIVE="poll"
  fi
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

if [[ "$EVENT_MODE_ACTIVE" == "stream" ]]; then
  DASH_FEED_LABEL="Stream events + poll fallback"
else
  DASH_FEED_LABEL="Event polling"
fi

MAX_STREAM_WORKERS=4
if (( MAX_DEPLOYMENTS < MAX_STREAM_WORKERS )); then
  MAX_STREAM_WORKERS="$MAX_DEPLOYMENTS"
fi
if (( MAX_STREAM_WORKERS < 1 )); then
  MAX_STREAM_WORKERS=1
fi

DEP_IDS=()
DEP_STATUS=()
DEP_URL=()
DEP_CREATED_AT_MS=()
DEP_READY_AT_MS=()
DEP_TARGET=()
DEP_BRANCH=()
DEP_ERROR_MESSAGE=()
DEP_FIRST_SEEN_EPOCH=()
DEP_LAST_STATUS=()
DEP_TERMINAL_ANNOUNCED=()
DEP_STEP=()
DEP_LAST_EVENT_MS=()
DEP_LAST_EVENT_TEXT=()
DEP_PROJECT_NAME=()

STREAM_IDS=()
STREAM_PIDS=()
EVENT_BUS_OFFSET=0
RUNTIME_DIR=""
EVENT_BUS_FILE=""
ACTIVE_SINGLE_TARGET=""

if [[ "$EVENT_MODE_ACTIVE" == "stream" ]]; then
  if RUNTIME_DIR="$(mktemp -d "${TMPDIR:-/tmp}/vercel-deploy-monitor.XXXXXX" 2>/dev/null)"; then
    EVENT_BUS_FILE="${RUNTIME_DIR}/events.log"
    : >"$EVENT_BUS_FILE"
  else
    warn_line "Failed to create runtime dir for event streaming. Falling back to polling mode."
    EVENT_MODE_ACTIVE="poll"
    DASH_FEED_LABEL="Event polling"
  fi
fi

if [[ "$WATCH_MODE" == "deployment" ]]; then
  log_line "Monitoring deployment '${TARGET}' every ${INTERVAL_SECONDS}s (Ctrl+C to stop)..."
else
  log_line "Monitoring latest ${MAX_DEPLOYMENTS} deployments for project '${PROJECT_ID}' every ${INTERVAL_SECONDS}s (Ctrl+C to stop)..."
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
log_line "Event mode: ${EVENT_MODE_ACTIVE}"

update_dashboard_overview
render_dashboard

trap 'handle_interrupt' INT TERM
trap 'cleanup_runtime' EXIT

START_EPOCH="$(date +%s)"
NO_DEPLOYMENTS_REPORTED=0

while true; do
  local_refresh_ok=1

  check_timeout_or_exit

  if [[ "$WATCH_MODE" == "project" ]]; then
    if ! refresh_project_deployments; then
      local_refresh_ok=0
    fi

    if (( local_refresh_ok == 0 )); then
      DASH_STATUS_LABEL="Connection issue"
      DASH_STATUS_RAW="CONNECTION_ISSUE"
      update_dashboard_overview
      render_dashboard
      sleep_for_next_poll
      continue
    fi

    if (( ${#DEP_IDS[@]} == 0 )); then
      if (( NO_DEPLOYMENTS_REPORTED == 0 )); then
        log_line "No deployments found yet for project '${PROJECT_ID}'."
        NO_DEPLOYMENTS_REPORTED=1
      fi
      DASH_STATUS_LABEL="Waiting for deployment"
      DASH_STATUS_RAW="WAITING"
      update_dashboard_overview
      render_dashboard
      sleep_for_next_poll
      continue
    fi
    NO_DEPLOYMENTS_REPORTED=0
  else
    if ! refresh_single_deployment; then
      DASH_STATUS_LABEL="Connection issue"
      DASH_STATUS_RAW="CONNECTION_ISSUE"
      update_dashboard_overview
      render_dashboard
      sleep_for_next_poll
      continue
    fi
  fi

  if [[ "$EVENT_MODE_ACTIVE" == "stream" ]]; then
    reconcile_event_stream_workers
    consume_event_bus_updates
  fi

  # Poll event snapshots for all visible deployments to keep details current even if streaming lags.
  for (( i = 0; i < ${#DEP_IDS[@]}; i++ )); do
    update_events_for_index "$i" >/dev/null 2>&1 || true
  done

  process_deployment_transitions_and_alerts
  update_dashboard_overview
  render_dashboard
  sleep_for_next_poll
done
