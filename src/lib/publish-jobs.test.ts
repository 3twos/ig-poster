import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublishJobRow } from "@/db/schema";
import {
  appendPublishJobEvent,
  completePublishJobFailure,
  completePublishJobSuccess,
  type AppDb,
} from "@/lib/publish-jobs";

const makeUpdateDb = <T>(rows: T[]) => {
  const chain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.returning.mockResolvedValue(rows);

  const db = {
    update: vi.fn().mockReturnValue(chain),
  } as unknown as AppDb;

  return { db, chain };
};

const baseJob = (): PublishJobRow => ({
  id: "job_1",
  ownerHash: "owner_hash",
  postId: null,
  status: "processing",
  caption: "Caption",
  media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
  publishAt: new Date("2026-03-06T21:00:00.000Z"),
  attempts: 1,
  maxAttempts: 3,
  lastAttemptAt: new Date("2026-03-06T20:00:00.000Z"),
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
  createdAt: new Date("2026-03-06T19:00:00.000Z"),
  updatedAt: new Date("2026-03-06T20:00:00.000Z"),
});

describe("appendPublishJobEvent", () => {
  it("appends event and auto-populates at timestamp", () => {
    const events = appendPublishJobEvent(
      [{ at: "2026-03-06T20:00:00.000Z", type: "created" }],
      { type: "updated", detail: "Changed by user." },
    );
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      type: "updated",
      detail: "Changed by user.",
    });
    expect(typeof events[1]?.at).toBe("string");
  });
});

describe("completePublishJobFailure", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("queues retry with exponential backoff for non-terminal failures", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T21:00:00.000Z"));
    const job = baseJob();
    const { db, chain } = makeUpdateDb([{ ...job, status: "queued" as const }]);

    await completePublishJobFailure(db, job, "upstream failure");

    const setPayload = chain.set.mock.calls[0]?.[0] as {
      status: string;
      publishAt: Date;
      completedAt: Date | null;
      events: Array<{ type: string; detail?: string; attempt?: number }>;
    };
    expect(setPayload.status).toBe("queued");
    expect(setPayload.publishAt.toISOString()).toBe("2026-03-06T21:05:00.000Z");
    expect(setPayload.completedAt).toBeNull();
    expect(setPayload.events.at(-1)).toMatchObject({
      type: "retry-scheduled",
      attempt: 1,
    });
  });

  it("marks job failed when attempts are exhausted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T21:00:00.000Z"));
    const job = {
      ...baseJob(),
      attempts: 3,
      maxAttempts: 3,
      publishAt: new Date("2026-03-06T20:30:00.000Z"),
    };
    const { db, chain } = makeUpdateDb([{ ...job, status: "failed" as const }]);

    await completePublishJobFailure(db, job, "permanent failure");

    const setPayload = chain.set.mock.calls[0]?.[0] as {
      status: string;
      publishAt: Date;
      completedAt: Date | null;
      events: Array<{ type: string; detail?: string; attempt?: number }>;
    };
    expect(setPayload.status).toBe("failed");
    expect(setPayload.publishAt.toISOString()).toBe("2026-03-06T20:30:00.000Z");
    expect(setPayload.completedAt?.toISOString()).toBe("2026-03-06T21:00:00.000Z");
    expect(setPayload.events.at(-1)).toMatchObject({
      type: "failed",
      attempt: 3,
    });
  });
});

describe("completePublishJobSuccess", () => {
  it("stores publish identifiers and marks job as published", async () => {
    const job = baseJob();
    const { db, chain } = makeUpdateDb([{ ...job, status: "published" as const }]);

    await completePublishJobSuccess(db, job, {
      publishId: "publish_1",
      creationId: "create_1",
      children: ["child_1", "child_2"],
    });

    const setPayload = chain.set.mock.calls[0]?.[0] as {
      status: string;
      publishId?: string;
      creationId?: string;
      children?: string[];
      events: Array<{ type: string; detail?: string; attempt?: number }>;
    };
    expect(setPayload).toMatchObject({
      status: "published",
      publishId: "publish_1",
      creationId: "create_1",
      children: ["child_1", "child_2"],
    });
    expect(setPayload.events.at(-1)).toMatchObject({
      type: "published",
      attempt: 1,
    });
  });
});
