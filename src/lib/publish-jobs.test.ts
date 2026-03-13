import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublishJobRow } from "@/db/schema";
import {
  appendPublishJobEvent,
  completePublishJobFailure,
  completePublishJobSuccess,
  deferProcessingPublishJob,
  failQueuedPublishJob,
  getPublishWindowUsage,
  markPostPublished,
  recoverStaleProcessingJobs,
  reserveImmediatePublishJob,
  syncQueuedPublishJobRemoteState,
  STALE_PROCESSING_TIMEOUT_MS,
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

const makeSelectDb = <T>(rows: T[]) => {
  const fromChain = {
    where: vi.fn().mockResolvedValue(rows),
  };
  const selectChain = {
    from: vi.fn().mockReturnValue(fromChain),
  };
  const db = {
    select: vi.fn().mockReturnValue(selectChain),
  } as unknown as AppDb;

  return { db, selectChain, fromChain };
};

const makeMarkPostPublishedDb = (
  publishHistory: Array<{
    publishedAt: string;
    igMediaId?: string;
    igPermalink?: string;
  }> | null,
) => {
  const limit = vi.fn().mockResolvedValue([{ publishHistory }]);
  const selectWhere = vi.fn().mockReturnValue({ limit });
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
  const select = vi.fn().mockReturnValue({ from: selectFrom });
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  const db = {
    select,
    update: vi.fn().mockReturnValue(updateChain),
  } as unknown as AppDb;

  return { db, updateChain };
};

const makeReservationDb = (usageCount: number, rows: PublishJobRow[]) => {
  const usageWhere = vi.fn().mockResolvedValue([{ publishedCount: usageCount }]);
  const usageFrom = vi.fn().mockReturnValue({ where: usageWhere });
  const usageSelect = vi.fn().mockReturnValue({ from: usageFrom });

  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  type ReservationTx = {
    select: typeof usageSelect;
    insert: ReturnType<typeof vi.fn>;
  };
  const tx: ReservationTx = {
    select: usageSelect,
    insert: vi.fn().mockReturnValue(insertChain),
  };
  const transaction = vi.fn(
    async (
      callback: (tx: ReservationTx) => Promise<unknown>,
      config?: unknown,
    ) => {
      void config;
      return callback(tx);
    },
  );
  const db = { transaction } as unknown as AppDb;

  return {
    db,
    tx,
    transaction,
    insertChain,
    usageWhere,
  };
};

const baseJob = (): PublishJobRow => ({
  id: "job_1",
  ownerHash: "owner_hash",
  postId: null,
  destination: "instagram",
  remoteAuthority: "app_managed",
  accountKey: "page_1:ig-id",
  pageId: "page_1",
  instagramUserId: "ig-id",
  status: "processing",
  caption: "Caption",
  firstComment: null,
  locationId: null,
  userTags: null,
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

describe("getPublishWindowUsage", () => {
  it("calculates remaining 24h publish capacity", async () => {
    const now = new Date("2026-03-07T21:00:00.000Z");
    const { db } = makeSelectDb([{ publishedCount: 12 }]);

    const usage = await getPublishWindowUsage(db, "owner_hash", now);

    expect(usage).toMatchObject({
      limit: 50,
      used: 12,
      remaining: 38,
      windowStart: new Date("2026-03-06T21:00:00.000Z"),
    });
  });
});

describe("markPostPublished", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not append Facebook publishes to legacy Instagram history", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T16:00:00.000Z"));
    const existingPublishHistory = [
      {
        publishedAt: "2026-03-12T16:00:00.000Z",
        igMediaId: "ig_media_1",
      },
    ];
    const { db, updateChain } = makeMarkPostPublishedDb(existingPublishHistory);

    await markPostPublished(
      db,
      "owner_hash",
      "post_1",
      "page_post_1",
      "facebook",
    );

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        publishHistory: existingPublishHistory,
      }),
    );
  });
});

