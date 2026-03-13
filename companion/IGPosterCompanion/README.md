# IG Poster Companion

This package is the first checked-in macOS scaffold for Apple Photos support.

Current scope:

- shared local bridge contract that mirrors `src/lib/apple-photos-bridge.ts`
- native SwiftUI shell for the future signed `IG Poster Companion.app`
- no PhotosPicker, PhotoKit, or HTTP bridge listener yet

Local validation:

```bash
cd companion/IGPosterCompanion
swift build
swift run ig-poster-companion-contract-smoke
swift run ig-poster-companion-bridge --print-health
swift run ig-poster-companion
```

Planned next steps:

1. add PhotosPicker-based human selection flow
2. add PhotoKit-backed recent/search enumeration
3. expand the localhost bridge beyond `GET /v1/health` into pick/import/recent/search
4. hand imported exports back to the web editor and CLI
