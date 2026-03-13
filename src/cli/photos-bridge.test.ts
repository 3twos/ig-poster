import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApplePhotosBridgeRequestError,
  openApplePhotosCompanion,
} from "@/cli/photos-bridge";

describe("openApplePhotosCompanion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("times out instead of hanging forever when the local bridge stops responding", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }),
    );

    const pending = expect(
      openApplePhotosCompanion({ timeoutMs: 5 }),
    ).rejects.toEqual(
      new ApplePhotosBridgeRequestError(
        "The local Apple Photos bridge did not respond before the companion-open request timed out.",
        408,
        "MACOS_BRIDGE_UNAVAILABLE",
      ),
    );
    await vi.advanceTimersByTimeAsync(5);
    await pending;
  });
});
