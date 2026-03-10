import { afterEach, describe, expect, it, vi } from "vitest";

import { runStatusCommand } from "@/cli/commands/status";

describe("runStatusCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes linked project details in json mode", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runStatusCommand(
      {
        host: "https://ig.example.com",
        profileName: "staging",
        token: undefined,
        projectLink: {
          rootDir: "/tmp/repo",
          configPath: "/tmp/repo/.ig-poster/project.json",
          config: {
            host: "https://ig.example.com",
            profile: "staging",
            defaults: {
              brandKitId: "bk_123",
              outputDir: ".ig-poster/out",
            },
          },
        },
        globalOptions: {
          json: true,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
    );

    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"projectLink"'),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"brandKitId": "bk_123"'),
    );
  });
});
