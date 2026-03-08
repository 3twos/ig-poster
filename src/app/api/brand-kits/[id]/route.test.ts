import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
}));

import { getDb } from "@/db";
import { PUT } from "@/app/api/brand-kits/[id]/route";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

const mockedGetDb = vi.mocked(getDb);
const mockedReadWorkspace = vi.mocked(readWorkspaceSessionFromRequest);

const session = {
  sub: "user-1",
  email: "person@example.com",
  domain: "example.com",
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe("PUT /api/brand-kits/:id", () => {
  beforeEach(() => {
    mockedGetDb.mockReset();
    mockedReadWorkspace.mockReset();
  });

  it("preserves existing logos when a legacy client updates only logoUrl", async () => {
    mockedReadWorkspace.mockResolvedValue(session);

    const returning = vi.fn().mockResolvedValue([
      {
        id: "kit-1",
        ownerHash: "owner",
        name: "Acme",
        brand: null,
        promptConfig: null,
        logos: [
          {
            id: "logo-1",
            name: "Wordmark",
            url: "https://cdn.example.com/wordmark.svg",
          },
          {
            id: "logo-2",
            name: "Icon",
            url: "https://cdn.example.com/icon.svg",
          },
        ],
        logoUrl: "https://cdn.example.com/icon.svg",
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn((payload: unknown) => ({ where, payload }));
    const update = vi.fn(() => ({ set }));

    mockedGetDb.mockReturnValue({
      update,
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/brand-kits/kit-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        logoUrl: "https://cdn.example.com/icon.svg",
      }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: "kit-1" }) });

    expect(res.status).toBe(200);
    expect(set).toHaveBeenCalledTimes(1);
    const updatePayload = set.mock.calls.at(0)?.[0] as Record<string, unknown> | undefined;

    expect(updatePayload).toMatchObject({
      logoUrl: "https://cdn.example.com/icon.svg",
    });
    expect(updatePayload).not.toHaveProperty("logos");
  });
});
