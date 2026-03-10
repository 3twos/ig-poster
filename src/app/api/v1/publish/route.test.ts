import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

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

vi.mock("@/lib/meta-media-preflight", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/meta-media-preflight")
  >("@/lib/meta-media-preflight");
  return {
    ...actual,
    preflightMetaMediaForPublish: vi.fn(),
  };
});

vi.mock("@/lib/publish-jobs", () => ({
  completePublishJobFailure: vi.fn(),
  completePublishJobSuccess: vi.fn(),
  createPublishJob: vi.fn(),
  markPostPublished: vi.fn(),
  reserveImmediatePublishJob: vi.fn(),
}));

vi.mock("@/lib/blob-store", () => ({
  isBlobEnabled: vi.fn(),
  putJson: vi.fn(),
}));

vi.mock("@/lib/meta", async () => {
  const actual = await vi.importActual<typeof import("@/lib/meta")>(
    "@/lib/meta",
  );
  return {
    ...actual,
    publishInstagramContent: vi.fn(),
    publishInstagramFirstComment: vi.fn(),
  };
});

import { POST } from "@/app/api/v1/publish/route";
import { getDb } from "@/db";
import { isBlobEnabled } from "@/lib/blob-store";
import { publishInstagramContent } from "@/lib/meta";
import { preflightMetaMediaForPublish } from "@/lib/meta-media-preflight";
import {
  completePublishJobSuccess,
  reserveImmediatePublishJob,
} from "@/lib/publish-jobs";
import { resolveActorFromRequest } from "@/services/actors";
import { resolveMetaAuthForApi } from "@/services/meta-auth";

const mockedResolveActorFromRequest = vi.mocked(resolveActorFromRequest);
const mockedResolveMetaAuthForApi = vi.mocked(resolveMetaAuthForApi);
const mockedPreflightMetaMedia = vi.mocked(preflightMetaMediaForPublish);
const mockedReserveImmediatePublishJob = vi.mocked(reserveImmediatePublishJob);
const mockedPublishInstagramContent = vi.mocked(publishInstagramContent);
const mockedCompletePublishJobSuccess = vi.mocked(completePublishJobSuccess);
const mockedIsBlobEnabled = vi.mocked(isBlobEnabled);
const mockedGetDb = vi.mocked(getDb);

const actor = {
  ownerHash: "owner_hash",
  email: "person@example.com",
  domain: "example.com",
} as never;

describe("POST /api/v1/publish", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedResolveActorFromRequest.mockResolvedValue(actor);
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
    mockedPreflightMetaMedia.mockResolvedValue(undefined);
    mockedGetDb.mockReturnValue({} as ReturnType<typeof getDb>);
    mockedReserveImmediatePublishJob.mockResolvedValue({
      id: "job_1",
      ownerHash: "owner_hash",
      postId: null,
      status: "processing",
      caption: "Now",
      firstComment: null,
      locationId: null,
      userTags: null,
      media: { mode: "image" as const, imageUrl: "https://cdn.example.com/image.jpg" },
      publishAt: new Date("2026-03-09T23:00:00.000Z"),
      attempts: 1,
      maxAttempts: 1,
      lastAttemptAt: new Date("2026-03-09T23:00:00.000Z"),
      lastError: null,
      authSource: "oauth",
      connectionId: "conn_1",
      outcomeContext: null,
      publishId: null,
      creationId: null,
      children: null,
      completedAt: null,
      canceledAt: null,
      events: [],
      createdAt: new Date("2026-03-09T23:00:00.000Z"),
      updatedAt: new Date("2026-03-09T23:00:00.000Z"),
    } as never);
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      publishId: "publish_1",
      creationId: "creation_1",
    });
    mockedCompletePublishJobSuccess.mockResolvedValue({} as never);
    mockedIsBlobEnabled.mockReturnValue(false);
  });

  it("requires an authenticated actor", async () => {
    mockedResolveActorFromRequest.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("https://app.example.com/api/v1/publish", {
        method: "POST",
        body: JSON.stringify({
          caption: "Caption",
          media: {
            mode: "image",
            imageUrl: "https://cdn.example.com/image.jpg",
          },
        }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("supports dry-run validation without publishing", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/v1/publish", {
        method: "POST",
        body: JSON.stringify({
          caption: "Caption",
          dryRun: true,
          media: {
            mode: "image",
            imageUrl: "https://cdn.example.com/image.jpg",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        publish: {
          status: "validated",
          mode: "image",
          authSource: "oauth",
          scheduled: false,
        },
      },
    });
    expect(mockedPreflightMetaMedia).toHaveBeenCalledTimes(1);
    expect(mockedReserveImmediatePublishJob).not.toHaveBeenCalled();
    expect(mockedPublishInstagramContent).not.toHaveBeenCalled();
  });

  it("publishes immediately for valid direct media payloads", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/v1/publish", {
        method: "POST",
        body: JSON.stringify({
          caption: "Caption",
          firstComment: "First comment",
          media: {
            mode: "image",
            imageUrl: "https://cdn.example.com/image.jpg",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        publish: {
          status: "published",
          mode: "image",
          publishId: "publish_1",
          creationId: "creation_1",
        },
      },
    });
    expect(mockedReserveImmediatePublishJob).toHaveBeenCalledTimes(1);
    expect(mockedPublishInstagramContent).toHaveBeenCalledWith(
      {
        mode: "image",
        imageUrl: "https://cdn.example.com/image.jpg",
        caption: "Caption",
        locationId: undefined,
        userTags: undefined,
      },
      expect.anything(),
    );
  });
});
