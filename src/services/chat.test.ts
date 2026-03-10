import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/posts", () => ({
  getPost: vi.fn(),
}));

vi.mock("@/lib/blob-store", () => ({
  readJsonByPath: vi.fn(),
}));

vi.mock("@/lib/llm-auth", () => ({
  resolveAllLlmAuthFromRequest: vi.fn(),
}));

vi.mock("@/lib/chat-stream", () => ({
  streamChatCompletion: vi.fn(),
  toChatSseEvent: (event: unknown) => `data: ${JSON.stringify(event)}\n\n`,
}));

import { readJsonByPath } from "@/lib/blob-store";
import { resolveAllLlmAuthFromRequest } from "@/lib/llm-auth";
import { streamChatCompletion } from "@/lib/chat-stream";
import { startChatStream } from "@/services/chat";
import { getPost } from "@/services/posts";

const mockedGetPost = vi.mocked(getPost);
const mockedReadJsonByPath = vi.mocked(readJsonByPath);
const mockedResolveAllLlmAuthFromRequest = vi.mocked(
  resolveAllLlmAuthFromRequest,
);
const mockedStreamChatCompletion = vi.mocked(streamChatCompletion);

describe("startChatStream", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("injects linked-post context into the system prompt", async () => {
    mockedResolveAllLlmAuthFromRequest.mockResolvedValueOnce({
      mode: "fallback",
      connections: [
        {
          id: "env-openai",
          source: "env",
          provider: "openai",
          model: "gpt-5",
          apiKey: "test-key",
        },
      ],
    });
    mockedReadJsonByPath.mockResolvedValueOnce({
      brand: { brandName: "Acme" },
      promptConfig: { customInstructions: "Keep it practical." },
    });
    mockedGetPost.mockResolvedValueOnce({
      id: "post-1",
      title: "Launch Week",
      status: "draft",
      brand: { brandName: "Acme" },
      brief: {
        theme: "Launch momentum",
        subject: "New feature release",
        objective: "Drive profile visits",
        audience: "SaaS operators",
      },
      activeVariantId: "variant-2",
      result: {
        strategy:
          "Frame the launch around operational clarity and the time saved after rollout.",
        variants: [
          {
            id: "variant-1",
            name: "Proof",
            postType: "single-image",
            hook: "Launch faster with fewer handoffs.",
            headline: "Cut review loops",
            supportingText: "Move the decision closer to the work.",
            cta: "Save this framework",
            caption:
              "A cleaner launch workflow compounds when the team sees the next decision before the next review loop appears.",
            hashtags: [
              "#Launch",
              "#SaaS",
              "#Operations",
              "#MarketingOps",
              "#ProductLaunch",
            ],
            layout: "hero-quote",
            textAlign: "left",
            colorHexes: ["#111111", "#ffffff"],
            overlayStrength: 0.4,
            assetSequence: ["asset-1"],
          },
          {
            id: "variant-2",
            name: "Editorial",
            postType: "single-image",
            hook: "Operational clarity beats launch chaos.",
            headline: "Ship with confidence",
            supportingText: "Sequence the rollout around proof.",
            cta: "Use this plan",
            caption:
              "Confidence comes from sequencing the rollout around proof, ownership, and the next action the audience can see.",
            hashtags: [
              "#Launch",
              "#SaaS",
              "#Operations",
              "#DemandGen",
              "#B2BMarketing",
            ],
            layout: "magazine",
            textAlign: "center",
            colorHexes: ["#111111", "#ffffff"],
            overlayStrength: 0.45,
            assetSequence: ["asset-1"],
          },
          {
            id: "variant-3",
            name: "Minimal",
            postType: "single-image",
            hook: "Clear launches win trust.",
            headline: "Trust the sequence",
            supportingText: "Lead with the proof.",
            cta: "Try the checklist",
            caption:
              "The launch story should feel inevitable because every proof point arrives before the next claim asks for trust.",
            hashtags: [
              "#Launch",
              "#SaaS",
              "#Operations",
              "#StartupMarketing",
              "#Growth",
            ],
            layout: "minimal-logo",
            textAlign: "center",
            colorHexes: ["#111111", "#ffffff"],
            overlayStrength: 0.4,
            assetSequence: ["asset-1"],
          },
        ],
      },
      publishSettings: {
        caption: "Draft caption to review",
      },
      assets: [{ id: "asset-1" }],
      promptConfig: { customInstructions: "Prefer specific proof points." },
    } as never);
    mockedStreamChatCompletion.mockImplementationOnce(async (options) => {
      options.onToken("Use the launch proof as the lead.");
      options.onDone(42);
    });

    const response = await startChatStream({
      actor: {
        ownerHash: "owner-hash",
        email: "person@example.com",
      } as never,
      input: {
        message: "Rewrite this caption with a stronger hook.",
        postId: "post-1",
      },
      req: new Request("https://app.example.com/api/v1/chat", {
        method: "POST",
      }),
    });

    await expect(response.text()).resolves.toContain(
      "Use the launch proof as the lead.",
    );
    expect(mockedStreamChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: "Rewrite this caption with a stronger hook.",
          },
        ],
        systemPrompt: expect.stringContaining("## Linked Post Context"),
      }),
    );
    expect(mockedStreamChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("Variant Name: Editorial"),
      }),
    );
  });

  it("rejects missing llm connections", async () => {
    mockedResolveAllLlmAuthFromRequest.mockResolvedValueOnce({
      mode: "fallback",
      connections: [],
    });

    await expect(
      startChatStream({
        actor: {
          ownerHash: "owner-hash",
          email: "person@example.com",
        } as never,
        input: {
          message: "Help me rewrite this.",
        },
        req: new Request("https://app.example.com/api/v1/chat", {
          method: "POST",
        }),
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: "No LLM provider connected. Connect one in Settings.",
    });
  });
});
