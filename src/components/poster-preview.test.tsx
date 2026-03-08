// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

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

  it("enters inline edit on double-click and commits on blur", async () => {
    const onChange = vi.fn();
    const singleVariant: CreativeVariant = {
      ...carouselVariant,
      id: "single-1",
      postType: "single-image",
      assetSequence: ["asset-1"],
      carouselSlides: undefined,
    };

    render(
      <PosterPreview
        variant={singleVariant}
        brandName="Nexa Labs"
        aspectRatio="4:5"
        overlayLayout={createDefaultOverlayLayout(singleVariant.layout)}
        editorMode
        onOverlayLayoutChange={onChange}
      />,
    );

    // Headline text should be visible
    const headline = await screen.findByText(singleVariant.headline);
    expect(headline).not.toBeNull();

    // Double-click to enter edit mode
    const container = headline.closest("[class*='p-3']");
    if (container) {
      fireEvent.doubleClick(container);
    }

    // The span should become contentEditable
    await waitFor(() => {
      expect(headline.getAttribute("contenteditable")).toBe("true");
    });

    // Edit the text and blur to commit
    headline.textContent = "Updated headline";
    fireEvent.blur(headline);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
      expect(lastCall.headline.text).toBe("Updated headline");
    });
  });

  it("cancels inline edit on Escape without committing", async () => {
    const onChange = vi.fn();
    const singleVariant: CreativeVariant = {
      ...carouselVariant,
      id: "single-2",
      postType: "single-image",
      assetSequence: ["asset-1"],
      carouselSlides: undefined,
    };

    render(
      <PosterPreview
        variant={singleVariant}
        brandName="Nexa Labs"
        aspectRatio="4:5"
        overlayLayout={createDefaultOverlayLayout(singleVariant.layout)}
        editorMode
        onOverlayLayoutChange={onChange}
      />,
    );

    const headline = await screen.findByText(singleVariant.headline);
    const container = headline.closest("[class*='p-3']");
    if (container) {
      fireEvent.doubleClick(container);
    }

    await waitFor(() => {
      expect(headline.getAttribute("contenteditable")).toBe("true");
    });

    // Modify then press Escape — should not commit
    headline.textContent = "Should be discarded";
    fireEvent.keyDown(headline, { key: "Escape" });
    // jsdom doesn't auto-fire blur from .blur(), so trigger it manually
    fireEvent.blur(headline);

    // After Escape + blur, onChange should not have been called with the discarded text
    // The cancelledRef causes handleBlur to restore original text
    await waitFor(() => {
      // If onChange was called, it should not contain the discarded text
      const calls = onChange.mock.calls;
      const hasDiscarded = calls.some(
        (call: [typeof createDefaultOverlayLayout extends (...a: never[]) => infer R ? R : never]) =>
          call[0]?.headline?.text === "Should be discarded",
      );
      expect(hasDiscarded).toBe(false);
    });
  });

  it("renders logo at layout position and uses brandName in alt text", () => {
    render(
      <PosterPreview
        variant={carouselVariant}
        brandName="Nexa Labs"
        aspectRatio="4:5"
        logoImage="https://example.com/logo.png"
        overlayLayout={createDefaultOverlayLayout(carouselVariant.layout)}
      />,
    );

    const logo = screen.getByAltText("Nexa Labs logo");
    expect(logo).not.toBeNull();
  });
});
