import { describe, expect, it } from "vitest";

import {
  getApplePhotosFallbackInfo,
  isMacOsUserAgent,
} from "@/lib/apple-photos";

describe("isMacOsUserAgent", () => {
  it("detects macOS desktop browsers", () => {
    expect(
      isMacOsUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15",
      ),
    ).toBe(true);
  });

  it("does not treat non-macOS platforms as supported", () => {
    expect(
      isMacOsUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ),
    ).toBe(false);
  });

  it("does not treat iPhone Safari as macOS", () => {
    expect(
      isMacOsUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
  });
});

describe("getApplePhotosFallbackInfo", () => {
  it("returns a companion-required fallback on macOS", () => {
    expect(
      getApplePhotosFallbackInfo(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15",
      ),
    ).toMatchObject({
      code: "MACOS_COMPANION_REQUIRED",
      actionLabel: "Use regular upload",
    });
  });

  it("returns an unsupported-platform fallback elsewhere", () => {
    expect(
      getApplePhotosFallbackInfo(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      ),
    ).toMatchObject({
      code: "UNSUPPORTED_PLATFORM",
      actionLabel: "Use regular upload",
    });
  });
});
