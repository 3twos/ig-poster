# IG Poster Companion

This package is the first checked-in macOS scaffold for Apple Photos support.

Current scope:

- shared local bridge contract that mirrors `src/lib/apple-photos-bridge.ts`
- native SwiftUI shell for the future signed `IG Poster Companion.app`
- native PhotosPicker flow for ordered image/video selection
- PhotoKit-backed recent/search enumeration for local CLI + MCP workflows
- managed local export cache for selected Photos assets
- localhost bridge executable for `GET /v1/health`, `GET /v1/photos/recent`, `GET /v1/photos/search`, `POST /v1/photos/pick`, `POST /v1/photos/import`, and `POST /v1/companion/open`
- custom-URL handoff parsing so the app can reflect the current web draft/profile context, including startup-argument handoff when the bridge opens the app bundle directly
- shared local selection-state persistence so the app and bridge can report the active picker context and exported asset manifest

Local validation:

```bash
cd companion/IGPosterCompanion
swift build
swift run ig-poster-companion-contract-smoke
swift run ig-poster-companion-bridge --print-health
swift run ig-poster-companion
```

Local install helper:

```bash
../../scripts/install-companion-bridge.zsh
```

That script builds the release bridge binary and companion app bundle, installs
the bridge into `~/Library/Application Support/IGPosterCompanion/bin`,
installs `IG Poster Companion.app` into `~/Applications`, writes
`~/Library/LaunchAgents/com.3twos.igposter.bridge.plist`, and loads the
LaunchAgent so the web app and CLI can probe `http://127.0.0.1:43123/v1/health`
without a separate `swift run` terminal. If you install with `--port <n>`, the
bridge keeps serving the default browser-compatible port `43123` as well as the
requested custom port. Use `--no-load` to install without starting the bridge,
`--no-register-app` to skip Launch Services registration, or `--uninstall` to
remove the LaunchAgent, app bundle, and installed binary.

Planned next steps:

1. harden the localhost bridge and browser handoff UX for signed/bottled installs
2. expand the localhost bridge into richer import/propose flows for CLI + MCP
3. hand imported exports back to the CLI/MCP surface with the same manifest contract
4. add bridge auth for packaged distribution and tighter browser/CLI trust checks
