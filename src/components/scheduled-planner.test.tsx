// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import type { PublishJobClient } from "@/lib/meta-schemas";

import { ScheduledPlanner } from "./scheduled-planner";

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
  firstComment: null,
  locationId: null,
  userTags: null,
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

describe("ScheduledPlanner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders scheduled jobs and opens the linked post from the planner", async () => {
    const onSelectPost = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ jobs: [makeJob()] }));

    render(
      <ScheduledPlanner
        activePostId="post-9"
        localTimeZone="UTC"
        onSelectPost={onSelectPost}
        refreshKey={0}
      />,
    );

    expect(await screen.findByText("Launch A")).not.toBeNull();
    expect(screen.getByText(/1 scheduled post/i)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /open post/i }));
    expect(onSelectPost).toHaveBeenCalledWith("post-1");
  });

  it("reschedules planner items and reports the mutation upstream", async () => {
    const onJobsMutated = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ jobs: [makeJob()] }))
      .mockResolvedValueOnce(jsonResponse({ status: "queued" }))
      .mockResolvedValueOnce(
        jsonResponse({
          jobs: [makeJob({ publishAt: "2026-03-11T09:45:00.000Z" })],
        }),
      );

    render(
      <ScheduledPlanner
        activePostId="post-9"
        localTimeZone="UTC"
        onJobsMutated={onJobsMutated}
        refreshKey={0}
      />,
    );

    expect(await screen.findByText("Launch A")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /reschedule/i }));
    fireEvent.change(screen.getByLabelText("New publish time"), {
      target: { value: "2026-03-11T09:45" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save time/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const patchCall = fetchMock.mock.calls[1];
    expect(patchCall?.[0]).toBe("/api/publish-jobs/job-1");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      action: "reschedule",
      publishAt: new Date("2026-03-11T09:45").toISOString(),
    });
    expect(onJobsMutated).toHaveBeenCalledWith("post-1", "reschedule");
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Publish time updated.");
  });

  it("moves scheduled posts back to draft from the planner", async () => {
    const onJobsMutated = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ jobs: [makeJob()] }))
      .mockResolvedValueOnce(jsonResponse({ status: "canceled" }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [] }));

    render(
      <ScheduledPlanner
        activePostId="post-9"
        localTimeZone="UTC"
        onJobsMutated={onJobsMutated}
        refreshKey={0}
      />,
    );

    expect(await screen.findByText("Launch A")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /move to draft/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const patchCall = fetchMock.mock.calls[1];
    expect(patchCall?.[0]).toBe("/api/publish-jobs/job-1");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      action: "move-to-draft",
    });
    expect(onJobsMutated).toHaveBeenCalledWith("post-1", "move-to-draft");
  });
});
