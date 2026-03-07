import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
}));

import { PATCH } from "@/app/api/publish-jobs/[id]/route";
import { getDb } from "@/db";
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

const baseJob = {
  id: "job_1",
  ownerHash: "owner_hash",
  postId: null,
  status: "failed" as const,
  caption: "Caption",
  media: { mode: "image" as const, imageUrl: "https://cdn.example.com/image.jpg" },
  publishAt: new Date("2026-03-06T21:00:00.000Z"),
  attempts: 3,
  maxAttempts: 3,
  lastAttemptAt: new Date("2026-03-06T20:00:00.000Z"),
  lastError: "boom",
  authSource: "oauth",
  connectionId: "conn_1",
  outcomeContext: null,
  publishId: null,
  creationId: null,
  children: null,
  completedAt: new Date("2026-03-06T20:00:00.000Z"),
  canceledAt: null,
  events: [],
  createdAt: new Date("2026-03-06T19:00:00.000Z"),
  updatedAt: new Date("2026-03-06T20:00:00.000Z"),
};

describe("PATCH /api/publish-jobs/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when workspace session is missing", async () => {
    mockedReadWorkspace.mockResolvedValue(null);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when publish job is not found", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 409 when cancel update loses race", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ ...baseJob, status: "queued" }]),
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: "Publish job state changed concurrently. Refresh and try again.",
    });
  });

  it("resets attempts when rescheduling a failed job", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([baseJob]),
    };
    const updated = {
      ...baseJob,
      status: "queued" as const,
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      completedAt: null,
      publishAt: new Date("2026-03-06T22:00:00.000Z"),
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updated]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "reschedule",
        publishAt: "2026-03-06T22:00:00.000Z",
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(200);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        completedAt: null,
      }),
    );
  });

  it("queues immediate retry for failed jobs", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([baseJob]),
    };
    const updated = {
      ...baseJob,
      status: "queued" as const,
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      completedAt: null,
      publishAt: new Date(),
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updated]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "retry-now",
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(200);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "queued",
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        completedAt: null,
        publishAt: expect.any(Date),
      }),
    );
  });

  it("returns 409 when retry-now is used on non-failed job", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ ...baseJob, status: "queued" }]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn(),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "retry-now",
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(409);
  });

  it("returns 400 for invalid payload", async () => {
    mockedReadWorkspace.mockResolvedValue(session);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "edit" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(400);
  });

  it("resets attempts when editing a failed job", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([baseJob]),
    };
    const updated = {
      ...baseJob,
      status: "queued" as const,
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      completedAt: null,
      caption: "Updated",
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updated]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "edit", caption: "Updated" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(200);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        completedAt: null,
      }),
    );
  });

  it("returns 500 for unexpected server errors", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    mockedGetDb.mockImplementation(() => {
      throw new Error("db down");
    });

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(500);
  });
});
