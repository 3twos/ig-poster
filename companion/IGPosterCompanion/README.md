# IG Poster Companion

This package is the first checked-in macOS scaffold for Apple Photos support.

Current scope:

- shared local bridge contract that mirrors `src/lib/apple-photos-bridge.ts`
- native SwiftUI shell for the future signed `IG Poster Companion.app`
- minimal localhost bridge executable for `GET /v1/health`
- custom-URL handoff parsing so the app can reflect the current web draft/profile context

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
2. add PhotosPicker-based human selection flow
3. add PhotoKit-backed recent/search enumeration
4. expand the localhost bridge beyond `GET /v1/health` into pick/import/recent/search
5. hand imported exports back to the web editor and CLI
