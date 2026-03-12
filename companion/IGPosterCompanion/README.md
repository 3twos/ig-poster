# IG Poster Companion

This package is the first checked-in macOS scaffold for Apple Photos support.

Current scope:

- shared local bridge contract that mirrors `/Users/jestrada/dev/ig-poster-photos-companion-20260312/src/lib/apple-photos-bridge.ts`
- native SwiftUI shell for the future signed `IG Poster Companion.app`
- no PhotosPicker, PhotoKit, or HTTP bridge listener yet

Local validation:

```bash
cd companion/IGPosterCompanion
swift build
swift run ig-poster-companion-contract-smoke
swift run ig-poster-companion
```

Planned next steps:

1. add PhotosPicker-based human selection flow
2. add PhotoKit-backed recent/search enumeration
3. add the localhost bridge listener and token handshake
4. hand imported exports back to the web editor and CLI
