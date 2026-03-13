import { describe, expect, it } from "vitest";

import { getMetaMetadataValidationIssues, MetaScheduleRequestSchema } from "@/lib/meta-schemas";

describe("MetaScheduleRequestSchema", () => {
  it("defaults destination to instagram", () => {
    expect(
      MetaScheduleRequestSchema.parse({
        caption: "Caption",
        media: {
          mode: "image",
          imageUrl: "https://cdn.example.com/image.jpg",
        },
      }).destination,
    ).toBe("instagram");
  });
});

describe("getMetaMetadataValidationIssues", () => {
  it("rejects Facebook-only unsupported metadata", () => {
    expect(
      getMetaMetadataValidationIssues({
        destination: "facebook",
        media: {
          mode: "image",
          imageUrl: "https://cdn.example.com/image.jpg",
        },
        firstComment: "First comment",
        locationId: "12345",
        userTags: [{ username: "handle", x: 0.5, y: 0.5 }],
      }).map((issue) => issue.message),
    ).toEqual([
      "Facebook publishing does not support Instagram-style first comments.",
      "Facebook publishing does not support Instagram location IDs.",
      "Facebook publishing does not support Instagram user tags.",
    ]);
  });

  it("rejects Facebook carousels before carousel-specific Instagram guidance", () => {
    expect(
      getMetaMetadataValidationIssues({
        destination: "facebook",
        media: {
          mode: "carousel",
          items: [
            { mediaType: "image", url: "https://cdn.example.com/1.jpg" },
            { mediaType: "image", url: "https://cdn.example.com/2.jpg" },
          ],
        },
      })[0]?.message,
    ).toBe(
      "Facebook publishing currently supports single image and single video posts only.",
    );
  });
});
