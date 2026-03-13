# IG Poster Companion

This package is the first checked-in macOS scaffold for Apple Photos support.

Current scope:

- shared local bridge contract that mirrors `src/lib/apple-photos-bridge.ts`
- native SwiftUI shell for the future signed `IG Poster Companion.app`
- native PhotosPicker flow for ordered image/video selection
- PhotoKit-backed recent/search enumeration for local CLI + MCP workflows
- managed local export cache for selected Photos assets
- localhost bridge executable for `GET /v1/health`, `GET /v1/photos/recent`, `GET /v1/photos/search`, `POST /v1/photos/pick`, and `POST /v1/photos/import`
- custom-URL handoff parsing so the app can reflect the current web draft/profile context
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

That script builds the release bridge binary, installs it into
`~/Library/Application Support/IGPosterCompanion/bin`, writes
`~/Library/LaunchAgents/com.3twos.igposter.bridge.plist`, and loads the
LaunchAgent so the web app and CLI can probe `http://127.0.0.1:43123/v1/health`
without a separate `swift run` terminal. Use `--no-load` to install without
starting it, or `--uninstall` to remove the LaunchAgent and installed binary.

Planned next steps:

1. register and package the macOS app so browser handoff can launch it directly
2. harden the localhost bridge and browser handoff UX for packaged installs
3. expand the localhost bridge into richer import/propose flows for CLI + MCP
4. hand imported exports back to the CLI/MCP surface with the same manifest contract
5. add bridge auth and packaged-install detection for the web and CLI entry points
