import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
}));

vi.mock("@/lib/blob-store", () => ({
  buildBlobPath: vi.fn(),
  isBlobEnabled: vi.fn(),
}));

import { put } from "@vercel/blob";

import { buildBlobPath, isBlobEnabled } from "@/lib/blob-store";
import {
  normalizeAssetFolder,
  uploadAsset,
} from "@/services/assets";

const mockedPut = vi.mocked(put);
const mockedBuildBlobPath = vi.mocked(buildBlobPath);
const mockedIsBlobEnabled = vi.mocked(isBlobEnabled);

describe("uploadAsset", () => {
  beforeEach(() => {
    mockedPut.mockReset();
    mockedBuildBlobPath.mockReset();
    mockedIsBlobEnabled.mockReset();
  });

  it("normalizes unknown folders back to assets", () => {
    expect(normalizeAssetFolder("other")).toBe("assets");
    expect(normalizeAssetFolder("videos")).toBe("videos");
  });

  it("uploads an allowed file to blob storage", async () => {
    mockedIsBlobEnabled.mockReturnValue(true);
    mockedBuildBlobPath.mockReturnValue("assets/123-photo.png");
    mockedPut.mockResolvedValue({
      url: "https://blob.example.com/photo.png",
      pathname: "assets/123-photo.png",
    } as never);

    const uploaded = await uploadAsset(
      new File(["img"], "photo.png", { type: "image/png" }),
      "assets",
    );

    expect(mockedPut).toHaveBeenCalledWith(
      "assets/123-photo.png",
      expect.any(File),
      expect.objectContaining({
        access: "public",
        contentType: "image/png",
      }),
    );
    expect(uploaded).toMatchObject({
      id: "assets/123-photo.png",
      folder: "assets",
      contentType: "image/png",
      url: "https://blob.example.com/photo.png",
    });
  });

  it("rejects uploads when blob storage is disabled", async () => {
    mockedIsBlobEnabled.mockReturnValue(false);

    await expect(
      uploadAsset(new File(["img"], "photo.png", { type: "image/png" }), "assets"),
    ).rejects.toMatchObject({
      status: 503,
      message: "Blob storage is not configured (BLOB_READ_WRITE_TOKEN missing).",
    });
  });
});
