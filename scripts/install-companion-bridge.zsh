#!/usr/bin/env zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGE_DIR="$REPO_ROOT/companion/IGPosterCompanion"
PLIST_TEMPLATE="$PACKAGE_DIR/support/com.3twos.igposter.bridge.plist.template"

LABEL="com.3twos.igposter.bridge"
DEFAULT_PORT="${IG_POSTER_BRIDGE_PORT:-43123}"
INSTALL_ROOT="${IG_POSTER_COMPANION_HOME:-$HOME/Library/Application Support/IGPosterCompanion}"
BIN_DIR="$INSTALL_ROOT/bin"
BRIDGE_BIN="$BIN_DIR/ig-poster-companion-bridge"
LOG_DIR="$HOME/Library/Logs/IGPosterCompanion"
STDOUT_LOG="$LOG_DIR/bridge.out.log"
STDERR_LOG="$LOG_DIR/bridge.err.log"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"

PORT="$DEFAULT_PORT"
LOAD_AGENT=1
UNINSTALL=0

usage() {
  cat <<EOF
Usage: ./scripts/install-companion-bridge.zsh [options]

Build the macOS Apple Photos bridge, install it into your user Library, and
optionally register a LaunchAgent so it starts automatically at login.

Options:
  --port <n>      Bridge port to install into the LaunchAgent (default: $DEFAULT_PORT)
  --no-load       Install files but do not load/restart the LaunchAgent
  --uninstall     Remove the installed bridge binary and LaunchAgent
  --help          Show this help text

Installed files:
  Binary: $BRIDGE_BIN
  LaunchAgent: $PLIST_PATH
  Logs: $STDOUT_LOG, $STDERR_LOG
EOF
}

fail() {
  print -u2 -- "$1"
  exit 1
}

require_macos() {
  [[ "$(uname -s)" == "Darwin" ]] || fail "This installer only supports macOS."
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --port)
        shift
        [[ $# -gt 0 ]] || fail "Missing value for --port"
        [[ "$1" == <-> ]] || fail "Port must be a positive integer."
        PORT="$1"
        ;;
      --no-load)
        LOAD_AGENT=0
        ;;
      --uninstall)
        UNINSTALL=1
        ;;
      --help)
        usage
        exit 0
        ;;
      *)
        fail "Unknown option: $1"
        ;;
    esac
    shift
  done
}

render_plist() {
  local template rendered
  template="$(<"$PLIST_TEMPLATE")"
  rendered="${template//__BRIDGE_BIN__/$BRIDGE_BIN}"
  rendered="${rendered//__PORT__/$PORT}"
  rendered="${rendered//__WORKDIR__/$BIN_DIR}"
  rendered="${rendered//__STDOUT_LOG__/$STDOUT_LOG}"
  rendered="${rendered//__STDERR_LOG__/$STDERR_LOG}"
  print -r -- "$rendered"
}

bootstrap_launch_agent() {
  local domain="gui/$(id -u)"

  launchctl bootout "$domain" "$PLIST_PATH" >/dev/null 2>&1 || true
  launchctl bootstrap "$domain" "$PLIST_PATH"
  launchctl kickstart -k "$domain/$LABEL"
}

uninstall_bridge() {
  local domain="gui/$(id -u)"

  print "Removing LaunchAgent and installed bridge files..."
  launchctl bootout "$domain" "$PLIST_PATH" >/dev/null 2>&1 || true
  rm -f "$PLIST_PATH"
  rm -f "$BRIDGE_BIN"
  rmdir "$BIN_DIR" >/dev/null 2>&1 || true
  rmdir "$INSTALL_ROOT" >/dev/null 2>&1 || true
  print "Removed:"
  print "  $PLIST_PATH"
  print "  $BRIDGE_BIN"
}

install_bridge() {
  mkdir -p "$BIN_DIR" "$LOG_DIR" "$PLIST_DIR"

  print "Building release bridge..."
  (
    cd "$PACKAGE_DIR"
    swift build -c release --product ig-poster-companion-bridge
  )

  cp "$PACKAGE_DIR/.build/release/ig-poster-companion-bridge" "$BRIDGE_BIN"
  render_plist > "$PLIST_PATH"
  plutil -lint "$PLIST_PATH" >/dev/null

  print "Installed:"
  print "  binary: $BRIDGE_BIN"
  print "  launch agent: $PLIST_PATH"
  print "  logs: $STDOUT_LOG"

  if [[ "$LOAD_AGENT" -eq 1 ]]; then
    print "Loading LaunchAgent..."
    bootstrap_launch_agent
    print "Bridge is registered with launchd."
    print "Health check:"
    print "  curl http://127.0.0.1:$PORT/v1/health"
  else
    print "LaunchAgent not loaded (--no-load)."
    print "To load it later:"
    print "  launchctl bootstrap gui/$(id -u) $PLIST_PATH"
    print "  launchctl kickstart -k gui/$(id -u)/$LABEL"
  fi
}

main() {
  parse_args "$@"
  require_macos
  require_command swift
  require_command launchctl
  require_command plutil
  [[ -f "$PLIST_TEMPLATE" ]] || fail "Missing LaunchAgent template: $PLIST_TEMPLATE"
  [[ "$PORT" -ge 1 && "$PORT" -le 65535 ]] || fail "Port must be between 1 and 65535."

  if [[ "$UNINSTALL" -eq 1 ]]; then
    uninstall_bridge
    return
  fi

  install_bridge
}

main "$@"
