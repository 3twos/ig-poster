import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/meta-auth", () => ({
  resolveMetaAuthForRequest: vi.fn(),
}));

import { GET } from "@/app/api/auth/meta/status/route";
import { resolveActorFromRequest } from "@/services/actors";
import { resolveMetaAuthForRequest } from "@/services/meta-auth";

const mockedResolveActorFromRequest = vi.mocked(resolveActorFromRequest);
const mockedResolveMetaAuthForRequest = vi.mocked(resolveMetaAuthForRequest);

describe("GET /api/auth/meta/status", () => {
  beforeEach(() => {
    mockedResolveActorFromRequest.mockReset();
    mockedResolveMetaAuthForRequest.mockReset();
  });

  it("returns the resolved Meta publishing pair", async () => {
    mockedResolveActorFromRequest.mockResolvedValue({
      ownerHash: "owner-1",
    } as never);
    mockedResolveMetaAuthForRequest.mockResolvedValue({
      source: "oauth",
      auth: {
        accessToken: "token-123",
        instagramUserId: "ig-1",
        pageId: "page-1",
        graphVersion: "v22.0",
      },
      account: {
        accountKey: "page-1:ig-1",
        pageId: "page-1",
        pageName: "Inesueno Wines",
        instagramUserId: "ig-1",
        instagramUsername: "inesueno.wines",
      },
    } as never);

    const response = await GET(
      new Request("https://app.example.com/api/auth/meta/status"),
    );

    expect(response.status).toBe(200);
    expect(mockedResolveMetaAuthForRequest).toHaveBeenCalledWith(
      expect.any(Request),
      { ownerHash: "owner-1" },
    );
    await expect(response.json()).resolves.toEqual({
      connected: true,
      source: "oauth",
      account: {
        accountKey: "page-1:ig-1",
        pageId: "page-1",
        pageName: "Inesueno Wines",
        instagramUserId: "ig-1",
        instagramUsername: "inesueno.wines",
      },
    });
  });

  it("returns a disconnected payload when resolution fails", async () => {
    mockedResolveActorFromRequest.mockResolvedValue(null);
    mockedResolveMetaAuthForRequest.mockRejectedValue(new Error("Not connected"));

    const response = await GET(
      new Request("https://app.example.com/api/auth/meta/status"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      connected: false,
      source: null,
      detail: "Not connected",
    });
  });
});
