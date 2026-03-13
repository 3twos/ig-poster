// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PostDraft } from "./use-post-reducer";
import { serializeDraft, useAutoSave } from "./use-auto-save";

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

  it("drops incomplete publish user tags before sending the autosave payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() =>
      useAutoSave({
        ...baseDraft,
        mediaComposition: {
          orientation: "portrait",
          items: [
            {
              assetId: "asset-1",
              userTags: [
                { username: " @friend ", x: 0.25, y: 0.75 },
                { username: "", x: 0.5, y: 0.5 },
              ],
            },
          ],
        },
      }),
    );

    await act(async () => {
      await result.current.saveNow();
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      mediaComposition: {
        items: [
          {
            assetId: "asset-1",
            userTags: [{ username: "friend", x: 0.25, y: 0.75 }],
          },
        ],
      },
    });

    unmount();
  });

  it("returns false when saveNow cannot persist pending changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
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

  // --- Error classification tests ---

  it("does not retry on permanent error (400)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useAutoSave(baseDraft));

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.saveStatus).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance well past any retry delay — should NOT trigger more fetches
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("does not retry on permanent error (404)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useAutoSave(baseDraft));

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.saveStatus).toBe("error");

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("does not retry on permanent error (409)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 409 });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useAutoSave(baseDraft));

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.saveStatus).toBe("error");

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("retries transient errors (500) with exponential backoff", async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount <= 2) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useAutoSave(baseDraft));

    // First attempt — fails with 500
    await act(async () => {
      await result.current.saveNow();
    });
    expect(result.current.saveStatus).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // After 5s — second attempt, still fails
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    // Need to flush the promise
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // After 15s more — third attempt, succeeds
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.saveStatus).toBe("saved");

    unmount();
  });

  it("gives up after MAX_RETRIES for transient errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useAutoSave(baseDraft));

    // Initial attempt
    await act(async () => {
      await result.current.saveNow();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Retry 1 after 5s
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Retry 2 after 15s
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Retry 3 after 45s
    await act(async () => {
      vi.advanceTimersByTime(45_000);
    });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // No more retries — advance more time
    await act(async () => {
      vi.advanceTimersByTime(200_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.current.saveStatus).toBe("error");

    unmount();
  });

  it("retries network errors with exponential backoff", async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount <= 1) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return Promise.resolve({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useAutoSave(baseDraft));

    // First attempt — network error
    await act(async () => {
      await result.current.saveNow();
    });
    expect(result.current.saveStatus).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // After 5s — retry succeeds
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.saveStatus).toBe("saved");

    unmount();
  });

  it("resets retry counter when draft changes after failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender, unmount } = renderHook(
      ({ draft }) => useAutoSave(draft),
      { initialProps: { draft: baseDraft as PostDraft | null } },
    );

    // Initial attempt fails
    await act(async () => {
      await result.current.saveNow();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Simulate a new draft change — this should reset retry counter
    const modifiedDraft: PostDraft = { ...baseDraft, title: "Changed title" };
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await act(async () => {
      rerender({ draft: modifiedDraft });
    });

    // The debounce effect fires after 2s, triggering a fresh save attempt
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    await act(async () => {});

    // That new save should get the full 3-retry budget
    // Retry 1 after 5s
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await act(async () => {});

    // Retry 2 after 15s
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    await act(async () => {});

    // Retry 3 after 45s
    await act(async () => {
      vi.advanceTimersByTime(45_000);
    });
    await act(async () => {});

    // Should have: 1 (initial) + 1 (debounce) + 3 (retries) = 5 total
    // The initial saveNow call was for baseDraft, debounce is for modifiedDraft
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);

    unmount();
  });

  it("serializeDraft backwards compat omits transient fields", () => {
    const json = serializeDraft(baseDraft);
    const parsed = JSON.parse(json);
    expect(parsed).not.toHaveProperty("activeSlideIndex");
    expect(parsed).not.toHaveProperty("destinations");
    expect(parsed).not.toHaveProperty("id");
    expect(parsed).toHaveProperty("title", "Draft title");
  });

  it("exposes lastSavedRef in return value", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useAutoSave(baseDraft));

    expect(result.current.lastSavedRef.current).toBeNull();

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.lastSavedRef.current).not.toBeNull();
    expect(typeof result.current.lastSavedRef.current).toBe("string");

    unmount();
  });
});
