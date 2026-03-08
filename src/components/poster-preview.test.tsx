// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createDefaultOverlayLayout,
  type CreativeVariant,
} from "@/lib/creative";

import { PosterPreview } from "./poster-preview";

const carouselVariant: CreativeVariant = {
  id: "carousel-1",
  name: "Carousel Story",
  postType: "carousel",
  hook: "Hook with enough detail",
  headline: "Carousel headline with enough detail",
  supportingText:
    "Supporting text with enough detail to satisfy the creative schema and render in tests.",
  cta: "Swipe for more",
  caption:
    "Caption with enough detail to satisfy the schema for a realistic carousel example.",
  hashtags: [
    "#BrandPlaybook",
    "#InstagramGrowth",
    "#CreativeStrategy",
    "#ContentDesign",
    "#SocialMediaTips",
  ],
  layout: "split-story",
  textAlign: "left",
  colorHexes: ["#0F172A", "#F97316"],
  overlayStrength: 0.4,
  assetSequence: ["asset-1", "asset-2", "asset-3"],
  carouselSlides: [
    {
      index: 1,
      goal: "Stop the scroll",
      headline: "Slide one headline",
      body: "Slide one body with enough detail to render correctly.",
      assetHint: "Hero",
    },
    {
      index: 2,
      goal: "Show proof",
      headline: "Slide two headline",
      body: "Slide two body with enough detail to render correctly.",
      assetHint: "Proof",
    },
    {
      index: 3,
      goal: "Drive action",
      headline: "Slide three headline",
      body: "Slide three body with enough detail to render correctly.",
      assetHint: "CTA",
    },
  ],
};

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    disconnect() {}
  }

  Object.defineProperty(window, "ResizeObserver", {
    value: ResizeObserverMock,
    configurable: true,
  });

  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 400;
    },
  });

  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 500;
    },
  });
});

describe("PosterPreview", () => {
  it("shows saved overlay text outside editor mode and avoids split-image carousel composition", () => {
    const overlayLayout = createDefaultOverlayLayout(carouselVariant.layout);
    overlayLayout.headline.text = "Manual carousel headline";

    render(
      <PosterPreview
        variant={carouselVariant}
        brandName="Nexa Labs"
        aspectRatio="4:5"
        primaryImage="https://example.com/primary.jpg"
        secondaryImage="https://example.com/secondary.jpg"
        overlayLayout={overlayLayout}
      />,
    );

    expect(screen.getByText("Manual carousel headline")).not.toBeNull();
    expect(screen.queryByAltText("Secondary poster asset")).toBeNull();
  });

  it("uses the clamped carousel slide index for overlay copy and does not double-render editor text", async () => {
    render(
      <PosterPreview
        variant={carouselVariant}
        brandName="Nexa Labs"
        aspectRatio="4:5"
        primaryImage="https://example.com/primary.jpg"
        overlayLayout={createDefaultOverlayLayout(carouselVariant.layout)}
        carouselSlides={carouselVariant.carouselSlides}
        activeSlideIndex={99}
        editorMode
        onOverlayLayoutChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Slide three headline")).toHaveLength(1);
    });
  });
});
