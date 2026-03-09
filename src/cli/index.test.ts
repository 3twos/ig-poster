import { afterEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "@/cli/errors";
import { runCli } from "@/cli/index";

describe("runCli", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a usage exit code for invalid global options", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await expect(runCli(["--timeout", "nope"])).resolves.toBe(
      EXIT_CODES.usage,
    );
    expect(stderr).toHaveBeenCalledWith("Invalid timeout value: nope\n");
  });
});
