# IG Poster Companion

This package is the first checked-in macOS scaffold for Apple Photos support.

Current scope:

- shared local bridge contract that mirrors `src/lib/apple-photos-bridge.ts`
- native SwiftUI shell for the future signed `IG Poster Companion.app`
- native PhotosPicker flow for ordered image/video selection
- managed local export cache for selected Photos assets
- localhost bridge executable for `GET /v1/health`, `POST /v1/photos/pick`, and `POST /v1/photos/import`
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

Planned next steps:

1. register and package the macOS app so browser handoff can launch it directly
2. harden the localhost bridge and browser handoff UX for packaged installs
3. add PhotoKit-backed recent/search enumeration
4. expand the localhost bridge into richer recent/search flows for CLI + MCP
5. hand imported exports back to the CLI/MCP surface with the same manifest contract
