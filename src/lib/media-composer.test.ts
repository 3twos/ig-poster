import { describe, expect, it } from "vitest";

import {
  aspectRatioFromOrientation,
  normalizeAssetSequence,
  orientationFromAspectRatio,
  reconcileMediaComposition,
} from "@/lib/media-composer";

describe("reconcileMediaComposition", () => {
  it("preserves known item metadata, drops missing assets, and appends new ones", () => {
    const result = reconcileMediaComposition(
      {
        orientation: "landscape",
        items: [
          {
            assetId: "asset-2",
            cropRect: { x: 0.1, y: 0.2, width: 0.6, height: 0.7 },
            rotation: 90,
            excludedFromPost: true,
          },
          {
            assetId: "missing",
            cropRect: { x: 0, y: 0, width: 1, height: 1 },
            rotation: 0,
          },
        ],
      },
      ["asset-2", "asset-1"],
      "4:5",
    );

    expect(result).toEqual({
      orientation: "landscape",
      items: [
        {
          assetId: "asset-2",
          cropRect: { x: 0.1, y: 0.2, width: 0.6, height: 0.7 },
          rotation: 90,
          excludedFromPost: true,
          coverPriority: undefined,
        },
        {
          assetId: "asset-1",
          cropRect: { x: 0, y: 0, width: 1, height: 1 },
          rotation: 0,
          excludedFromPost: false,
          coverPriority: undefined,
        },
      ],
    });
  });

  it("derives orientation from aspect ratio when no composer state exists", () => {
    expect(reconcileMediaComposition(null, ["asset-1"], "1:1").orientation).toBe(
      "square",
    );
    expect(
      reconcileMediaComposition(undefined, ["asset-1"], "1.91:1").orientation,
    ).toBe("landscape");
  });
});

describe("orientation mapping", () => {
  it("maps aspect ratios to composer orientations", () => {
    expect(orientationFromAspectRatio("1:1")).toBe("square");
    expect(orientationFromAspectRatio("4:5")).toBe("portrait");
    expect(orientationFromAspectRatio("1.91:1")).toBe("landscape");
    expect(orientationFromAspectRatio("9:16")).toBe("portrait");
  });

  it("maps composer orientations back to feed aspect ratios", () => {
    expect(aspectRatioFromOrientation("square")).toBe("1:1");
    expect(aspectRatioFromOrientation("portrait")).toBe("4:5");
    expect(aspectRatioFromOrientation("landscape")).toBe("1.91:1");
  });
});

describe("normalizeAssetSequence", () => {
  it("deduplicates ids, drops missing assets, and preserves order", () => {
    expect(
      normalizeAssetSequence(
        ["asset-2", "asset-1", "asset-2", "missing", "asset-3"],
        ["asset-1", "asset-2", "asset-3"],
      ),
    ).toEqual(["asset-2", "asset-1", "asset-3"]);
  });

  it("respects the configured item limit", () => {
    expect(
      normalizeAssetSequence(
        ["1", "2", "3", "4"],
        ["1", "2", "3", "4"],
        2,
      ),
    ).toEqual(["1", "2"]);
  });
});
