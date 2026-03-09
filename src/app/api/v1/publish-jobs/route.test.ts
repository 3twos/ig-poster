import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/publish-jobs", () => ({
  listPublishJobs: vi.fn(),
}));

import { GET } from "@/app/api/v1/publish-jobs/route";
import { resolveActorFromRequest } from "@/services/actors";
import { listPublishJobs } from "@/services/publish-jobs";

const mockedResolveActor = vi.mocked(resolveActorFromRequest);
const mockedListPublishJobs = vi.mocked(listPublishJobs);

const actor = {
  type: "workspace-user" as const,
  subjectId: "user-1",
  email: "person@example.com",
  domain: "example.com",
  ownerHash: "hash",
  authSource: "bearer" as const,
  scopes: ["queue:read", "queue:write"],
  issuedAt: "2026-03-08T10:00:00.000Z",
  expiresAt: "2026-03-08T11:00:00.000Z",
};

describe("GET /api/v1/publish-jobs", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
    mockedListPublishJobs.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockedResolveActor.mockResolvedValue(null);

    const response = await GET(
      new Request("https://app.example.com/api/v1/publish-jobs"),
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid query parameters", async () => {
    mockedResolveActor.mockResolvedValue(actor);

    const response = await GET(
      new Request("https://app.example.com/api/v1/publish-jobs?status=broken"),
    );

    expect(response.status).toBe(400);
  });

  it("returns a versioned publish jobs envelope", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedListPublishJobs.mockResolvedValue([
      {
        id: "job-1",
        ownerHash: "hash",
        postId: "post-1",
        status: "queued",
        caption: "Launch day",
        firstComment: null,
        locationId: null,
        userTags: null,
        media: { mode: "image", imageUrl: "https://cdn.example.com/post.jpg" },
        publishAt: new Date("2026-03-10T18:30:00.000Z"),
        attempts: 0,
        maxAttempts: 3,
        lastAttemptAt: null,
        lastError: null,
        authSource: "oauth",
        connectionId: null,
        outcomeContext: null,
        publishId: null,
        creationId: null,
        children: null,
        completedAt: null,
        canceledAt: null,
        events: [],
        createdAt: new Date("2026-03-08T10:00:00.000Z"),
        updatedAt: new Date("2026-03-08T11:00:00.000Z"),
      },
    ] as never);

    const response = await GET(
      new Request(
        "https://app.example.com/api/v1/publish-jobs?status=queued,failed&limit=5",
      ),
    );

    expect(mockedListPublishJobs).toHaveBeenCalledWith(actor, {
      statuses: ["queued", "failed"],
      limit: 5,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        jobs: [{ id: "job-1", status: "queued", postId: "post-1" }],
      },
    });
  });
});
