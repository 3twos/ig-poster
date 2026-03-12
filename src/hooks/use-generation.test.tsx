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
    let aborted = false;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          },
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

    let runPromise!: Promise<void>;
    act(() => {
      runPromise = result.current.generate();
    });

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(true);
    });

    rerender({ postId: "post-b" });

    await act(async () => {
      await runPromise;
    });

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false);
      expect(result.current.agentRun).toBeNull();
    });

    expect(aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("stores prompt preview events for completed runs", async () => {
    const dispatch = vi.fn();
    const encoder = new TextEncoder();
    const payload = [
      {
        type: "run-start",
        runId: "run-1",
        label: "Generate SOTA Concepts",
      },
      {
        type: "prompt-preview",
        title: "Generation prompt (OPENAI gpt-test)",
        systemPrompt: "system prompt body",
        userPrompt: "user prompt body",
      },
      {
        type: "run-complete",
        result: {
          strategy: "Use one clean concept with enough detail to satisfy the schema.",
          variants: [
            {
              id: "variant-1",
              name: "Authority Angle",
              postType: "single-image",
              hook: "Hook with enough detail",
              headline: "Headline with enough detail",
              supportingText:
                "Supporting text with enough detail to satisfy the creative schema and render cleanly.",
              cta: "",
              caption:
                "Caption with enough detail to satisfy the schema and represent a realistic generation result.",
              hashtags: [
                "#BrandPlaybook",
                "#InstagramGrowth",
                "#CreativeStrategy",
                "#ContentDesign",
                "#SocialMediaTips",
              ],
              layout: "hero-quote",
              textAlign: "left",
              colorHexes: ["#0F172A", "#F97316"],
              overlayStrength: 0.42,
              assetSequence: ["asset-1"],
            },
          ],
        },
        summary: "Generated 3 concept variants successfully.",
        fallbackUsed: false,
      },
    ]
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join("");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(payload));
              controller.close();
            },
          }),
          {
            headers: {
              "content-type": "text/event-stream",
            },
          },
        ),
      ),
    );

    const { result } = renderHook(() =>
      useGeneration({
        postId: "post-a",
        brand: INITIAL_BRAND,
        post: INITIAL_POST,
        localAssets: [baseAsset],
        localLogo: null,
        promptConfig: { systemPrompt: "", customInstructions: "" },
        dispatch,
      }),
    );

    await act(async () => {
      await result.current.generate();
    });

    await waitFor(() => {
      expect(result.current.agentRun?.status).toBe("success");
      expect(result.current.agentRun?.promptSnapshots).toHaveLength(1);
      expect(result.current.agentRun?.promptSnapshots[0]?.systemPrompt).toBe(
        "system prompt body",
      );
    });
  });
});
