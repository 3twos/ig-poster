import { describe, expect, it } from "vitest";

import { handleMcpMessage } from "@/cli/commands/mcp";

describe("handleMcpMessage", () => {
  it("returns initialize metadata with tool capabilities", async () => {
    const response = await handleMcpMessage(
      {
        json: false,
        streamJson: false,
        quiet: false,
        noColor: false,
        yes: false,
        dryRun: false,
      },
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-05",
        },
      }),
    );

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-11-05",
        capabilities: {
          tools: {},
        },
      },
    });
  });

  it("lists the exposed CLI-backed tools", async () => {
    const response = await handleMcpMessage(
      {
        json: false,
        streamJson: false,
        quiet: false,
        noColor: false,
        yes: false,
        dryRun: false,
      },
      JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      }),
    );

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "status" }),
          expect.objectContaining({ name: "photos_recent" }),
          expect.objectContaining({ name: "photos_search" }),
          expect.objectContaining({ name: "generate_run" }),
          expect.objectContaining({ name: "publish" }),
        ]),
      },
    });
  });

  it("does not respond to initialize notifications", async () => {
    const response = await handleMcpMessage(
      {
        json: false,
        streamJson: false,
        quiet: false,
        noColor: false,
        yes: false,
        dryRun: false,
      },
      JSON.stringify({
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2025-11-05",
        },
      }),
    );

    expect(response).toBeNull();
  });

  it("does not respond to tools/list notifications", async () => {
    const response = await handleMcpMessage(
      {
        json: false,
        streamJson: false,
        quiet: false,
        noColor: false,
        yes: false,
        dryRun: false,
      },
      JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/list",
      }),
    );

    expect(response).toBeNull();
  });
});
