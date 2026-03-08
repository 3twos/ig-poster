import { describe, expect, it } from "vitest";

import { DuplicatePostResponseSchema } from "@/lib/post-api";

describe("DuplicatePostResponseSchema", () => {
  it("accepts duplicate payloads with matching ids", () => {
    expect(
      DuplicatePostResponseSchema.parse({
        id: "post-copy",
        post: {
          id: "post-copy",
          title: "Copy",
        },
      }),
    ).toMatchObject({
      id: "post-copy",
      post: {
        id: "post-copy",
      },
    });
  });

  it("rejects mismatched duplicate ids", () => {
    expect(() =>
      DuplicatePostResponseSchema.parse({
        id: "post-copy",
        post: {
          id: "post-original",
        },
      }),
    ).toThrow(/Duplicate response id does not match duplicated post payload/);
  });
});
