import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/blob", () => ({
  del: vi.fn(),
  put: vi.fn(),
  list: vi.fn(),
}));

import { list } from "@vercel/blob";
import { listBlobsPaginated } from "@/lib/blob-store";

const mockedList = vi.mocked(list);

describe("listBlobsPaginated", () => {
  beforeEach(() => {
    mockedList.mockReset();
  });

  it("walks cursor pages and caps at maxResults", async () => {
    mockedList
      .mockResolvedValueOnce({
        blobs: [
          { url: "u1", downloadUrl: "d1", pathname: "a", size: 1, uploadedAt: new Date(), etag: "e1" },
          { url: "u2", downloadUrl: "d2", pathname: "b", size: 1, uploadedAt: new Date(), etag: "e2" },
        ],
        hasMore: true,
        cursor: "next-1",
      })
      .mockResolvedValueOnce({
        blobs: [
          { url: "u3", downloadUrl: "d3", pathname: "c", size: 1, uploadedAt: new Date(), etag: "e3" },
        ],
        hasMore: false,
      });

    const results = await listBlobsPaginated("schedules/", {
      pageSize: 2,
      maxResults: 3,
    });

    expect(results).toHaveLength(3);
    expect(results.map((b) => b.pathname)).toEqual(["a", "b", "c"]);
    expect(mockedList).toHaveBeenNthCalledWith(1, {
      prefix: "schedules/",
      limit: 2,
      cursor: undefined,
    });
    expect(mockedList).toHaveBeenNthCalledWith(2, {
      prefix: "schedules/",
      limit: 1,
      cursor: "next-1",
    });
  });
});
