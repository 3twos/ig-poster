// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import type { PublishJobClient } from "@/lib/meta-schemas";

import { PublishJobQueue } from "./publish-job-queue";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const fetchMock = vi.fn<typeof fetch>();
const mockedToastError = vi.mocked(toast.error);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const mockQueueLoad = (
  activeJobs: PublishJobClient[],
  failedJobs: PublishJobClient[] = [],
) => {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ jobs: activeJobs }))
    .mockResolvedValueOnce(jsonResponse({ jobs: failedJobs }));
};

const makeJob = (overrides?: Partial<PublishJobClient>): PublishJobClient => ({
  id: "job-1",
  postId: "post-1",
  status: "queued",
  caption: "Caption",
  firstComment: null,
  media: { mode: "image", imageUrl: "https://cdn.example.com/poster.jpg" },
  publishAt: "2026-03-10T18:30:00.000Z",
  attempts: 0,
  maxAttempts: 3,
  lastAttemptAt: null,
  lastError: null,
  authSource: "oauth",
  connectionId: "conn_1",
  outcomeContext: {
    variantName: "Launch A",
    postType: "single-image",
    caption: "Caption",
    hook: "Hook",
    hashtags: ["#launch"],
    brandName: "Acme",
    score: 0.92,
  },
  publishId: null,
  creationId: null,
  children: null,
  completedAt: null,
  canceledAt: null,
  events: [],
  createdAt: "2026-03-10T17:00:00.000Z",
  updatedAt: "2026-03-10T17:00:00.000Z",
  ...overrides,
});

