import { afterEach, describe, expect, it, vi } from "vitest";

import { printJson } from "@/cli/output";

describe("printJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes missing jq selections to null so output stays valid json", () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    printJson({ ok: true }, ".missing");

    expect(stdout).toHaveBeenCalledWith("null\n");
  });
});
