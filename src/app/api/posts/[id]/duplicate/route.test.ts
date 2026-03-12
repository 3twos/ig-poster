import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/posts", () => ({
  duplicatePost: vi.fn(),
}));

vi.mock("@/services/post-destinations", () => ({
  getStoredPostDestinations: vi.fn(),
}));

import { POST } from "@/app/api/posts/[id]/duplicate/route";
import { resolveActorFromRequest } from "@/services/actors";
import { getStoredPostDestinations } from "@/services/post-destinations";
import { duplicatePost } from "@/services/posts";

const mockedResolveActorFromRequest = vi.mocked(resolveActorFromRequest);
const mockedDuplicatePost = vi.mocked(duplicatePost);
const mockedGetStoredPostDestinations = vi.mocked(getStoredPostDestinations);

const actor = {
  ownerHash: "owner_hash",
  email: "person@example.com",
  domain: "example.com",
  authSource: "cookie",
} as never;

const instagramDestination = {
  id: "dest_1",
  postId: "copy_1",
  destination: "instagram",
  enabled: true,
  syncMode: "app_managed",
  desiredState: "draft",
  remoteState: "draft",
  caption: "Caption",
  firstComment: "First comment",
  locationId: "123",
  userTags: null,
  publishAt: null,
  remoteObjectId: null,
  remoteContainerId: null,
  remotePermalink: null,
  remoteStatePayload: {},
  lastSyncedAt: null,
  lastError: null,
  createdAt: new Date("2026-03-12T18:00:00.000Z"),
  updatedAt: new Date("2026-03-12T18:00:00.000Z"),
} as const;

const makeDuplicatedRow = () => ({
  id: "copy_1",
  title: "Original title Copy",
  status: "draft",
  publishSettings: {
    caption: "Caption",
    firstComment: "First comment",
    locationId: "123",
    reelShareToFeed: true,
  },
  publishHistory: [],
});

describe("POST /api/posts/:id/duplicate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedResolveActorFromRequest.mockResolvedValue(actor);
    mockedGetStoredPostDestinations.mockResolvedValue([]);
  });

  it("returns 401 when auth is missing", async () => {
    mockedResolveActorFromRequest.mockResolvedValue(null);

    const req = new Request("https://app.example.com/api/posts/p1/duplicate", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(401);
  });

  it("duplicates the post into a fresh draft copy", async () => {
    mockedDuplicatePost.mockResolvedValue(makeDuplicatedRow() as never);
    mockedGetStoredPostDestinations.mockResolvedValue([instagramDestination] as never);

    const req = new Request("https://app.example.com/api/posts/p1/duplicate", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
    expect(mockedDuplicatePost).toHaveBeenCalledWith(actor, "p1");
    await expect(res.json()).resolves.toMatchObject({
      id: "copy_1",
      post: {
        id: "copy_1",
        title: "Original title Copy",
        status: "draft",
        destinations: expect.arrayContaining([
          expect.objectContaining({ destination: "instagram" }),
        ]),
      },
    });
  });
});
