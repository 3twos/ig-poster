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

  it("prints help text with the new project and completion commands", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await expect(runCli(["help"])).resolves.toBe(EXIT_CODES.ok);

    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("ig link [--host <url>] [--profile <name>]"),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("ig completion <bash|zsh|fish>"),
    );
  });
});
