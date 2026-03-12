import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/posts", () => ({
  getPost: vi.fn(),
}));

import {
  buildGenerationRequestFromPost,
  buildRefineRequestFromPost,
} from "@/services/generation";
import { getPost } from "@/services/posts";

const mockedGetPost = vi.mocked(getPost);

const actor = {
  ownerHash: "owner-hash",
} as never;

describe("generation services", () => {
  it("builds a generation request from a saved post", async () => {
    mockedGetPost.mockResolvedValueOnce({
      id: "post-1",
      logoUrl: "https://cdn.example.com/logo.png",
      brand: {
        brandName: "Nexa Labs",
        website: "https://nexa.example.com",
        values: "Measured growth and clear proof points.",
        principles: "Show the evidence and stay useful.",
        story: "We help growth teams turn strategy into repeatable execution.",
        voice: "Direct, confident, and clear.",
        visualDirection: "Bold editorial layouts and premium contrast.",
        palette: "#0F172A, #F97316, #F8FAFC",
        logoNotes: "Keep the logo subtle.",
      },
      brief: {
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
          url: "https://cdn.example.com/hero.jpg",
        },
      ],
      promptConfig: {
        systemPrompt: "Stay sharp.",
        customInstructions: "Keep it editorial.",
      },
    } as never);

    await expect(
      buildGenerationRequestFromPost(actor, "post-1"),
    ).resolves.toMatchObject({
      hasLogo: true,
      assets: [{ id: "asset-1", name: "hero.jpg", mediaType: "image" }],
      promptConfig: {
        systemPrompt: "Stay sharp.",
        customInstructions: "Keep it editorial.",
      },
    });
  });

  it("rejects incomplete posts for generation", async () => {
    mockedGetPost.mockResolvedValueOnce({
      id: "post-1",
      logoUrl: null,
      brand: {},
      brief: {},
      assets: [],
      promptConfig: null,
    } as never);

    await expect(
      buildGenerationRequestFromPost(actor, "post-1"),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("Post is missing a complete generation brief"),
    });
  });

  it("uses the active variant when building a refine request", async () => {
    mockedGetPost.mockResolvedValueOnce({
      id: "post-1",
      activeVariantId: "variant-b",
      brand: {
        brandName: "Nexa Labs",
        website: "https://nexa.example.com",
        values: "Measured growth and clear proof points.",
        principles: "Show the evidence and stay useful.",
        story: "We help growth teams turn strategy into repeatable execution.",
        voice: "Direct, confident, and clear.",
        visualDirection: "Bold editorial layouts and premium contrast.",
        palette: "#0F172A, #F97316, #F8FAFC",
        logoNotes: "Keep the logo subtle.",
      },
      result: {
        strategy: "Lead with one bold claim and back it with proof.",
        variants: [
          {
            id: "variant-a",
            name: "Hero",
            postType: "single-image",
            hook: "Stop the scroll with proof.",
            headline: "Design trust with proof",
            supportingText: "Each proof moment compounds into credibility over time.",
            cta: "Save this framework",
            caption: "Trust compounds through repeated proof moments and clear delivery.",
            hashtags: ["#Growth", "#Design", "#Trust", "#Startups", "#Strategy"],
            layout: "hero-quote",
            textAlign: "left",
            colorHexes: ["#0F172A", "#F97316"],
            overlayStrength: 0.5,
            assetSequence: ["asset-1"],
          },
          {
            id: "variant-b",
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
          {
            id: "variant-c",
            name: "Minimal",
            postType: "single-image",
            hook: "Proof should feel inevitable in public.",
            headline: "Show the work, win trust",
            supportingText: "Make the benefit explicit, tighten the framing, and keep the proof concrete for the audience.",
            cta: "Build the next post",
            caption: "Public proof turns positioning into belief when the sequence is clear, specific, and grounded in delivery.",
            hashtags: ["#Growth", "#Brand", "#Trust", "#Startups", "#Creative"],
            layout: "minimal-logo",
            textAlign: "center",
            colorHexes: ["#0F172A", "#F97316"],
            overlayStrength: 0.4,
            assetSequence: ["asset-1"],
          },
        ],
      },
      brief: {
        theme: "Category authority",
        subject: "Designing trust",
        thought: "Trust compounds through repeated proof moments.",
        objective: "Drive profile visits",
        audience: "Startup founders",
        mood: "Premium",
        aspectRatio: "4:5",
      },
      promptConfig: {
        systemPrompt: "Stay sharp.",
        customInstructions: "Keep it editorial.",
      },
      overlayLayouts: {
        "variant-b": {
          hook: { x: 6, y: 60, width: 56, height: 7, fontScale: 1, visible: true, text: "" },
          headline: { x: 6, y: 67, width: 58, height: 14, fontScale: 1, visible: true, text: "" },
          supportingText: { x: 6, y: 81, width: 58, height: 11, fontScale: 1, visible: true, text: "" },
          cta: { x: 6, y: 92, width: 56, height: 6, fontScale: 1, visible: true, text: "" },
          custom: [],
          logo: { x: 3, y: 3, width: 20, height: 6, visible: true },
        },
      },
    } as never);

    await expect(
      buildRefineRequestFromPost({ actor, postId: "post-1" }),
    ).resolves.toMatchObject({
      variant: {
        id: "variant-b",
        name: "Editorial",
      },
      brand: {
        brandName: "Nexa Labs",
      },
      post: {
        theme: "Category authority",
        audience: "Startup founders",
      },
      promptConfig: {
        systemPrompt: "Stay sharp.",
        customInstructions: "Keep it editorial.",
      },
      overlayLayout: {
        headline: {
          x: 6,
        },
      },
    });
  });

  it("rejects an explicit refine variant id that does not exist", async () => {
    mockedGetPost.mockResolvedValueOnce({
      id: "post-1",
      activeVariantId: "variant-b",
      brand: {
        brandName: "Nexa Labs",
        website: "https://nexa.example.com",
        values: "Measured growth and clear proof points.",
        principles: "Show the evidence and stay useful.",
        story: "We help growth teams turn strategy into repeatable execution.",
        voice: "Direct, confident, and clear.",
        visualDirection: "Bold editorial layouts and premium contrast.",
        palette: "#0F172A, #F97316, #F8FAFC",
        logoNotes: "Keep the logo subtle.",
      },
      result: {
        strategy: "Lead with one bold claim and back it with proof.",
        variants: [
          {
            id: "variant-a",
            name: "Hero",
            postType: "single-image",
            hook: "Stop the scroll with proof.",
            headline: "Design trust with proof",
            supportingText: "Each proof moment compounds into credibility over time.",
            cta: "Save this framework",
            caption: "Trust compounds through repeated proof moments and clear delivery.",
            hashtags: ["#Growth", "#Design", "#Trust", "#Startups", "#Strategy"],
            layout: "hero-quote",
            textAlign: "left",
            colorHexes: ["#0F172A", "#F97316"],
            overlayStrength: 0.5,
            assetSequence: ["asset-1"],
          },
          {
            id: "variant-b",
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
          {
            id: "variant-c",
            name: "Minimal",
            postType: "single-image",
            hook: "Proof should feel inevitable in public.",
            headline: "Show the work, win trust",
            supportingText: "Make the benefit explicit, tighten the framing, and keep the proof concrete for the audience.",
            cta: "Build the next post",
            caption: "Public proof turns positioning into belief when the sequence is clear, specific, and grounded in delivery.",
            hashtags: ["#Growth", "#Brand", "#Trust", "#Startups", "#Creative"],
            layout: "minimal-logo",
            textAlign: "center",
            colorHexes: ["#0F172A", "#F97316"],
            overlayStrength: 0.4,
            assetSequence: ["asset-1"],
          },
        ],
      },
    } as never);

    await expect(
      buildRefineRequestFromPost({
        actor,
        postId: "post-1",
        variantId: "missing-variant",
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: "Variant not found for this post.",
    });
  });
});
