// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import {
  createDefaultOverlayLayout,
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

function StrategyHarness() {
  const [layout, setLayout] = useState(createDefaultOverlayLayout(variant.layout));

  return (
    <TooltipProvider>
      <StrategySection
        result={result}
        activeVariant={variant}
        editorMode
        isRefining={false}
        dispatch={vi.fn()}
        setEditorMode={vi.fn()}
        onResetTextLayout={vi.fn()}
        onRefineVariant={vi.fn()}
        onCopyCaption={vi.fn()}
        copyState="idle"
        overlayLayout={layout}
        onOverlayLayoutChange={setLayout}
        saveStatus="saved"
        onSaveNow={vi.fn().mockResolvedValue(undefined)}
      />
    </TooltipProvider>
  );
}

describe("StrategySection editor inspector", () => {
  it("lets users hide generated blocks, edit text, and add or remove custom boxes", () => {
    render(<StrategyHarness />);

    fireEvent.click(screen.getAllByRole("button", { name: "Hide" })[0]);
    expect(screen.getByRole("button", { name: "Add back" })).not.toBeNull();

    const headlineInput = screen.getByPlaceholderText(variant.headline);
    fireEvent.change(headlineInput, { target: { value: "Manual headline override" } });
    expect(screen.getByDisplayValue("Manual headline override")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add box" }));
    expect(screen.getByDisplayValue("Text Box 1")).not.toBeNull();
    expect(screen.getByDisplayValue("New text")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByDisplayValue("New text")).toBeNull();
  });

  it("keeps custom boxes within schema limits while editing", () => {
    render(<StrategyHarness />);

    const addButton = screen.getByRole("button", { name: "Add box" });
    for (let index = 0; index < 6; index += 1) {
      fireEvent.click(addButton);
    }

    expect((addButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(6);

    const firstLabelInput = screen.getByDisplayValue("Text Box 1");
    fireEvent.change(firstLabelInput, { target: { value: "" } });
    expect(screen.getByDisplayValue("Text Box 1")).not.toBeNull();

    const firstCustomText = screen.getAllByDisplayValue("New text")[0] as HTMLTextAreaElement;
    expect(firstCustomText.getAttribute("maxLength")).toBe("320");
  });
});
