import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/generation", () => ({
  buildRefineRequestFromPost: vi.fn(),
  GenerationServiceError: class GenerationServiceError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/app/api/generate/refine/route", () => ({
  POST: vi.fn(),
}));

import { POST } from "@/app/api/v1/generate/refine/route";
import { POST as refinePost } from "@/app/api/generate/refine/route";
import { resolveActorFromRequest } from "@/services/actors";
import { buildRefineRequestFromPost } from "@/services/generation";

const mockedResolveActorFromRequest = vi.mocked(resolveActorFromRequest);
const mockedBuildRefineRequestFromPost = vi.mocked(buildRefineRequestFromPost);
const mockedRefinePost = vi.mocked(refinePost);

describe("POST /api/v1/generate/refine", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires an authenticated actor", async () => {
    mockedResolveActorFromRequest.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("https://app.example.com/api/v1/generate/refine", {
        method: "POST",
        body: JSON.stringify({ postId: "post-1", instruction: "Make it sharper." }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("builds a refine request from a post id before proxying", async () => {
    mockedResolveActorFromRequest.mockResolvedValueOnce({ ownerHash: "owner" } as never);
    mockedBuildRefineRequestFromPost.mockResolvedValueOnce({
      variant: {
        id: "variant-1",
        name: "Editorial",
        postType: "single-image",
        hook: "Credibility is earned in public.",
        headline: "Proof beats promises",
        supportingText: "Show the work, tighten the claim, and make the benefit concrete.",
        cta: "See the system",
        caption: "Use public proof to turn positioning into belief and action for buyers.",
        hashtags: ["#Growth", "#Brand", "#Trust", "#Startups", "#Marketing"],
        layout: "magazine",
        textAlign: "center",
        colorHexes: ["#0F172A", "#F97316"],
        overlayStrength: 0.45,
        assetSequence: ["asset-1"],
      },
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
    } as never);
    mockedRefinePost.mockResolvedValueOnce(
      Response.json({
        source: "model",
        variant: { id: "variant-1", name: "Editorial" },
      }) as never,
    );

    const response = await POST(
      new Request("https://app.example.com/api/v1/generate/refine", {
        method: "POST",
        body: JSON.stringify({ postId: "post-1", instruction: "Make it sharper." }),
      }),
    );

    expect(mockedBuildRefineRequestFromPost).toHaveBeenCalledWith({
      actor: { ownerHash: "owner" },
      postId: "post-1",
      variantId: undefined,
    });
    await expect(response.json()).resolves.toMatchObject({
      source: "model",
      variant: { id: "variant-1" },
    });
  });
});
