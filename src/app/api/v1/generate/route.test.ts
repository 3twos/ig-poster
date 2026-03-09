import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/generation", () => ({
  buildGenerationRequestFromPost: vi.fn(),
  GenerationServiceError: class GenerationServiceError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/app/api/generate/route", () => ({
  POST: vi.fn(),
}));

import { POST } from "@/app/api/v1/generate/route";
import { POST as generatePost } from "@/app/api/generate/route";
import { resolveActorFromRequest } from "@/services/actors";
import { buildGenerationRequestFromPost } from "@/services/generation";

const mockedResolveActorFromRequest = vi.mocked(resolveActorFromRequest);
const mockedBuildGenerationRequestFromPost = vi.mocked(
  buildGenerationRequestFromPost,
);
const mockedGeneratePost = vi.mocked(generatePost);

describe("POST /api/v1/generate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires an authenticated actor", async () => {
    mockedResolveActorFromRequest.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("https://app.example.com/api/v1/generate", {
        method: "POST",
        body: JSON.stringify({ postId: "post-1" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("builds a generation request from a post id before proxying", async () => {
    mockedResolveActorFromRequest.mockResolvedValueOnce({ ownerHash: "owner" } as never);
    mockedBuildGenerationRequestFromPost.mockResolvedValueOnce({
      brand: {
        brandName: "Nexa Labs",
        website: "",
        values: "Measured growth and clear proof points.",
        principles: "Show the evidence and stay useful.",
        story: "We help growth teams turn strategy into repeatable execution.",
        voice: "Direct, confident, and clear.",
        visualDirection: "Bold editorial layouts and premium contrast.",
        palette: "#0F172A, #F97316, #F8FAFC",
        logoNotes: "",
      },
      post: {
        theme: "Category authority",
        subject: "Designing trust",
        thought: "Trust compounds through repeated proof moments.",
        objective: "Drive profile visits",
        audience: "Startup founders",
        mood: "Premium",
        aspectRatio: "4:5",
      },
      assets: [
        {
          id: "asset-1",
          name: "hero.jpg",
          mediaType: "image",
        },
      ],
      hasLogo: false,
      promptConfig: {
        systemPrompt: "",
        customInstructions: "",
      },
    } as never);
    mockedGeneratePost.mockResolvedValueOnce(
      new Response("data: {\"type\":\"run-start\",\"runId\":\"run-1\",\"label\":\"Generate\"}\n\n", {
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const response = await POST(
      new Request("https://app.example.com/api/v1/generate", {
        method: "POST",
        body: JSON.stringify({ postId: "post-1" }),
      }),
    );

    expect(mockedBuildGenerationRequestFromPost).toHaveBeenCalledWith(
      { ownerHash: "owner" },
      "post-1",
    );
    expect(mockedGeneratePost).toHaveBeenCalledTimes(1);
    await expect(response.text()).resolves.toContain("\"run-start\"");
  });
});
