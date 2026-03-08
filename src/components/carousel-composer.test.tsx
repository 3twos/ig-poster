// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CarouselComposer } from "./carousel-composer";

const assets = [
  {
    id: "asset-1",
    name: "Asset One",
    mediaType: "image" as const,
    previewUrl: "https://example.com/asset-1.jpg",
    status: "uploaded" as const,
  },
  {
    id: "asset-2",
    name: "Asset Two",
    mediaType: "image" as const,
    previewUrl: "https://example.com/asset-2.jpg",
    status: "uploaded" as const,
  },
  {
    id: "asset-3",
    name: "Asset Three",
    mediaType: "image" as const,
    previewUrl: "https://example.com/asset-3.jpg",
    status: "uploaded" as const,
  },
];

describe("CarouselComposer", () => {
  it("adds an available asset into the carousel sequence", () => {
    const onAssetSequenceChange = vi.fn();

    render(
      <CarouselComposer
        assets={assets}
        assetSequence={["asset-1", "asset-2"]}
        orientation="portrait"
        onAssetSequenceChange={onAssetSequenceChange}
        onOrientationChange={() => {}}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add Asset Three to carousel",
      }),
    );

    expect(onAssetSequenceChange).toHaveBeenCalledWith([
      "asset-1",
      "asset-2",
      "asset-3",
    ]);
  });

  it("moves an included asset to the right with the one-click controls", () => {
    const onAssetSequenceChange = vi.fn();

    render(
      <CarouselComposer
        assets={assets}
        assetSequence={["asset-1", "asset-2", "asset-3"]}
        orientation="portrait"
        onAssetSequenceChange={onAssetSequenceChange}
        onOrientationChange={() => {}}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Move Asset One right",
      }),
    );

    expect(onAssetSequenceChange).toHaveBeenCalledWith([
      "asset-2",
      "asset-1",
      "asset-3",
    ]);
  });

  it("emits orientation changes", () => {
    const onOrientationChange = vi.fn();

    render(
      <CarouselComposer
        assets={assets}
        assetSequence={["asset-1", "asset-2"]}
        orientation="portrait"
        onAssetSequenceChange={() => {}}
        onOrientationChange={onOrientationChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Landscape" }));

    expect(onOrientationChange).toHaveBeenCalledWith("landscape");
  });

  it("does not show the minimum-items warning for valid 2-item carousels", () => {
    render(
      <CarouselComposer
        assets={assets}
        assetSequence={["asset-1", "asset-2"]}
        orientation="portrait"
        onAssetSequenceChange={() => {}}
        onOrientationChange={() => {}}
      />,
    );

    expect(
      screen.queryByText("Carousel posts need at least 2 included items."),
    ).toBeNull();
  });
});
