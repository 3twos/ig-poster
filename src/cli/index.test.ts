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

  it("prints a json error envelope when parsing fails after --json", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await expect(runCli(["--json", "--timeout", "nope"])).resolves.toBe(
      EXIT_CODES.usage,
    );

    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"ok": false'),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"code": "INVALID_INPUT"'),
    );
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints help text with the watch, mcp, chat, publish, and completion commands", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await expect(runCli(["help"])).resolves.toBe(EXIT_CODES.ok);

    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining(
        "ig publish (--image <url> | --video <url> | --carousel <url,...>)",
      ),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("ig completion <bash|zsh|fish>"),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("ig generate <run|refine>"),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("ig chat <ask>"),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("ig watch <dir>"),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("ig mcp"),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("--flags-file <path>"),
    );
  });
});