describe("reserveImmediatePublishJob", () => {
  it("reserves an immediate slot when usage is below limit", async () => {
    const job = baseJob();
    const { db, transaction, insertChain } = makeReservationDb(12, [job]);

    const reserved = await reserveImmediatePublishJob(db, {
      ownerHash: "owner_hash",
      postId: "post_1",
      caption: "Now",
      media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      authSource: "oauth",
      connectionId: "conn_1",
    });

    expect(reserved?.id).toBe(job.id);
    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "serializable" }),
    );
    expect(insertChain.values).toHaveBeenCalledTimes(1);
  });

  it("returns null when usage has reached the rolling limit", async () => {
    const { db, tx } = makeReservationDb(50, []);

    const reserved = await reserveImmediatePublishJob(db, {
      ownerHash: "owner_hash",
      caption: "Now",
      media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      authSource: "oauth",
      connectionId: "conn_1",
    });

    expect(reserved).toBeNull();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("does not apply the Instagram rolling limit to Facebook reservations", async () => {
    const job = {
      ...baseJob(),
      destination: "facebook" as const,
    };
    const { db, tx } = makeReservationDb(50, [job]);

    const reserved = await reserveImmediatePublishJob(db, {
      ownerHash: "owner_hash",
      destination: "facebook",
      caption: "Now",
      media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      authSource: "oauth",
      connectionId: "conn_1",
    });

    expect(reserved?.destination).toBe("facebook");
    expect(tx.insert).toHaveBeenCalledTimes(1);
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

  it("appends warning detail when publish completed with non-blocking warning", async () => {
    const job = baseJob();
    const { db, chain } = makeUpdateDb([{ ...job, status: "published" as const }]);

    await completePublishJobSuccess(db, job, {
      publishId: "publish_1",
      warningDetail: "Could not post first comment.",
    });

    const setPayload = chain.set.mock.calls[0]?.[0] as {
      events: Array<{ type: string; detail?: string; attempt?: number }>;
    };
    expect(setPayload.events.at(-1)?.detail).toContain(
      "Warning: Could not post first comment.",
    );
  });
});

describe("syncQueuedPublishJobRemoteState", () => {
  it("stores remote identifiers on a queued job", async () => {
    const job = {
      ...baseJob(),
      status: "queued" as const,
      attempts: 0,
      lastAttemptAt: null,
    };
    const { db, chain } = makeUpdateDb([{ ...job, publishId: "page_1_1" }]);

    await syncQueuedPublishJobRemoteState(db, job, {
      publishId: "page_1_1",
      creationId: "photo_1",
    });

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        publishId: "page_1_1",
        creationId: "photo_1",
        lastError: null,
        updatedAt: expect.any(Date),
        events: expect.arrayContaining([
          expect.objectContaining({
            type: "updated",
            detail: "Remote schedule synced as page_1_1.",
          }),
        ]),
      }),
    );
  });
});

describe("failQueuedPublishJob", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks a queued job failed when remote schedule setup fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T16:00:00.000Z"));
    const job = {
      ...baseJob(),
      status: "queued" as const,
      attempts: 0,
      lastAttemptAt: null,
    };
    const { db, chain } = makeUpdateDb([{ ...job, status: "failed" as const }]);

    await failQueuedPublishJob(db, job, "Meta schedule failed");

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        lastError: "Meta schedule failed",
        completedAt: new Date("2026-03-13T16:00:00.000Z"),
        updatedAt: new Date("2026-03-13T16:00:00.000Z"),
        events: expect.arrayContaining([
          expect.objectContaining({
            type: "failed",
            detail: "Remote schedule setup failed: Meta schedule failed",
          }),
        ]),
      }),
    );
  });
});

describe("deferProcessingPublishJob", () => {
  it("requeues processing job without consuming an attempt", async () => {
    const job = {
      ...baseJob(),
      attempts: 2,
    };
    const { db, chain } = makeUpdateDb([{ ...job, status: "queued" as const }]);
    const nextPublishAt = new Date("2026-03-06T21:30:00.000Z");

    await deferProcessingPublishJob(
      db,
      job,
      nextPublishAt,
      "Deferred by publish window limit (50/50 in last 24h).",
    );

    const setPayload = chain.set.mock.calls[0]?.[0] as {
      status: string;
      publishAt: Date;
      attempts: number;
      lastAttemptAt: Date | null;
      completedAt: Date | null;
      events: Array<{ type: string; detail?: string; attempt?: number }>;
    };
    expect(setPayload.status).toBe("queued");
    expect(setPayload.publishAt.toISOString()).toBe("2026-03-06T21:30:00.000Z");
    expect(setPayload.attempts).toBe(1);
    expect(setPayload.lastAttemptAt).toBeNull();
    expect(setPayload.completedAt).toBeNull();
    expect(setPayload.events.at(-1)).toMatchObject({
      type: "retry-scheduled",
      attempt: 1,
    });
  });
});

describe("recoverStaleProcessingJobs", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks stale processing jobs failed for manual review", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-06T21:00:00.000Z");
    vi.setSystemTime(now);
    const job = {
      ...baseJob(),
      attempts: 2,
      lastAttemptAt: new Date(now.getTime() - STALE_PROCESSING_TIMEOUT_MS - 60_000),
      updatedAt: new Date(now.getTime() - STALE_PROCESSING_TIMEOUT_MS - 60_000),
    };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([job]),
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ ...job, status: "failed" as const }]),
    };
    const db = {
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as AppDb;

    const recovered = await recoverStaleProcessingJobs(db, now);

    expect(recovered).toHaveLength(1);
    const setPayload = updateChain.set.mock.calls[0]?.[0] as {
      status: string;
      lastError: string;
      completedAt: Date;
      events: Array<{ type: string; detail?: string; attempt?: number; at?: string }>;
    };
    expect(setPayload.status).toBe("failed");
    expect(setPayload.completedAt.toISOString()).toBe(now.toISOString());
    expect(setPayload.lastError).toContain("marked failed to avoid duplicate publish risk");
    expect(setPayload.events.at(-1)).toMatchObject({
      type: "failed",
      attempt: 2,
      at: now.toISOString(),
    });
  });
});
