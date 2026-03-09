import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/brand-kits", () => ({
  listBrandKits: vi.fn(),
}));

import { GET } from "@/app/api/v1/brand-kits/route";
import { resolveActorFromRequest } from "@/services/actors";
import { listBrandKits } from "@/services/brand-kits";

const mockedResolveActor = vi.mocked(resolveActorFromRequest);
const mockedListBrandKits = vi.mocked(listBrandKits);

const actor = {
  type: "workspace-user" as const,
  subjectId: "user-1",
  email: "person@example.com",
  domain: "example.com",
  ownerHash: "hash",
  authSource: "bearer" as const,
  scopes: ["posts:read", "posts:write"],
  issuedAt: "2026-03-08T10:00:00.000Z",
  expiresAt: "2026-03-08T11:00:00.000Z",
};

describe("GET /api/v1/brand-kits", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
    mockedListBrandKits.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockedResolveActor.mockResolvedValue(null);

    const response = await GET(
      new Request("https://app.example.com/api/v1/brand-kits"),
    );

    expect(response.status).toBe(401);
  });

  it("returns a versioned brand kits envelope", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedListBrandKits.mockResolvedValue([
      {
        id: "kit-1",
        ownerHash: "hash",
        name: "Default",
        brand: null,
        promptConfig: null,
        logos: [],
        logoUrl: null,
        isDefault: true,
        createdAt: new Date("2026-03-08T10:00:00.000Z"),
        updatedAt: new Date("2026-03-08T11:00:00.000Z"),
      },
    ] as never);

    const response = await GET(
      new Request("https://app.example.com/api/v1/brand-kits"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        brandKits: [{ id: "kit-1", name: "Default", isDefault: true }],
      },
    });
  });
});
