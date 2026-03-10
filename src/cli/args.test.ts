import { describe, expect, it } from "vitest";

import { parseCommandOptions, parseGlobalOptions } from "@/cli/args";

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
