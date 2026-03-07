import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
}));

vi.mock("@/lib/meta-auth", () => ({
  resolveMetaAuthFromRequest: vi.fn(),
}));

vi.mock("@/lib/meta", () => ({
  searchMetaLocations: vi.fn(),
}));

import { GET } from "@/app/api/meta/locations/route";
import { resolveMetaAuthFromRequest } from "@/lib/meta-auth";
import { searchMetaLocations } from "@/lib/meta";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

const mockedReadWorkspace = vi.mocked(readWorkspaceSessionFromRequest);
const mockedResolveMetaAuth = vi.mocked(resolveMetaAuthFromRequest);
const mockedSearchMetaLocations = vi.mocked(searchMetaLocations);

const session = {
  sub: "user-1",
  email: "person@example.com",
  domain: "example.com",
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe("GET /api/meta/locations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when workspace session is missing", async () => {
    mockedReadWorkspace.mockResolvedValue(null);

    const req = new Request("https://app.example.com/api/meta/locations?q=napa");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("returns 400 for short queries", async () => {
    mockedReadWorkspace.mockResolvedValue(session);

    const req = new Request("https://app.example.com/api/meta/locations?q=n");
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it("returns matching Meta locations", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    mockedResolveMetaAuth.mockResolvedValue({
      source: "oauth",
      auth: {
        accessToken: "token",
        instagramUserId: "ig-1",
        graphVersion: "v22.0",
      },
      account: {
        instagramUserId: "ig-1",
      },
    });
    mockedSearchMetaLocations.mockResolvedValue([
      {
        id: "12345",
        name: "Napa Valley Welcome Center",
        city: "Napa",
        state: "CA",
        country: "United States",
      },
    ]);

    const req = new Request("https://app.example.com/api/meta/locations?q=napa");
    const res = await GET(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      locations: [
        {
          id: "12345",
          name: "Napa Valley Welcome Center",
          city: "Napa",
          state: "CA",
          country: "United States",
        },
      ],
    });
    expect(mockedSearchMetaLocations).toHaveBeenCalledWith("napa", {
      accessToken: "token",
      instagramUserId: "ig-1",
      graphVersion: "v22.0",
    });
  });
});
