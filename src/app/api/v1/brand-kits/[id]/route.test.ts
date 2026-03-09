import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/brand-kits", () => ({
  getBrandKit: vi.fn(),
}));

import { GET } from "@/app/api/v1/brand-kits/[id]/route";
import { resolveActorFromRequest } from "@/services/actors";
import { getBrandKit } from "@/services/brand-kits";

const mockedResolveActor = vi.mocked(resolveActorFromRequest);
const mockedGetBrandKit = vi.mocked(getBrandKit);

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

describe("GET /api/v1/brand-kits/:id", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
    mockedGetBrandKit.mockReset();
  });

  it("returns 404 when the brand kit is missing", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedGetBrandKit.mockResolvedValue(null as never);

    const response = await GET(
      new Request("https://app.example.com/api/v1/brand-kits/kit-1"),
      { params: Promise.resolve({ id: "kit-1" }) },
    );

    expect(response.status).toBe(404);
  });

  it("returns the brand kit resource envelope", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedGetBrandKit.mockResolvedValue({
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
    } as never);

    const response = await GET(
      new Request("https://app.example.com/api/v1/brand-kits/kit-1"),
      { params: Promise.resolve({ id: "kit-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        brandKit: { id: "kit-1", name: "Default", isDefault: true },
      },
    });
  });
});
