// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublishJobClient } from "@/lib/meta-schemas";

import { PublishJobQueue } from "./publish-job-queue";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const fetchMock = vi.fn<typeof fetch>();

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const makeJob = (overrides?: Partial<PublishJobClient>): PublishJobClient => ({
  id: "job-1",
  postId: "post-1",
  status: "queued",
  caption: "Caption",
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
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        jobs: [
          makeJob(),
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
      }),
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
  });

  it("cancels a queued job and refreshes the list", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ jobs: [makeJob()] }))
      .mockResolvedValueOnce(jsonResponse({ status: "canceled" }))
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
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const patchCall = fetchMock.mock.calls[1];
    expect(patchCall?.[0]).toBe("/api/publish-jobs/job-1");
    expect(patchCall?.[1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ action: "cancel" }),
    });

    expect(
      await screen.findByText("No queued, processing, or failed publish jobs right now."),
    ).not.toBeNull();
  });

  it("reschedules a failed job and sends the new publish timestamp", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          jobs: [
            makeJob({
              status: "failed",
              lastError: "Temporary error",
              attempts: 3,
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ status: "queued" }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [makeJob()] }));

    render(
      <PublishJobQueue
        activePostId="post-1"
        localTimeZone="America/Los_Angeles"
        refreshKey={0}
      />,
    );

    expect(await screen.findByText("Temporary error")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /reschedule/i }));
    fireEvent.change(
      screen.getByLabelText("Reschedule publish time for job-1"),
      { target: { value: "2026-03-11T09:45" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const patchCall = fetchMock.mock.calls[1];
    expect(patchCall?.[0]).toBe("/api/publish-jobs/job-1");
    expect(patchCall?.[1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      action: "reschedule",
      publishAt: new Date("2026-03-11T09:45").toISOString(),
    });
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
