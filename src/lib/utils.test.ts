import { describe, it, expect } from "vitest";
import { hexToRgba, slugify } from "./utils";

describe("hexToRgba", () => {
  it("converts a valid hex to rgba", () => {
    expect(hexToRgba("#ff8800", 0.5)).toBe("rgba(255, 136, 0, 0.5)");
  });

  it("clamps alpha to [0, 1]", () => {
    expect(hexToRgba("#000000", 2)).toBe("rgba(0, 0, 0, 1)");
    expect(hexToRgba("#000000", -1)).toBe("rgba(0, 0, 0, 0)");
  });

  it("returns fallback for invalid hex", () => {
    expect(hexToRgba("#abc", 0.5)).toBe("rgba(15,23,42,0.5)");
    expect(hexToRgba("not-a-hex", 1)).toBe("rgba(15,23,42,1)");
  });
});

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips special characters", () => {
    expect(slugify("Product Launch! (2024)")).toBe("product-launch-2024");
  });

  it("truncates to 40 characters", () => {
    const long = "a".repeat(50);
    expect(slugify(long).length).toBe(40);
  });

  it("collapses multiple spaces", () => {
    expect(slugify("foo   bar")).toBe("foo-bar");
  });
});
