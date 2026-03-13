// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PostDraft } from "./use-post-reducer";
import { useAutoSave } from "./use-auto-save";

const baseDraft: PostDraft = {
  id: "post-1",
  title: "Draft title",
  status: "draft",
  archivedAt: null,
  brand: { brandName: "Example Brand" },
  brief: { subject: "Launch post", theme: "Product launch" },
  assets: [],
  logoUrl: null,
  brandKitId: null,
  promptConfig: { systemPrompt: "", customInstructions: "" },
  result: null,
  activeVariantId: null,
  overlayLayouts: {},
  mediaComposition: { orientation: "portrait", items: [] },
  publishSettings: {
    caption: "",
    firstComment: "",
    locationId: "",
    reelShareToFeed: true,
  },
  renderedPosterUrl: null,
  shareUrl: null,
  shareProjectId: null,
  publishHistory: [],
  destinations: [],
  activeSlideIndex: 2,
};

describe("useAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns true when saveNow persists pending changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useAutoSave(baseDraft));

    let didSave = false;
    await act(async () => {
      didSave = await result.current.saveNow();
    });

    expect(didSave).toBe(true);
    expect(result.current.saveStatus).toBe("saved");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/posts/post-1",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(String(requestInit.body));
    expect(parsed).not.toHaveProperty("activeSlideIndex");
    expect(parsed).not.toHaveProperty("destinations");

    unmount();
  });

  it("returns false when saveNow cannot persist pending changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useAutoSave(baseDraft));

    let didSave = true;
    await act(async () => {
      didSave = await result.current.saveNow();
    });

    expect(didSave).toBe(false);
    expect(result.current.saveStatus).toBe("error");

    unmount();
  });

  it("returns true without refetching when the draft is already saved", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useAutoSave(baseDraft));

    let firstSave = false;
    let secondSave = false;
    await act(async () => {
      firstSave = await result.current.saveNow();
      secondSave = await result.current.saveNow();
    });

    expect(firstSave).toBe(true);
    expect(secondSave).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("treats an aborted save as non-failure when a newer save supersedes it", async () => {
    let requestCount = 0;
    let resolveLatestRequest: ((value: { ok: boolean }) => void) | null = null;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestCount += 1;
      return new Promise<{ ok: boolean }>((resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );

        if (requestCount === 2) {
          resolveLatestRequest = resolve;
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useAutoSave(baseDraft));

    let firstSave!: Promise<boolean>;
    let secondSave!: Promise<boolean>;
    await act(async () => {
      firstSave = result.current.saveNow();
      secondSave = result.current.saveNow();
      resolveLatestRequest?.({ ok: true });
    });

    await expect(firstSave).resolves.toBe(true);
    await expect(secondSave).resolves.toBe(true);
    expect(result.current.saveStatus).toBe("saved");

    unmount();
  });
});
