// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { forwardRef } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  createFittedOverlayLayout,
  createDefaultOverlayLayout,
  type CreativeVariant,
} from "@/lib/creative";

import { PosterSection } from "./poster-section";

vi.mock("@/components/poster-preview", () => ({
  PosterPreview: forwardRef<HTMLDivElement, Record<string, unknown>>(
    function MockPosterPreview(_props, ref) {
      return <div ref={ref}>Mock Preview</div>;
    },
  ),
}));

const variant: CreativeVariant = {
  id: "variant-1",
  name: "Variant One",
  postType: "single-image",
  hook: "Hook copy",
  headline: "Headline copy",
  supportingText: "Supporting text with enough detail to satisfy the schema.",
  cta: "Visit profile",
  caption: "Caption copy with enough detail to satisfy the schema constraints.",
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
  overlayStrength: 0.45,
  assetSequence: ["asset-1"],
};

describe("PosterSection", () => {
  it("shows a layout warning when canonical blocks overlap or spill out of bounds", () => {
    const overlayLayout = createDefaultOverlayLayout("hero-quote");
    overlayLayout.headline.y = 68;
    overlayLayout.headline.height = 20;
    overlayLayout.supportingText.y = 84;
    overlayLayout.supportingText.height = 8;
    overlayLayout.cta.y = 94;
    overlayLayout.cta.height = 6;

    render(
      <PosterSection
        posterRef={{ current: null }}
        activeVariant={variant}
        brandName="Nexa Labs"
        aspectRatio="4:5"
        editorMode
        onResetTextLayout={() => {}}
        onAutoFitTextLayout={() => {}}
        saveStatus="saved"
        overlayLayout={overlayLayout}
        activeSlideIndex={0}
        dispatch={vi.fn()}
      />,
    );

    expect(screen.getByText(/Layout warning/i)).not.toBeNull();
    expect(screen.getByText(/Headline overlaps Body/i)).not.toBeNull();
  });

  it("hides the warning when canonical blocks fit cleanly", () => {
    const overlayLayout = createFittedOverlayLayout(variant, "4:5");

    render(
      <PosterSection
        posterRef={{ current: null }}
        activeVariant={variant}
        brandName="Nexa Labs"
        aspectRatio="4:5"
        editorMode
        onResetTextLayout={() => {}}
        onAutoFitTextLayout={() => {}}
        saveStatus="saved"
        overlayLayout={overlayLayout}
        activeSlideIndex={0}
        dispatch={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Layout warning/i)).toBeNull();
  });
});
