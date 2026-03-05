import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/blob-store", () => ({
  isBlobEnabled: vi.fn(),
  listBlobsPaginated: vi.fn(),
  deleteBlob: vi.fn(),
}));

vi.mock("@/lib/meta", () => ({
  getEnvMetaAuth: vi.fn(),
  publishInstagramContent: vi.fn(),
}));

vi.mock("@/lib/meta-auth", () => ({
  getMetaConnection: vi.fn(),
}));

vi.mock("@/lib/app-encryption", () => ({
  requireAppEncryptionSecret: vi.fn(),
}));

vi.mock("@/lib/secure", () => ({
  decryptString: vi.fn(),
}));

import { GET } from "@/app/api/cron/publish/route";
import { deleteBlob, isBlobEnabled, listBlobsPaginated } from "@/lib/blob-store";
import { getEnvMetaAuth, publishInstagramContent } from "@/lib/meta";

const mockedIsBlobEnabled = vi.mocked(isBlobEnabled);
const mockedListBlobsPaginated = vi.mocked(listBlobsPaginated);
const mockedGetEnvMetaAuth = vi.mocked(getEnvMetaAuth);
const mockedPublishInstagramContent = vi.mocked(publishInstagramContent);
const mockedDeleteBlob = vi.mocked(deleteBlob);

describe("GET /api/cron/publish", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("CRON_SECRET", "cron-secret");
  });

  it("returns 401 for invalid bearer token", async () => {
    const req = new Request("https://app.example.com/api/cron/publish", {
      headers: {
        authorization: "Bearer nope",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("publishes due env-auth jobs in pathname order", async () => {
    mockedIsBlobEnabled.mockReturnValue(true);
    mockedGetEnvMetaAuth.mockReturnValue({
      accessToken: "token",
      instagramUserId: "ig-id",
      graphVersion: "v22.0",
    });

    const now = Date.now();
    mockedListBlobsPaginated.mockResolvedValue([
      {
        pathname: `schedules/${now}-b.json`,
        url: "https://blob/b",
        downloadUrl: "https://blob/b?download=1",
        size: 1,
        uploadedAt: new Date(),
        etag: "b",
      },
      {
        pathname: `schedules/${now}-a.json`,
        url: "https://blob/a",
        downloadUrl: "https://blob/a?download=1",
        size: 1,
        uploadedAt: new Date(),
        etag: "a",
      },
    ]);

    const makeJob = (id: string) => ({
      id,
      caption: `Caption ${id}`,
      media: {
        mode: "image",
        imageUrl: "https://cdn.example.com/image.jpg",
      },
      publishAt: new Date(now - 60_000).toISOString(),
      createdAt: new Date(now - 120_000).toISOString(),
      authSource: "env",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/a")) {
          return Promise.resolve({ ok: true, json: async () => makeJob("a") });
        }
        return Promise.resolve({ ok: true, json: async () => makeJob("b") });
      }),
    );

    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      creationId: "c1",
      publishId: "p1",
    });

    const req = new Request("https://app.example.com/api/cron/publish", {
      headers: {
        authorization: "Bearer cron-secret",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ published: 2, errorCount: 0 });

    expect(mockedPublishInstagramContent).toHaveBeenCalledTimes(2);
    expect(mockedPublishInstagramContent.mock.calls[0]?.[0]).toMatchObject({ caption: "Caption a" });
    expect(mockedPublishInstagramContent.mock.calls[1]?.[0]).toMatchObject({ caption: "Caption b" });
    expect(mockedDeleteBlob).toHaveBeenCalledTimes(2);
  });
});
