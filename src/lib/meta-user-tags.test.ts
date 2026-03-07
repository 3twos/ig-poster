import { describe, expect, it } from "vitest";

import {
  formatMetaUserTagsText,
  parseMetaUserTagsText,
} from "@/lib/meta-user-tags";

describe("parseMetaUserTagsText", () => {
  it("returns undefined for empty input", () => {
    expect(parseMetaUserTagsText("")).toBeUndefined();
    expect(parseMetaUserTagsText("   ")).toBeUndefined();
    expect(parseMetaUserTagsText(undefined)).toBeUndefined();
  });

  it("parses valid rows and normalizes @ prefix", () => {
    expect(parseMetaUserTagsText("@friend,0.5,0.6")).toEqual([
      { username: "friend", x: 0.5, y: 0.6 },
    ]);
  });

  it("rejects missing coordinates before numeric coercion", () => {
    expect(() => parseMetaUserTagsText("friend,,0.5")).toThrow(
      "User tag line 1 is missing x value.",
    );
    expect(() => parseMetaUserTagsText("friend,0.5,")).toThrow(
      "User tag line 1 is missing y value.",
    );
  });
});

describe("formatMetaUserTagsText", () => {
  it("formats tags to line-based username,x,y rows", () => {
    expect(
      formatMetaUserTagsText([
        { username: "friend", x: 0.2, y: 0.8 },
        { username: "acme", x: 0.4, y: 0.1 },
      ]),
    ).toBe("friend,0.2,0.8\nacme,0.4,0.1");
  });
});
