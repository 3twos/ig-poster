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

  it("prints remote auth, provider, and quota status in human mode", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const requestJson = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        actor: {
          type: "workspace-user",
          subjectId: "user-1",
          email: "person@example.com",
          domain: "example.com",
          authSource: "bearer",
          scopes: ["posts:read"],
          issuedAt: "2026-03-10T10:00:00.000Z",
          expiresAt: "2026-03-10T11:00:00.000Z",
        },
        meta: {
          connected: true,
          source: "oauth",
          account: {
            instagramUserId: "ig_123",
            instagramUsername: "brand",
            pageName: "Brand Page",
            tokenExpiresAt: "2026-03-20T00:00:00.000Z",
          },
        },
        llm: {
          connected: true,
          mode: "parallel",
          source: "connection",
          provider: "openai",
          model: "gpt-4.1",
          connections: [
            {
              id: "conn-openai",
              source: "connection",
              provider: "openai",
              model: "gpt-4.1",
              connected: true,
              removable: true,
            },
            {
              id: "env-anthropic",
              source: "env",
              provider: "anthropic",
              model: "claude-sonnet-4-6",
              connected: true,
              removable: false,
            },
          ],
        },
        publishWindow: {
          available: true,
          limit: 50,
          used: 12,
          remaining: 38,
          windowStart: "2026-03-09T12:00:00.000Z",
        },
      },
    });

    await runStatusCommand(
      {
        host: "https://ig.example.com",
        profileName: "staging",
        token: "token",
        client: { requestJson } as never,
        projectLink: null,
        globalOptions: {
          json: false,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
    );

    expect(requestJson).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/v1/status",
    });
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("metaConnected: true"),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("llmConnections: openai:gpt-4.1 [connection], anthropic:claude-sonnet-4-6 [env]"),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("publishWindowUsage: 12/50 used, 38 remaining"),
    );
  });
});
