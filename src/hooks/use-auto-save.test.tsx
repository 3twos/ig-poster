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
    expect(JSON.parse(String(requestInit.body))).not.toHaveProperty("activeSlideIndex");

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
});
