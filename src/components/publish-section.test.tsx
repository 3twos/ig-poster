// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PublishSection } from "./publish-section";

vi.mock("./publish-job-queue", () => ({
  PublishJobQueue: () => <div data-testid="publish-job-queue" />,
}));

vi.mock("./scheduled-planner", () => ({
  ScheduledPlanner: ({
    onSelectPost,
  }: {
    onSelectPost?: (postId: string) => Promise<void> | void;
  }) => (
    <div data-testid="scheduled-planner">
      <button
        type="button"
        onClick={() => {
          const maybePromise = onSelectPost?.("post-from-planner");
          if (maybePromise && "catch" in maybePromise) {
            void maybePromise.catch(() => undefined);
          }
        }}
      >
        Select planner post
      </button>
    </div>
  ),
}));

describe("PublishSection", () => {
  it("blocks publish actions when the composer reports validation errors", () => {
    const onPostNow = vi.fn();

    render(
      <PublishSection
        activePostId="post-1"
        authStatus={{ connected: true, source: "oauth" }}
        isAuthLoading={false}
        isSharing={false}
        isPublishing={false}
        publishJobsRefreshKey={0}
        shareUrl={null}
        shareCopyState="idle"
        localTimeZone="America/Los_Angeles"
        hasBlockingValidationError
        validationMessage="Fix incomplete user tag rows before posting or scheduling."
        onOpenSettings={vi.fn()}
        onCreateShareLink={vi.fn()}
        onPostNow={onPostNow}
        onSchedulePost={vi.fn()}
      />,
    );

    expect(screen.getByText(/Fix incomplete user tag rows/)).not.toBeNull();
    const postNowButton = screen.getByRole("button", { name: /post now/i }) as HTMLButtonElement;
    expect(postNowButton.disabled).toBe(true);
    fireEvent.click(postNowButton);
    expect(onPostNow).not.toHaveBeenCalled();
  });

  it("closes the planner even when selecting a post fails", async () => {
    render(
      <PublishSection
        activePostId="post-1"
        authStatus={{ connected: true, source: "oauth" }}
        isAuthLoading={false}
        isSharing={false}
        isPublishing={false}
        publishJobsRefreshKey={0}
        shareUrl={null}
        shareCopyState="idle"
        localTimeZone="America/Los_Angeles"
        onOpenSettings={vi.fn()}
        onCreateShareLink={vi.fn()}
        onPostNow={vi.fn()}
        onSchedulePost={vi.fn()}
        onSelectPlannerPost={vi.fn().mockRejectedValue(new Error("boom"))}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /planner/i }));
    expect(screen.getByTestId("scheduled-planner")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /select planner post/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("scheduled-planner")).toBeNull();
    });
  });
});