describe("PublishJobQueue", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders queued and failed publish jobs for the workspace", async () => {
    mockQueueLoad(
      [makeJob()],
      [
        makeJob({
          id: "job-2",
          postId: "post-9",
          status: "failed",
          lastError: "OAuth token expired",
          outcomeContext: {
            variantName: "Retry B",
            postType: "single-image",
            caption: "Caption",
            hook: "Hook",
            hashtags: ["#retry"],
            brandName: "Acme",
          },
        }),
      ],
    );

    render(
      <PublishJobQueue
        activePostId="post-1"
        localTimeZone="America/Los_Angeles"
        refreshKey={0}
      />,
    );

    expect(await screen.findByText(/Launch A/)).not.toBeNull();
    expect(screen.getByText("This post")).not.toBeNull();
    expect(screen.getByText("OAuth token expired")).not.toBeNull();
    expect(screen.getByText("Failed")).not.toBeNull();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/publish-jobs?status=queued,processing&limit=8");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/publish-jobs?status=failed&limit=4");
  });

  it("cancels a queued job and refreshes the list", async () => {
    mockQueueLoad([makeJob()]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "canceled" }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [] }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [] }));

    render(
      <PublishJobQueue
        activePostId="post-1"
        localTimeZone="America/Los_Angeles"
        refreshKey={0}
      />,
    );

    expect(await screen.findByText(/Launch A/)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    const patchCall = fetchMock.mock.calls[2];
    expect(patchCall?.[0]).toBe("/api/publish-jobs/job-1");
    expect(patchCall?.[1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ action: "cancel" }),
    });

    expect(
      await screen.findByText("No queued, processing, or failed publish jobs right now."),
    ).not.toBeNull();
  });

  it("retries a failed job immediately", async () => {
    mockQueueLoad(
      [],
      [
        makeJob({
          status: "failed",
          lastError: "Temporary error",
          attempts: 3,
        }),
      ],
    );
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "queued" }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [makeJob()] }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [] }));

    render(
      <PublishJobQueue
        activePostId="post-1"
        localTimeZone="America/Los_Angeles"
        refreshKey={0}
      />,
    );

    expect(await screen.findByText("Temporary error")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /retry now/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    const patchCall = fetchMock.mock.calls[2];
    expect(patchCall?.[0]).toBe("/api/publish-jobs/job-1");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      action: "retry-now",
    });
  });

  it("edits a failed job and sends the updated publish timestamp", async () => {
    mockQueueLoad(
      [],
      [
        makeJob({
          status: "failed",
          lastError: "Temporary error",
          attempts: 3,
        }),
      ],
    );
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "queued" }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [makeJob()] }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [] }));

    render(
      <PublishJobQueue
        activePostId="post-1"
        localTimeZone="America/Los_Angeles"
        refreshKey={0}
      />,
    );

    expect(await screen.findByText("Temporary error")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(
      screen.getByLabelText("Edit publish time for job-1"),
      { target: { value: "2026-03-11T09:45" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    const patchCall = fetchMock.mock.calls[2];
    expect(patchCall?.[0]).toBe("/api/publish-jobs/job-1");
    expect(patchCall?.[1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      action: "edit",
      publishAt: new Date("2026-03-11T09:45").toISOString(),
    });
  });

  it("submits caption edits using action=edit", async () => {
    mockQueueLoad([makeJob()]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "queued" }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [makeJob({ caption: "Updated caption" })] }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [] }));

    render(
      <PublishJobQueue
        activePostId="post-1"
        localTimeZone="America/Los_Angeles"
        refreshKey={0}
      />,
    );

    expect(await screen.findByText(/Launch A/)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(
      screen.getByLabelText("Edit caption for job-1"),
      { target: { value: "Updated caption" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    const patchCall = fetchMock.mock.calls[2];
    expect(patchCall?.[0]).toBe("/api/publish-jobs/job-1");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      action: "edit",
      caption: "Updated caption",
    });
  });

  it("submits first-comment clears using action=edit", async () => {
    mockQueueLoad([makeJob({ firstComment: "Keep me" })]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "queued" }))
      .mockResolvedValueOnce(
        jsonResponse({ jobs: [makeJob({ firstComment: null })] }),
      )
      .mockResolvedValueOnce(jsonResponse({ jobs: [] }));

    render(
      <PublishJobQueue
        activePostId="post-1"
        localTimeZone="America/Los_Angeles"
        refreshKey={0}
      />,
    );

    expect(await screen.findByText(/Launch A/)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(
      screen.getByLabelText("Edit first comment for job-1"),
      { target: { value: "" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    const patchCall = fetchMock.mock.calls[2];
    expect(patchCall?.[0]).toBe("/api/publish-jobs/job-1");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      action: "edit",
      firstComment: null,
    });
  });

  it("submits media URL edits using action=edit", async () => {
    mockQueueLoad([makeJob()]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "queued" }))
      .mockResolvedValueOnce(
        jsonResponse({
          jobs: [
            makeJob({
              media: {
                mode: "image",
                imageUrl: "https://cdn.example.com/updated-poster.jpg",
              },
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ jobs: [] }));

    render(
      <PublishJobQueue
        activePostId="post-1"
        localTimeZone="America/Los_Angeles"
        refreshKey={0}
      />,
    );

    expect(await screen.findByText(/Launch A/)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(
      screen.getByLabelText("Edit image URL for job-1"),
      { target: { value: "https://cdn.example.com/updated-poster.jpg" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    const patchCall = fetchMock.mock.calls[2];
    expect(patchCall?.[0]).toBe("/api/publish-jobs/job-1");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      action: "edit",
      media: {
        mode: "image",
        imageUrl: "https://cdn.example.com/updated-poster.jpg",
      },
    });
  });

  it("submits reel media edits using action=edit", async () => {
    mockQueueLoad([
      makeJob({
        media: {
          mode: "reel",
          videoUrl: "https://cdn.example.com/reel-old.mp4",
          coverUrl: "https://cdn.example.com/cover-old.jpg",
        },
      }),
    ]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "queued" }))
      .mockResolvedValueOnce(
        jsonResponse({
          jobs: [
            makeJob({
              media: {
                mode: "reel",
                videoUrl: "https://cdn.example.com/reel-new.mp4",
                coverUrl: "https://cdn.example.com/cover-new.jpg",
              },
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ jobs: [] }));

    render(
      <PublishJobQueue
        activePostId="post-1"
        localTimeZone="America/Los_Angeles"
        refreshKey={0}
      />,
    );

    expect(await screen.findByText(/Launch A/)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(
      screen.getByLabelText("Edit reel video URL for job-1"),
      { target: { value: "https://cdn.example.com/reel-new.mp4" } },
    );
    fireEvent.change(
      screen.getByLabelText("Edit reel cover URL for job-1"),
      { target: { value: "https://cdn.example.com/cover-new.jpg" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    const patchCall = fetchMock.mock.calls[2];
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      action: "edit",
      media: {
        mode: "reel",
        videoUrl: "https://cdn.example.com/reel-new.mp4",
        coverUrl: "https://cdn.example.com/cover-new.jpg",
      },
    });
  });

  it("enforces carousel item guardrails in edit mode", async () => {
    mockQueueLoad([
      makeJob({
        media: {
          mode: "carousel",
          items: [
            { mediaType: "image", url: "https://cdn.example.com/c1.jpg" },
            { mediaType: "video", url: "https://cdn.example.com/c2.mp4" },
          ],
        },
      }),
    ]);

    render(
      <PublishJobQueue
        activePostId="post-1"
        localTimeZone="America/Los_Angeles"
        refreshKey={0}
      />,
    );

    expect(await screen.findByText(/Launch A/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    const addButton = screen.getByRole("button", { name: /add item/i });
    expect(addButton.hasAttribute("disabled")).toBe(false);

    const initialRemoveButtons = screen.getAllByRole("button", { name: /remove/i });
    expect(initialRemoveButtons[0].hasAttribute("disabled")).toBe(true);
    expect(initialRemoveButtons[1].hasAttribute("disabled")).toBe(true);

    fireEvent.click(addButton);
    const removeButtonsAfterAdd = screen.getAllByRole("button", { name: /remove/i });
    expect(removeButtonsAfterAdd[0].hasAttribute("disabled")).toBe(false);

    for (let index = 0; index < 7; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: /add item/i }));
    }

    expect(screen.getByRole("button", { name: /add item/i }).hasAttribute("disabled")).toBe(true);
  });

  it("blocks submit on invalid media URLs", async () => {
    mockQueueLoad([makeJob()]);

    render(
      <PublishJobQueue
        activePostId="post-1"
        localTimeZone="America/Los_Angeles"
        refreshKey={0}
      />,
    );

    expect(await screen.findByText(/Launch A/)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(
      screen.getByLabelText("Edit image URL for job-1"),
      { target: { value: "not-a-url" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockedToastError).toHaveBeenCalled();
  });

  it("does not send publishAt for caption-only edits when stored time has seconds", async () => {
    mockQueueLoad([
      makeJob({
        publishAt: "2026-03-10T18:30:42.123Z",
      }),
    ]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "queued" }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [makeJob({ caption: "Refined caption" })] }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [] }));

    render(
      <PublishJobQueue
        activePostId="post-1"
        localTimeZone="America/Los_Angeles"
        refreshKey={0}
      />,
    );

    expect(await screen.findByText(/Launch A/)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(
      screen.getByLabelText("Edit caption for job-1"),
      { target: { value: "Refined caption" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    const patchCall = fetchMock.mock.calls[2];
    expect(patchCall?.[0]).toBe("/api/publish-jobs/job-1");
    const payload = JSON.parse(String(patchCall?.[1]?.body));
    expect(payload).toMatchObject({
      action: "edit",
      caption: "Refined caption",
    });
    expect(payload.publishAt).toBeUndefined();
  });

  it("shows a load error state instead of the empty-state copy after initial fetch failure", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Database unavailable" }, 500),
    );

    render(
      <PublishJobQueue
        activePostId="post-1"
        localTimeZone="America/Los_Angeles"
        refreshKey={0}
      />,
    );

    expect(await screen.findByText("Database unavailable")).not.toBeNull();
    expect(
      screen.queryByText("No queued, processing, or failed publish jobs right now."),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
  });
});
