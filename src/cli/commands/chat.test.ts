import { afterEach, describe, expect, it, vi } from "vitest";

import { runChatCommand } from "@/cli/commands/chat";

const createStreamResponse = (events: unknown[]) =>
  new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    {
      headers: {
        "content-type": "text/event-stream",
      },
    },
  );

describe("runChatCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints streamed assistant text in human mode", async () => {
    const requestStream = vi.fn().mockResolvedValue(
      createStreamResponse([
        { type: "token", content: "Use a sharper opening. " },
        { type: "token", content: "Lead with the proof." },
        { type: "done", tokenCount: 18 },
      ]),
    );
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runChatCommand(
      {
        client: { requestStream },
        globalOptions: {
          json: false,
          streamJson: false,
          jq: undefined,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      ["ask", "--post", "post-1", "Rewrite", "this", "caption"],
    );

    expect(requestStream).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/v1/chat",
      headers: {
        accept: "text/event-stream",
      },
      body: {
        message: "Rewrite this caption",
        postId: "post-1",
      },
    });
    expect(stdout).toHaveBeenCalledWith("Use a sharper opening. ");
    expect(stdout).toHaveBeenCalledWith("Lead with the proof.");
  });

  it("prints the final assistant message in json mode", async () => {
    const requestStream = vi.fn().mockResolvedValue(
      createStreamResponse([
        { type: "token", content: "Keep the hook concrete." },
        { type: "done", tokenCount: 9 },
      ]),
    );
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runChatCommand(
      {
        client: { requestStream },
        globalOptions: {
          json: true,
          streamJson: false,
          jq: undefined,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      ["ask", "--message", "Tighten this caption"],
    );

    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"message": "Keep the hook concrete."'),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"tokenCount": 9'),
    );
  });

  it("prints ndjson events in stream-json mode", async () => {
    const requestStream = vi.fn().mockResolvedValue(
      createStreamResponse([
        { type: "token", content: "One" },
        { type: "heartbeat" },
        { type: "done", tokenCount: 1 },
      ]),
    );
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runChatCommand(
      {
        client: { requestStream },
        globalOptions: {
          json: false,
          streamJson: true,
          jq: undefined,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      ["ask", "Summarize", "this"],
    );

    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"type":"token"'),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"type":"heartbeat"'),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"type":"done"'),
    );
  });
});
