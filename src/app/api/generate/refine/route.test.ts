import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm-auth", () => ({
  resolveAllLlmAuthFromRequest: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({
  generateWithFallback: vi.fn(),
}));

import { POST } from "@/app/api/generate/refine/route";
import { resolveAllLlmAuthFromRequest } from "@/lib/llm-auth";
import { generateWithFallback } from "@/lib/llm";

const mockedResolveAllLlmAuthFromRequest = vi.mocked(resolveAllLlmAuthFromRequest);
const mockedGenerateWithFallback = vi.mocked(generateWithFallback);

describe("POST /api/generate/refine", () => {
  it("enforces shorter-copy and no-cta directives when the model ignores them", async () => {
    mockedResolveAllLlmAuthFromRequest.mockResolvedValueOnce({
      mode: "fallback",
      connections: [
        {
          id: "conn-1",
          source: "env",
          provider: "openai",
          model: "gpt-4o-mini",
          apiKey: "test-key",
        },
      ],
    } as never);

    const variant = {
      id: "variant-1",
      name: "Editorial",
      postType: "single-image" as const,
      hook:
        "A longer hook that should be tightened by the refine pipeline once shorter copy is requested.",
      headline:
        "A deliberately long headline that should become more compact after refinement runs.",
      supportingText:
        "This supporting text is intentionally verbose so the deterministic refine policy has to shorten it for the user.",
      cta: "Visit the profile for the full framework",
      caption:
        "This caption is intentionally long so the deterministic refine policy can trim it down when the user asks for a significantly shorter caption while preserving the core message.",
      hashtags: [
        "#BrandPlaybook",
        "#InstagramGrowth",
        "#CreativeStrategy",
        "#ContentDesign",
        "#SocialMediaTips",
      ],
      layout: "magazine" as const,
      textAlign: "center" as const,
      colorHexes: ["#0F172A", "#F97316"],
      overlayStrength: 0.45,
      assetSequence: ["asset-1"],
    };

    mockedGenerateWithFallback.mockResolvedValueOnce({
      result: variant,
    } as never);

    const response = await POST(
      new Request("https://app.example.com/api/generate/refine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          variant,
          instruction:
            "Use shorter text in components, make the caption significantly shorter, and avoid CTA.",
          brand: {
            brandName: "Nexa Labs",
            website: "",
            values: "Clarity, trust, and proof.",
            principles: "Show the work and keep it useful.",
            story: "Nexa Labs helps teams turn strategy into repeatable growth systems.",
            voice: "Direct, premium, and practical.",
            visualDirection: "Editorial layouts with strong contrast.",
            palette: "#0F172A, #F97316, #F8FAFC",
            logoNotes: "",
          },
          post: {
            theme: "Category authority",
            subject: "Proof-led positioning",
            thought: "Trust compounds when the proof is obvious and repeated.",
            objective: "Drive profile visits",
            audience: "Founders",
            mood: "Premium",
            aspectRatio: "4:5",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      source: "model",
      variant: {
        id: "variant-1",
        cta: "",
      },
      promptPreview: {
        systemPrompt: expect.stringContaining("You refine Instagram creative variants."),
        userPrompt: expect.stringContaining("Refinement instruction:"),
        instructionPlan: {
          ctaAction: "remove",
          preserveLayout: true,
          toneDirection: "preserve",
          audienceHint: null,
          shorten: {
            hook: true,
            headline: true,
            supportingText: true,
            cta: true,
            caption: true,
            intensity: "aggressive",
          },
        },
      },
    });
    expect(payload.variant.hook.length).toBeLessThan(variant.hook.length);
    expect(payload.variant.headline.length).toBeLessThan(variant.headline.length);
    expect(payload.variant.supportingText.length).toBeLessThan(
      variant.supportingText.length,
    );
    expect(payload.variant.caption.length).toBeLessThan(variant.caption.length);
  });
});
