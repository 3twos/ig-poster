// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PublishSection } from "./publish-section";

vi.mock("./publish-job-queue", () => ({
  PublishJobQueue: () => <div data-testid="publish-job-queue" />,
}));

describe("PublishSection", () => {
  it("submits reel share-to-feed preference from the main publish form", () => {
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
        supportsImageMetadata={false}
        supportsReelControls
        onOpenSettings={vi.fn()}
        onCreateShareLink={vi.fn()}
        onPostNow={onPostNow}
        onSchedulePost={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Share reel to main feed"));
    fireEvent.click(screen.getByRole("button", { name: /post now/i }));

    expect(onPostNow).toHaveBeenCalledWith(
      expect.objectContaining({
        reelShareToFeed: false,
      }),
    );
  });
});
