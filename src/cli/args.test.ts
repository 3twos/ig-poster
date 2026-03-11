import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CliError, EXIT_CODES } from "@/cli/errors";
import {
  finalizeGlobalOptions,
  parseCommandOptions,
  parseGlobalOptions,
} from "@/cli/args";

describe("parseGlobalOptions", () => {
  it("extracts global options without consuming command flags", () => {
    const parsed = parseGlobalOptions([
      "--profile",
      "staging",
      "posts",
      "list",
      "--status",
      "draft",
      "--json",
    ]);

    expect(parsed.options).toMatchObject({
      profile: "staging",
      json: true,
      streamJson: false,
    });
    expect(parsed.rest).toEqual(["posts", "list", "--status", "draft"]);
  });

  it("parses stream-json as a global flag", () => {
    const parsed = parseGlobalOptions(["generate", "run", "--post", "post-1", "--stream-json"]);

    expect(parsed.options.streamJson).toBe(true);
    expect(parsed.rest).toEqual(["generate", "run", "--post", "post-1"]);
  });

  it("parses hidden local mode without passing it to the command", () => {
    const parsed = parseGlobalOptions(["--local", "status"]);

    expect(parsed.options.local).toBe(true);
    expect(parsed.rest).toEqual(["status"]);
  });

  it("expands a json flags file before parsing", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ig-flags-"));
    const flagsPath = path.join(tempDir, "flags.json");
    writeFileSync(
      flagsPath,
      JSON.stringify(["--profile", "staging", "posts", "list", "--status", "draft"]),
    );

    try {
      const parsed = parseGlobalOptions(["--flags-file", flagsPath, "--json"]);

      expect(parsed.options).toMatchObject({
        profile: "staging",
        json: true,
      });
      expect(parsed.rest).toEqual(["posts", "list", "--status", "draft"]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("supports inline --flags-file=<path> syntax", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ig-flags-inline-"));
    const flagsPath = path.join(tempDir, "flags.json");
    writeFileSync(flagsPath, JSON.stringify(["--profile", "staging", "posts", "list"]));

    try {
      const parsed = parseGlobalOptions([`--flags-file=${flagsPath}`, "--json"]);

      expect(parsed.options).toMatchObject({
        profile: "staging",
        json: true,
      });
      expect(parsed.rest).toEqual(["posts", "list"]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("supports nested newline flags files with relative paths", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ig-flags-nested-"));
    const outerPath = path.join(tempDir, "outer.flags");
    const innerPath = path.join(tempDir, "inner.flags");
    writeFileSync(innerPath, ["generate", "run", "--post", "post-1"].join("\n"));
    writeFileSync(
      outerPath,
      ["--flags-file", "inner.flags", "--stream-json"].join("\n"),
    );

    try {
      const parsed = parseGlobalOptions(["--flags-file", outerPath]);

      expect(parsed.options.streamJson).toBe(true);
      expect(parsed.rest).toEqual(["generate", "run", "--post", "post-1"]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not treat unrelated flags with the same prefix as flags files", () => {
    const parsed = parseGlobalOptions(["--flags-filex", "value", "posts", "list"]);

    expect(parsed.rest).toEqual(["--flags-filex", "value", "posts", "list"]);
  });

  it("rejects circular flags file references", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ig-flags-loop-"));
    const firstPath = path.join(tempDir, "first.flags");
    const secondPath = path.join(tempDir, "second.flags");
    writeFileSync(firstPath, ["--flags-file", "second.flags"].join("\n"));
    writeFileSync(secondPath, ["--flags-file", "first.flags"].join("\n"));

    try {
      expect(() => parseGlobalOptions(["--flags-file", firstPath])).toThrow(
        `Circular --flags-file reference: ${firstPath}`,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects missing flags files with a usage error", () => {
    expect.assertions(2);

    try {
      parseGlobalOptions(["--flags-file", "/tmp/does-not-exist.flags"]);
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect(error).toMatchObject({
        exitCode: EXIT_CODES.usage,
        message: expect.stringContaining("Could not read --flags-file /tmp/does-not-exist.flags"),
      });
    }
  });

  it("rejects invalid json flags files with a usage error", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ig-flags-invalid-json-"));
    const flagsPath = path.join(tempDir, "flags.json");
    writeFileSync(flagsPath, '["--profile",]');

    expect.assertions(2);

    try {
      parseGlobalOptions(["--flags-file", flagsPath]);
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect(error).toMatchObject({
        exitCode: EXIT_CODES.usage,
        message: expect.stringContaining(`Invalid JSON in --flags-file ${flagsPath}`),
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects conflicting machine-readable output flags", () => {
    expect(() =>
      parseGlobalOptions(["status", "--json", "--stream-json"]),
    ).toThrow("Choose only one of --json or --stream-json.");
  });

  it("rejects conflicting local and host targeting flags", () => {
    expect(() =>
      parseGlobalOptions(["--local", "--host", "https://ig.example.com", "status"]),
    ).toThrow("Choose only one of --local or --host.");
  });
});

describe("finalizeGlobalOptions", () => {
  it("auto-enables json for structured commands on non-tty stdout", () => {
    const options = finalizeGlobalOptions(
      {
        json: false,
        streamJson: false,
        quiet: false,
        noColor: false,
        yes: false,
        dryRun: false,
      },
      {
        command: "status",
        stdoutIsTTY: false,
      },
    );

    expect(options.json).toBe(true);
  });

  it("does not auto-enable json for mcp or completion commands", () => {
    const completion = finalizeGlobalOptions(
      {
        json: false,
        streamJson: false,
        quiet: false,
        noColor: false,
        yes: false,
        dryRun: false,
      },
      {
        command: "completion",
        stdoutIsTTY: false,
      },
    );
    const mcp = finalizeGlobalOptions(
      {
        json: false,
        streamJson: false,
        quiet: false,
        noColor: false,
        yes: false,
        dryRun: false,
      },
      {
        command: "mcp",
        stdoutIsTTY: false,
      },
    );

    expect(completion.json).toBe(false);
    expect(mcp.json).toBe(false);
  });
});

describe("parseCommandOptions", () => {
  it("parses boolean and string command flags", () => {
    const parsed = parseCommandOptions<{ status?: string; archived?: boolean }>(
      ["--status", "draft", "--archived"],
      {
        status: "string",
        archived: "boolean",
      },
    );

    expect(parsed.options).toEqual({
      status: "draft",
      archived: true,
    });
    expect(parsed.positionals).toEqual([]);
  });
});
