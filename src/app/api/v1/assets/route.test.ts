import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/assets", async () => {
  const actual = await vi.importActual<typeof import("@/services/assets")>(
    "@/services/assets",
  );

  return {
    ...actual,
    uploadAsset: vi.fn(),
  };
});

import { POST } from "@/app/api/v1/assets/route";
import { resolveActorFromRequest } from "@/services/actors";
import { AssetUploadServiceError, uploadAsset } from "@/services/assets";

const mockedResolveActor = vi.mocked(resolveActorFromRequest);
const mockedUploadAsset = vi.mocked(uploadAsset);

const actor = {
  type: "workspace-user" as const,
  subjectId: "user-1",
  email: "person@example.com",
  domain: "example.com",
  ownerHash: "hash",
  authSource: "bearer" as const,
  scopes: ["assets:write"],
  issuedAt: "2026-03-08T10:00:00.000Z",
  expiresAt: "2026-03-08T11:00:00.000Z",
};

describe("POST /api/v1/assets", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
    mockedUploadAsset.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockedResolveActor.mockResolvedValue(null);

    const formData = new FormData();
    formData.set("file", new File(["img"], "photo.png", { type: "image/png" }));

    const response = await POST(
      new Request("https://app.example.com/api/v1/assets", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(401);
  });

  it("maps upload validation errors to a versioned envelope", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedUploadAsset.mockRejectedValue(
      new AssetUploadServiceError(413, "File too large. Max 120MB."),
    );

    const formData = new FormData();
    formData.set("file", new File(["img"], "photo.png", { type: "image/png" }));
    formData.set("folder", "assets");

    const response = await POST(
      new Request("https://app.example.com/api/v1/assets", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "File too large. Max 120MB.",
      },
    });
  });

  it("returns a versioned asset envelope", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedUploadAsset.mockResolvedValue({
      id: "assets/123-photo.png",
      name: "photo.png",
      url: "https://blob.example.com/photo.png",
      pathname: "assets/123-photo.png",
      size: 3,
      folder: "assets",
      contentType: "image/png",
    });

    const formData = new FormData();
    formData.set("file", new File(["img"], "photo.png", { type: "image/png" }));
    formData.set("folder", "assets");

    const response = await POST(
      new Request("https://app.example.com/api/v1/assets", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        asset: {
          id: "assets/123-photo.png",
          name: "photo.png",
          folder: "assets",
        },
      },
    });
  });
});
