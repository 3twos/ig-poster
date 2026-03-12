import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/meta", () => ({
  publishInstagramContent: vi.fn(),
  publishInstagramFirstComment: vi.fn(),
}));

import {
  publishInstagramContent,
  publishInstagramFirstComment,
} from "@/lib/meta";
import {
  executeImmediateInstagramPublish,
  executePublishJob,
} from "@/services/publish-executor";

const mockedPublishInstagramContent = vi.mocked(publishInstagramContent);
const mockedPublishInstagramFirstComment = vi.mocked(publishInstagramFirstComment);

const auth = {
  accessToken: "token",
  instagramUserId: "ig-id",
  pageId: "page_1",
  graphVersion: "v22.0",
} as const;

describe("publish-executor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("publishes Instagram payloads and posts the first comment when available", async () => {
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      creationId: "creation_1",
      publishId: "publish_1",
    });
    mockedPublishInstagramFirstComment.mockResolvedValue("comment_1");

    const outcome = await executeImmediateInstagramPublish(
      {
        media: {
          mode: "image",
          imageUrl: "https://cdn.example.com/image.jpg",
        },
        caption: "Caption",
        firstComment: "First comment",
        locationId: null,
        userTags: null,
      },
      auth,
    );

    expect(outcome.firstCommentWarning).toBeUndefined();
    expect(mockedPublishInstagramContent).toHaveBeenCalledWith(
      {
        mode: "image",
        imageUrl: "https://cdn.example.com/image.jpg",
        caption: "Caption",
        locationId: undefined,
        userTags: undefined,
      },
      auth,
    );
    expect(mockedPublishInstagramFirstComment).toHaveBeenCalledWith(
      "publish_1",
      "First comment",
      auth,
    );
  });

  it("rejects unsupported Facebook jobs before touching the Instagram publisher", async () => {
    await expect(
      executePublishJob(
        {
          destination: "facebook",
          caption: "Caption",
          firstComment: null,
          locationId: null,
          userTags: null,
          media: {
            mode: "image",
            imageUrl: "https://cdn.example.com/image.jpg",
          },
        },
        auth,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "UnsupportedPublishDestinationError",
        message: "Facebook publish execution is not implemented yet.",
      }),
    );

    expect(mockedPublishInstagramContent).not.toHaveBeenCalled();
    expect(mockedPublishInstagramFirstComment).not.toHaveBeenCalled();
  });

  it("returns a warning when Instagram first-comment posting fails", async () => {
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      creationId: "creation_1",
      publishId: "publish_1",
    });
    mockedPublishInstagramFirstComment.mockRejectedValue(
      new Error("comment denied"),
    );

    const outcome = await executePublishJob(
      {
        destination: "instagram",
        caption: "Caption",
        firstComment: "First comment",
        locationId: null,
        userTags: null,
        media: {
          mode: "image",
          imageUrl: "https://cdn.example.com/image.jpg",
        },
      },
      auth,
    );

    expect(outcome.publish.publishId).toBe("publish_1");
    expect(outcome.firstCommentWarning).toBe("comment denied");
  });
});
