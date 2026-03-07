// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_BRAND, INITIAL_POST, type LocalAsset } from "@/lib/types";

import { useGeneration } from "./use-generation";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const baseAsset: LocalAsset = {
  id: "asset-1",
  name: "hero.png",
  mediaType: "image",
  previewUrl: "blob:hero",
  storageUrl: "https://cdn.example.com/hero.png",
  status: "uploaded",
};

describe("useGeneration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cancels an in-flight run when the selected post changes", async () => {
    const dispatch = vi.fn();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ postId }) =>
        useGeneration({
          postId,
          brand: INITIAL_BRAND,
          post: INITIAL_POST,
          localAssets: [baseAsset],
          localLogo: null,
          promptConfig: { systemPrompt: "", customInstructions: "" },
          dispatch,
        }),
      {
        initialProps: { postId: "post-a" },
      },
    );

    act(() => {
      void result.current.generate();
    });

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(true);
    });

    rerender({ postId: "post-b" });

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false);
      expect(result.current.agentRun).toBeNull();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
