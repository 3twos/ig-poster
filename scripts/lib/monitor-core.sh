#!/usr/bin/env bash
# Shared core utilities for monitor scripts.
# Usage: source "${SCRIPT_DIR}/lib/monitor-core.sh"

[[ -n "${_MONITOR_CORE_LOADED:-}" ]] && return 0
_MONITOR_CORE_LOADED=1

# ---------------------------------------------------------------------------
# Global state (read/written by log_line, warn_line, dashboard, etc.)
# ---------------------------------------------------------------------------

DASHBOARD_ENABLED="${DASHBOARD_ENABLED:-0}"
DASHBOARD_LAST_RENDER_LINES="${DASHBOARD_LAST_RENDER_LINES:-0}"
DASHBOARD_CURRENT_RENDER_LINES="${DASHBOARD_CURRENT_RENDER_LINES:-0}"

LAST_EVENT_MESSAGE="${LAST_EVENT_MESSAGE:-Starting...}"
LAST_ALERT_MESSAGE="${LAST_ALERT_MESSAGE:-None}"
LAST_EVENT_EPOCH="${LAST_EVENT_EPOCH:-0}"
LAST_ALERT_EPOCH="${LAST_ALERT_EPOCH:-0}"
LAST_ALERT_LEVEL="${LAST_ALERT_LEVEL:-info}"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Text utilities
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Time formatting
# ---------------------------------------------------------------------------

format_duration() {
  local total_seconds="$1"
  local hours minutes seconds

  if ! [[ "$total_seconds" =~ ^-?[0-9]+$ ]]; then
    printf '%s' "n/a"
    return
  fi
  if (( total_seconds < 0 )); then
    total_seconds=0
  fi

  if (( total_seconds < 60 )); then
    printf '%ss' "$total_seconds"
    return
  fi

  if (( total_seconds < 3600 )); then
    printf '%02d:%02d' $(( total_seconds / 60 )) $(( total_seconds % 60 ))
    return
  fi

  hours=$(( total_seconds / 3600 ))
  minutes=$(( (total_seconds % 3600) / 60 ))
  seconds=$(( total_seconds % 60 ))
  printf '%02d:%02d:%02d' "$hours" "$minutes" "$seconds"
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

format_epoch_local() {
  local epoch_seconds="$1"

  if ! [[ "$epoch_seconds" =~ ^[0-9]+$ ]] || (( epoch_seconds <= 0 )); then
    printf '%s' "n/a"
    return
  fi

  if date -r 0 '+%s' >/dev/null 2>&1; then
    date -r "$epoch_seconds" '+%H:%M:%S' 2>/dev/null || printf '%s' "n/a"
    return
  fi

  if date -d "@0" '+%s' >/dev/null 2>&1; then
    date -d "@$epoch_seconds" '+%H:%M:%S' 2>/dev/null || printf '%s' "n/a"
    return
  fi

  printf '%s' "n/a"
}

format_epoch_with_relative() {
  local epoch_seconds="$1"
  local local_clock relative_time now elapsed

  if ! [[ "$epoch_seconds" =~ ^[0-9]+$ ]] || (( epoch_seconds <= 0 )); then
    printf '%s' "n/a"
    return
  fi

  local_clock="$(format_epoch_local "$epoch_seconds")"
  now="$(date +%s)"
  elapsed=$(( now - epoch_seconds ))
  relative_time="$(relative_time_from_seconds "$elapsed")"

  if [[ "$local_clock" == "n/a" ]]; then
    printf '%s' "$relative_time"
    return
  fi

  printf '%s (%s)' "$local_clock" "$relative_time"
}

# ---------------------------------------------------------------------------
# Git/repo detection
# ---------------------------------------------------------------------------

detect_repo_slug() {
  local url

  if ! url="$(git remote get-url origin 2>/dev/null)"; then
    return 1
  fi

  url="${url#git@github.com:}"
  url="${url#https://github.com/}"
  url="${url#http://github.com/}"
  url="${url%.git}"

  if [[ "$url" != */* ]]; then
    return 1
  fi

  printf '%s' "$url"
}

detect_current_branch() {
  local branch

  if ! branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"; then
    return 1
  fi
  if [[ -z "$branch" || "$branch" == "HEAD" ]]; then
    return 1
  fi

  printf '%s' "$branch"
}
