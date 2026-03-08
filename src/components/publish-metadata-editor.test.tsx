// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PublishMetadataEditor } from "./publish-metadata-editor";

vi.mock("./meta-location-search", () => ({
  MetaLocationSearchField: ({
    onSelectLocationId,
  }: {
    onSelectLocationId: (value: string) => void;
  }) => (
    <button type="button" onClick={() => onSelectLocationId("search-location-id")}>
      Pick location
    </button>
  ),
}));

vi.mock("./meta-user-tags-editor", () => ({
  MetaUserTagsEditor: ({
    ariaLabelPrefix,
    onChange,
  }: {
    ariaLabelPrefix: string;
    onChange: (tags: Array<{ username: string; x: number; y: number }>) => void;
  }) => (
    <button
      type="button"
      aria-label={`${ariaLabelPrefix} apply user tags`}
      onClick={() => onChange([{ username: "friend", x: 0.25, y: 0.75 }])}
    >
      Apply tags
    </button>
  ),
}));

describe("PublishMetadataEditor", () => {
  it("persists reel metadata through the shared callbacks", () => {
    const onFirstCommentChange = vi.fn();
    const onLocationIdChange = vi.fn();
    const onReelShareToFeedChange = vi.fn();
    const onAssetUserTagsChange = vi.fn();

    render(
      <PublishMetadataEditor
        postType="reel"
        firstComment=""
        locationId=""
        reelShareToFeed
        hasIncompleteUserTags={false}
        singleTagAsset={{
          assetId: "asset-1",
          name: "Reel cover",
          mediaType: "image",
          previewUrl: "https://cdn.example.com/cover.jpg",
          userTags: [],
        }}
        onFirstCommentChange={onFirstCommentChange}
        onLocationIdChange={onLocationIdChange}
        onReelShareToFeedChange={onReelShareToFeedChange}
        onAssetUserTagsChange={onAssetUserTagsChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("First comment (optional)"), {
      target: { value: "First comment" },
    });
    fireEvent.change(screen.getByLabelText("Location ID (optional)"), {
      target: { value: "manual-location-id" },
    });
    fireEvent.click(screen.getByText("Pick location"));
    fireEvent.click(screen.getByLabelText("Reel publish apply user tags"));
    fireEvent.click(screen.getByLabelText("Share reel to main feed"));

    expect(onFirstCommentChange).toHaveBeenCalledWith("First comment");
    expect(onLocationIdChange).toHaveBeenNthCalledWith(1, "manual-location-id");
    expect(onLocationIdChange).toHaveBeenNthCalledWith(2, "search-location-id");
    expect(onAssetUserTagsChange).toHaveBeenCalledWith("asset-1", [
      { username: "friend", x: 0.25, y: 0.75 },
    ]);
    expect(onReelShareToFeedChange).toHaveBeenCalledWith(false);
  });

  it("renders per-item carousel tagging and skips video tag editors", () => {
    render(
      <PublishMetadataEditor
        postType="carousel"
        firstComment=""
        locationId=""
        reelShareToFeed
        hasIncompleteUserTags={false}
        carouselTagAssets={[
          {
            assetId: "asset-1",
            name: "Slide 1",
            mediaType: "image",
            previewUrl: "https://cdn.example.com/slide-1.jpg",
            userTags: [],
          },
          {
            assetId: "asset-2",
            name: "Slide 2",
            mediaType: "video",
            previewUrl: "https://cdn.example.com/slide-2.mp4",
            userTags: [],
          },
        ]}
        onFirstCommentChange={vi.fn()}
        onLocationIdChange={vi.fn()}
        onReelShareToFeedChange={vi.fn()}
        onAssetUserTagsChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Item 1: Slide 1")).not.toBeNull();
    expect(screen.getByText("Item 2: Slide 2")).not.toBeNull();
    expect(screen.getByLabelText("Carousel item 1 apply user tags")).not.toBeNull();
    expect(
      screen.getByText(/Meta will reject user tags on carousel video items/i),
    ).not.toBeNull();
    expect(screen.queryByLabelText("Carousel item 2 apply user tags")).toBeNull();
  });
});
