#!/usr/bin/env zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGE_DIR="$REPO_ROOT/companion/IGPosterCompanion"
PLIST_TEMPLATE="$PACKAGE_DIR/support/com.3twos.igposter.bridge.plist.template"
APP_INFO_TEMPLATE="$PACKAGE_DIR/support/IGPosterCompanion.Info.plist"

LABEL="com.3twos.igposter.bridge"
DEFAULT_PORT="${IG_POSTER_BRIDGE_PORT:-43123}"
BROWSER_DEFAULT_PORT="43123"
INSTALL_ROOT="${IG_POSTER_COMPANION_HOME:-$HOME/Library/Application Support/IGPosterCompanion}"
BIN_DIR="$INSTALL_ROOT/bin"
BRIDGE_BIN="$BIN_DIR/ig-poster-companion-bridge"
APP_INSTALL_DIR="${IG_POSTER_COMPANION_APPS_DIR:-$HOME/Applications}"
APP_BUNDLE="$APP_INSTALL_DIR/IG Poster Companion.app"
APP_CONTENTS_DIR="$APP_BUNDLE/Contents"
APP_MACOS_DIR="$APP_CONTENTS_DIR/MacOS"
APP_EXECUTABLE="$APP_MACOS_DIR/ig-poster-companion"
APP_INFO_PLIST="$APP_CONTENTS_DIR/Info.plist"
LOG_DIR="$HOME/Library/Logs/IGPosterCompanion"
STDOUT_LOG="$LOG_DIR/bridge.out.log"
STDERR_LOG="$LOG_DIR/bridge.err.log"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
LSREGISTER_BIN="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

PORT="$DEFAULT_PORT"
LOAD_AGENT=1
REGISTER_APP=1
UNINSTALL=0

usage() {
  cat <<EOF
Usage: ./scripts/install-companion-bridge.zsh [options]

Build the macOS Apple Photos bridge and companion app, install them into your
user Library/Application folders, and optionally register the LaunchAgent and
native app launch metadata.

Options:
  --port <n>          Primary bridge port to install into the LaunchAgent (default: $DEFAULT_PORT)
  --no-load           Install files but do not load/restart the LaunchAgent
  --no-register-app   Install the companion app bundle without Launch Services registration
  --uninstall         Remove the installed bridge binary, app bundle, and LaunchAgent
  --help              Show this help text

Installed files:
  Bridge binary: $BRIDGE_BIN
  Companion app: $APP_BUNDLE
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

is_integer() {
  [[ "$1" == <-> ]]
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --port)
        shift
        [[ $# -gt 0 ]] || fail "Missing value for --port"
        is_integer "$1" || fail "Port must be a positive integer."
        PORT="$1"
        ;;
      --no-load)
        LOAD_AGENT=0
        ;;
      --no-register-app)
        REGISTER_APP=0
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

register_companion_app() {
  if [[ "$REGISTER_APP" -ne 1 ]]; then
    return 0
  fi

  if [[ ! -x "$LSREGISTER_BIN" ]]; then
    print "Skipping Launch Services registration because lsregister is unavailable."
    return
  fi

  "$LSREGISTER_BIN" -f "$APP_BUNDLE" >/dev/null
}

uninstall_bridge() {
  local domain="gui/$(id -u)"

  print "Removing LaunchAgent and installed companion files..."
  launchctl bootout "$domain" "$PLIST_PATH" >/dev/null 2>&1 || true
  rm -f "$PLIST_PATH"
  rm -f "$BRIDGE_BIN"
  rm -rf "$APP_BUNDLE"
  rmdir "$BIN_DIR" >/dev/null 2>&1 || true
  rmdir "$INSTALL_ROOT" >/dev/null 2>&1 || true
  rmdir "$APP_INSTALL_DIR" >/dev/null 2>&1 || true
  print "Removed:"
  print "  $PLIST_PATH"
  print "  $BRIDGE_BIN"
  print "  $APP_BUNDLE"
}

install_bridge() {
  local build_bin_dir
  local bin_path_file

  mkdir -p "$BIN_DIR" "$LOG_DIR" "$PLIST_DIR" "$APP_INSTALL_DIR"
  bin_path_file="$(mktemp "${TMPDIR:-/tmp}/ig-poster-companion-bin-path.XXXXXX")"

  print "Building release bridge and companion app..."
  {
    (
      cd "$PACKAGE_DIR"
      swift build -c release --product ig-poster-companion-bridge
      swift build -c release --product ig-poster-companion
      swift build -c release --show-bin-path > "$bin_path_file"
    )

    build_bin_dir="$(<"$bin_path_file")"
  } always {
    rm -f "$bin_path_file"
  }

  cp "$build_bin_dir/ig-poster-companion-bridge" "$BRIDGE_BIN"
  chmod +x "$BRIDGE_BIN"
  rm -rf "$APP_BUNDLE"
  mkdir -p "$APP_MACOS_DIR"
  cp "$build_bin_dir/ig-poster-companion" "$APP_EXECUTABLE"
  chmod +x "$APP_EXECUTABLE"
  cp "$APP_INFO_TEMPLATE" "$APP_INFO_PLIST"
  render_plist > "$PLIST_PATH"
  plutil -lint "$APP_INFO_PLIST" >/dev/null
  plutil -lint "$PLIST_PATH" >/dev/null
  register_companion_app

  print "Installed:"
  print "  bridge binary: $BRIDGE_BIN"
  print "  companion app: $APP_BUNDLE"
  print "  launch agent: $PLIST_PATH"
  print "  logs: $STDOUT_LOG"
  if [[ "$REGISTER_APP" -eq 1 ]]; then
    print "  launch services: registered"
  else
    print "  launch services: skipped (--no-register-app)"
  fi

  if [[ "$LOAD_AGENT" -eq 1 ]]; then
    print "Loading LaunchAgent..."
    bootstrap_launch_agent
    print "Bridge is registered with launchd."
    print "Health check:"
    print "  curl http://127.0.0.1:$PORT/v1/health"
    if [[ "$PORT" != "$BROWSER_DEFAULT_PORT" ]]; then
      print "Browser-compatible default port alias:"
      print "  curl http://127.0.0.1:$BROWSER_DEFAULT_PORT/v1/health"
    fi
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
  [[ -f "$APP_INFO_TEMPLATE" ]] || fail "Missing companion app Info.plist: $APP_INFO_TEMPLATE"
  [[ -f "$PLIST_TEMPLATE" ]] || fail "Missing LaunchAgent template: $PLIST_TEMPLATE"
  is_integer "$PORT" || fail "Port must be a positive integer."
  [[ "$PORT" -ge 1 && "$PORT" -le 65535 ]] || fail "Port must be between 1 and 65535."

  if [[ "$UNINSTALL" -eq 1 ]]; then
    uninstall_bridge
    return
  fi

  install_bridge
}

main "$@"
