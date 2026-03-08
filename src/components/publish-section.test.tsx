// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PublishSection } from "./publish-section";

vi.mock("./publish-job-queue", () => ({
  PublishJobQueue: () => <div data-testid="publish-job-queue" />,
}));

vi.mock("./scheduled-planner", () => ({
  ScheduledPlanner: () => <div data-testid="scheduled-planner" />,
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
});
