import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/chat", () => ({
  startChatStream: vi.fn(),
  ChatServiceError: class ChatServiceError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { POST } from "@/app/api/v1/chat/route";
import { resolveActorFromRequest } from "@/services/actors";
import { startChatStream } from "@/services/chat";

const mockedResolveActorFromRequest = vi.mocked(resolveActorFromRequest);
const mockedStartChatStream = vi.mocked(startChatStream);

describe("POST /api/v1/chat", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("requires an authenticated actor", async () => {
    mockedResolveActorFromRequest.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("https://app.example.com/api/v1/chat", {
        method: "POST",
        body: JSON.stringify({ message: "Help me rewrite this." }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("proxies valid requests to the chat service", async () => {
    const actor = { ownerHash: "owner-hash", email: "person@example.com" } as never;
    mockedResolveActorFromRequest.mockResolvedValueOnce(actor);
    mockedStartChatStream.mockResolvedValueOnce(
      new Response('data: {"type":"done"}\n\n', {
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const response = await POST(
      new Request("https://app.example.com/api/v1/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "Rewrite this caption.",
          postId: "post-1",
          history: [{ role: "assistant", content: "Previous reply" }],
        }),
      }),
    );

    expect(mockedStartChatStream).toHaveBeenCalledWith({
      actor,
      input: {
        message: "Rewrite this caption.",
        postId: "post-1",
        history: [{ role: "assistant", content: "Previous reply" }],
      },
      req: expect.any(Request),
    });
    await expect(response.text()).resolves.toContain('"done"');
  });

  it("rejects malformed bodies", async () => {
    mockedResolveActorFromRequest.mockResolvedValueOnce({ ownerHash: "owner" } as never);

    const response = await POST(
      new Request("https://app.example.com/api/v1/chat", {
        method: "POST",
        body: JSON.stringify({ postId: "post-1" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockedStartChatStream).not.toHaveBeenCalled();
  });
});
