import { describe, expect, it } from "vitest";

import { inferMediaType, inferUploadFolder } from "@/cli/upload";

describe("inferMediaType", () => {
  it("infers video media from mp4 file paths", () => {
    expect(inferMediaType("/tmp/video.mp4")).toBe("video");
    expect(inferUploadFolder("/tmp/video.mp4")).toBe("videos");
  });
});
