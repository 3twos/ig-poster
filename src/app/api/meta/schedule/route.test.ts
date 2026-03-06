import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
}));

vi.mock("@/lib/meta-auth", () => ({
  resolveMetaAuthFromRequest: vi.fn(),
}));

vi.mock("@/lib/publish-jobs", () => ({
  createPublishJob: vi.fn(),
  markPostPublished: vi.fn(),
}));

vi.mock("@/lib/blob-store", () => ({
  isBlobEnabled: vi.fn(),
  putJson: vi.fn(),
}));

vi.mock("@/lib/meta", async () => {
  const actual = await vi.importActual<typeof import("@/lib/meta")>("@/lib/meta");
  return {
    ...actual,
    publishInstagramContent: vi.fn(),
  };
});

import { POST } from "@/app/api/meta/schedule/route";
import { getDb } from "@/db";
import { publishInstagramContent } from "@/lib/meta";
import { resolveMetaAuthFromRequest } from "@/lib/meta-auth";
import { createPublishJob, markPostPublished } from "@/lib/publish-jobs";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

const mockedGetDb = vi.mocked(getDb);
const mockedReadWorkspace = vi.mocked(readWorkspaceSessionFromRequest);
const mockedResolveMetaAuth = vi.mocked(resolveMetaAuthFromRequest);
const mockedCreatePublishJob = vi.mocked(createPublishJob);
const mockedPublishInstagramContent = vi.mocked(publishInstagramContent);
const mockedMarkPostPublished = vi.mocked(markPostPublished);

const session = {
  sub: "user-1",
  email: "person@example.com",
  domain: "example.com",
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe("POST /api/meta/schedule", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedReadWorkspace.mockResolvedValue(session);
    mockedResolveMetaAuth.mockResolvedValue({
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
    mockedGetDb.mockReturnValue({} as ReturnType<typeof getDb>);
  });

  it("returns 401 when workspace auth is missing", async () => {
    mockedReadWorkspace.mockResolvedValue(null);

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: "Hello",
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("queues a scheduled publish job", async () => {
    const publishAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    mockedCreatePublishJob.mockResolvedValue({
      id: "job_1",
      publishAt: new Date(publishAt),
    } as Awaited<ReturnType<typeof createPublishJob>>);

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: "Scheduled caption",
        publishAt,
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: "scheduled",
      id: "job_1",
    });
    expect(mockedCreatePublishJob).toHaveBeenCalledTimes(1);
    expect(mockedPublishInstagramContent).not.toHaveBeenCalled();
  });

  it("publishes immediately and updates linked post", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "post_1" }]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
    } as unknown as ReturnType<typeof getDb>);
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      creationId: "create_1",
      publishId: "publish_1",
    });

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        postId: "post_1",
        caption: "Now",
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: "published",
      publishId: "publish_1",
    });
    expect(mockedPublishInstagramContent).toHaveBeenCalledTimes(1);
    expect(mockedMarkPostPublished).toHaveBeenCalledTimes(1);
  });
});
