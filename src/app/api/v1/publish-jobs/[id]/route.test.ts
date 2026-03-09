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
    getPublishJob: vi.fn(),
    updatePublishJob: vi.fn(),
  };
});

import { GET, PATCH } from "@/app/api/v1/publish-jobs/[id]/route";
import { resolveActorFromRequest } from "@/services/actors";
import {
  getPublishJob,
  PublishJobServiceError,
  updatePublishJob,
} from "@/services/publish-jobs";

const mockedResolveActor = vi.mocked(resolveActorFromRequest);
const mockedGetPublishJob = vi.mocked(getPublishJob);
const mockedUpdatePublishJob = vi.mocked(updatePublishJob);

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

describe("GET /api/v1/publish-jobs/:id", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
    mockedGetPublishJob.mockReset();
    mockedUpdatePublishJob.mockReset();
  });

  it("returns 404 when the publish job is missing", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedGetPublishJob.mockResolvedValue(null as never);

    const response = await GET(
      new Request("https://app.example.com/api/v1/publish-jobs/job-1"),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(404);
  });

  it("returns the publish job resource envelope", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedGetPublishJob.mockResolvedValue({
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
    } as never);

    const response = await GET(
      new Request("https://app.example.com/api/v1/publish-jobs/job-1"),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        job: { id: "job-1", status: "queued", postId: "post-1" },
      },
    });
  });
});

describe("PATCH /api/v1/publish-jobs/:id", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
    mockedGetPublishJob.mockReset();
    mockedUpdatePublishJob.mockReset();
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
      new Request("https://app.example.com/api/v1/publish-jobs/job-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "broken" }),
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(400);
  });

  it("maps service conflicts to a versioned error envelope", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedUpdatePublishJob.mockRejectedValue(
      new PublishJobServiceError(409, "Cannot modify a published job."),
    );

    const response = await PATCH(
      new Request("https://app.example.com/api/v1/publish-jobs/job-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "Cannot modify a published job.",
      },
    });
  });

  it("returns the updated publish job resource envelope", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedUpdatePublishJob.mockResolvedValue({
      id: "job-1",
      ownerHash: "hash",
      postId: "post-1",
      status: "canceled",
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
      canceledAt: new Date("2026-03-08T12:00:00.000Z"),
      events: [],
      createdAt: new Date("2026-03-08T10:00:00.000Z"),
      updatedAt: new Date("2026-03-08T12:00:00.000Z"),
    } as never);

    const response = await PATCH(
      new Request("https://app.example.com/api/v1/publish-jobs/job-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        job: { id: "job-1", status: "canceled" },
      },
    });
  });
});
