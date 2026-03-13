import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/publish-jobs", async () => {
  const actual = await vi.importActual<typeof import("@/services/publish-jobs")>(
    "@/services/publish-jobs",
  );

  return {
    ...actual,
    updatePublishJob: vi.fn(),
  };
});

import { PATCH } from "@/app/api/publish-jobs/[id]/route";
import { resolveActorFromRequest } from "@/services/actors";
import {
  MetaMediaPreflightError,
  PublishJobServiceError,
  updatePublishJob,
} from "@/services/publish-jobs";

const mockedResolveActor = vi.mocked(resolveActorFromRequest);
const mockedUpdatePublishJob = vi.mocked(updatePublishJob);

const actor = {
  type: "workspace-user" as const,
  subjectId: "user-1",
  email: "person@example.com",
  domain: "example.com",
  ownerHash: "hash",
  authSource: "cookie" as const,
  scopes: ["queue:read", "queue:write"],
  issuedAt: "2026-03-08T10:00:00.000Z",
  expiresAt: "2026-03-08T11:00:00.000Z",
};

describe("PATCH /api/publish-jobs/:id", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
    mockedUpdatePublishJob.mockReset();
  });

  it("returns 401 when workspace session is missing", async () => {
    mockedResolveActor.mockResolvedValue(null);

    const response = await PATCH(
      new Request("https://app.example.com/api/publish-jobs/job-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(401);
  });

  it("returns service conflicts directly", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedUpdatePublishJob.mockRejectedValue(
      new PublishJobServiceError(
        409,
        "Retry now is not available for Meta-synced Facebook schedules. Create a new schedule instead.",
      ),
    );

    const response = await PATCH(
      new Request("https://app.example.com/api/publish-jobs/job-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "retry-now" }),
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "Retry now is not available for Meta-synced Facebook schedules. Create a new schedule instead.",
    });
  });

  it("returns 400 for invalid request bodies", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedUpdatePublishJob.mockRejectedValue(
      new z.ZodError([
        {
          code: "custom",
          path: ["action"],
          message: "bad",
        },
      ]),
    );

    const response = await PATCH(
      new Request("https://app.example.com/api/publish-jobs/job-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "broken" }),
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for media preflight failures", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedUpdatePublishJob.mockRejectedValue(
      new MetaMediaPreflightError("Image URL must use HTTPS."),
    );

    const response = await PATCH(
      new Request("https://app.example.com/api/publish-jobs/job-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
        }),
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(400);
  });

  it("returns the updated publish job row", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedUpdatePublishJob.mockResolvedValue({
      id: "job-1",
      ownerHash: "hash",
      postId: "post-1",
      destination: "facebook",
      remoteAuthority: "remote_authoritative",
      accountKey: "page-id:ig-id",
      pageId: "page-id",
      instagramUserId: "ig-id",
      status: "queued",
      caption: "Updated caption",
      firstComment: null,
      locationId: null,
      userTags: null,
      media: { mode: "image", imageUrl: "https://cdn.example.com/post.jpg" },
      publishAt: new Date("2026-03-20T18:30:00.000Z"),
      attempts: 0,
      maxAttempts: 3,
      lastAttemptAt: null,
      lastError: null,
      authSource: "oauth",
      connectionId: "conn-1",
      outcomeContext: null,
      publishId: "page_1_1",
      creationId: "photo_1",
      children: null,
      completedAt: null,
      canceledAt: null,
      events: [],
      createdAt: new Date("2026-03-08T10:00:00.000Z"),
      updatedAt: new Date("2026-03-08T12:00:00.000Z"),
    } as never);

    const response = await PATCH(
      new Request("https://app.example.com/api/publish-jobs/job-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          caption: "Updated caption",
        }),
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "job-1",
      destination: "facebook",
      remoteAuthority: "remote_authoritative",
      caption: "Updated caption",
    });
  });
});
