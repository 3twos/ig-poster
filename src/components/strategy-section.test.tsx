// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import {
  type CreativeVariant,
  type GenerationResponse,
} from "@/lib/creative";

import { StrategySection } from "./strategy-section";

const variant: CreativeVariant = {
  id: "variant-1",
  name: "Authority Angle",
  postType: "single-image",
  hook: "Hook with a strong number",
  headline: "A headline with enough detail",
  supportingText:
    "Supporting text with enough detail to satisfy the creative schema and render in the preview.",
  cta: "Save this post",
  caption:
    "A long enough caption to satisfy schema constraints and provide realistic content for the UI.",
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
};

const result: GenerationResponse = {
  strategy: "Use a single-image authority post with a clear proof-driven message.",
  variants: [variant],
};

describe("StrategySection", () => {
  it("renders strategy text and variant cards", () => {
    render(
      <TooltipProvider>
        <StrategySection
          result={result}
          activeVariant={variant}
          isRefining={false}
          dispatch={vi.fn()}
          captionValue=""
          onCaptionChange={vi.fn()}
          onUseGeneratedCaption={vi.fn()}
          onRefineVariant={vi.fn()}
          onCopyCaption={vi.fn()}
          copyState="idle"
        />
      </TooltipProvider>,
    );

    expect(screen.getByText(result.strategy)).not.toBeNull();
    expect(screen.getByText(variant.name)).not.toBeNull();
    expect(screen.getByText(variant.headline)).not.toBeNull();
  });

  it("shows refine presets and caption section", () => {
    render(
      <TooltipProvider>
        <StrategySection
          result={result}
          activeVariant={variant}
          isRefining={false}
          dispatch={vi.fn()}
          captionValue=""
          onCaptionChange={vi.fn()}
          onUseGeneratedCaption={vi.fn()}
          onRefineVariant={vi.fn()}
          onCopyCaption={vi.fn()}
          copyState="idle"
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "Shorter caption" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Use generated" })).not.toBeNull();
  });

  it("shows the last refine prompt preview when provided", () => {
    render(
      <TooltipProvider>
        <StrategySection
          result={result}
          activeVariant={variant}
          isRefining={false}
          dispatch={vi.fn()}
          captionValue=""
          onCaptionChange={vi.fn()}
          onUseGeneratedCaption={vi.fn()}
          onRefineVariant={vi.fn()}
          onCopyCaption={vi.fn()}
          copyState="idle"
          lastRefinePromptPreview={{
            systemPrompt: "You refine Instagram creative variants.",
            userPrompt: "Refinement instruction: \"Shorten the CTA.\"",
            instructionPlan: {
              ctaAction: "remove",
              toneDirection: "preserve",
              audienceHint: null,
              preserveLayout: true,
              shorten: {
                hook: false,
                headline: false,
                supportingText: false,
                cta: true,
                caption: false,
                intensity: "standard",
              },
            },
          }}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("Last refine prompt used")).not.toBeNull();
    expect(screen.getByText("Parsed plan")).not.toBeNull();
    expect(screen.getByText("You refine Instagram creative variants.")).not.toBeNull();
    expect(screen.getByText('Refinement instruction: "Shorten the CTA."')).not.toBeNull();
    expect(screen.getByText(/"ctaAction": "remove"/)).not.toBeNull();
  });
});
