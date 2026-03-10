import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/meta-auth", () => ({
  resolveMetaAuthForApi: vi.fn(),
  MetaAuthServiceError: class MetaAuthServiceError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/meta", async () => {
  const actual = await vi.importActual<typeof import("@/lib/meta")>(
    "@/lib/meta",
  );
  return {
    ...actual,
    searchMetaLocations: vi.fn(),
  };
});

import { GET } from "@/app/api/v1/meta/locations/route";
import { searchMetaLocations } from "@/lib/meta";
import { resolveActorFromRequest } from "@/services/actors";
import { resolveMetaAuthForApi } from "@/services/meta-auth";

const mockedResolveActorFromRequest = vi.mocked(resolveActorFromRequest);
const mockedResolveMetaAuthForApi = vi.mocked(resolveMetaAuthForApi);
const mockedSearchMetaLocations = vi.mocked(searchMetaLocations);

describe("GET /api/v1/meta/locations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedResolveActorFromRequest.mockResolvedValue({
      ownerHash: "owner_hash",
    } as never);
    mockedResolveMetaAuthForApi.mockResolvedValue({
      source: "oauth",
      auth: {
        accessToken: "token",
        instagramUserId: "ig-id",
        graphVersion: "v22.0",
      },
      account: {
        connectionId: "conn_1",
        instagramUserId: "ig-id",
      },
    });
  });

  it("requires an authenticated actor", async () => {
    mockedResolveActorFromRequest.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("https://app.example.com/api/v1/meta/locations?q=napa"),
    );

    expect(response.status).toBe(401);
  });

  it("returns matching Meta locations", async () => {
    mockedSearchMetaLocations.mockResolvedValue([
      {
        id: "12345",
        name: "Napa Valley Welcome Center",
        city: "Napa",
        state: "CA",
        country: "United States",
      },
    ]);

    const response = await GET(
      new Request("https://app.example.com/api/v1/meta/locations?q=napa"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        locations: [
          {
            id: "12345",
            name: "Napa Valley Welcome Center",
            city: "Napa",
            state: "CA",
            country: "United States",
          },
        ],
      },
    });
    expect(mockedResolveMetaAuthForApi).toHaveBeenCalledWith({
      connectionId: undefined,
    });
    expect(mockedSearchMetaLocations).toHaveBeenCalledWith("napa", {
      accessToken: "token",
      instagramUserId: "ig-id",
      graphVersion: "v22.0",
    });
  });
});
