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
        availableDestinations={["instagram", "facebook"]}
        isAuthLoading={false}
        isSharing={false}
        isPublishing={false}
        publishJobsRefreshKey={0}
        publishDestination="instagram"
        shareUrl={null}
        shareCopyState="idle"
        localTimeZone="America/Los_Angeles"
        hasBlockingValidationError
        validationMessage="Fix incomplete user tag rows before posting or scheduling."
        onCreateShareLink={vi.fn()}
        onPublishDestinationChange={vi.fn()}
        onPostNow={onPostNow}
        onSchedulePost={vi.fn()}
      />,
    );

    expect(screen.getByText(/Fix incomplete user tag rows/)).not.toBeNull();
    const postNowButton = screen.getByRole("button", { name: /post to instagram/i }) as HTMLButtonElement;
    expect(postNowButton.disabled).toBe(true);
    fireEvent.click(postNowButton);
    expect(onPostNow).not.toHaveBeenCalled();
  });

  it("closes the planner even when selecting a post fails", async () => {
    render(
      <PublishSection
        activePostId="post-1"
        authStatus={{ connected: true, source: "oauth" }}
        availableDestinations={["instagram", "facebook"]}
        isAuthLoading={false}
        isSharing={false}
        isPublishing={false}
        publishJobsRefreshKey={0}
        publishDestination="instagram"
        shareUrl={null}
        shareCopyState="idle"
        localTimeZone="America/Los_Angeles"
        onCreateShareLink={vi.fn()}
        onPublishDestinationChange={vi.fn()}
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

  it("lets the user switch publish destinations", () => {
    const onPublishDestinationChange = vi.fn();

    render(
      <PublishSection
        activePostId="post-1"
        authStatus={{ connected: true, source: "oauth" }}
        availableDestinations={["instagram", "facebook"]}
        isAuthLoading={false}
        isSharing={false}
        isPublishing={false}
        publishJobsRefreshKey={0}
        publishDestination="instagram"
        shareUrl={null}
        shareCopyState="idle"
        localTimeZone="America/Los_Angeles"
        onCreateShareLink={vi.fn()}
        onPublishDestinationChange={onPublishDestinationChange}
        onPostNow={vi.fn()}
        onSchedulePost={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("radiogroup", { name: "Destination" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("radio", { name: "Facebook + Instagram" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("radio", { name: "Instagram" }),
    ).toHaveProperty("ariaChecked", "true");

    fireEvent.click(screen.getByRole("radio", { name: "Facebook" }));
    expect(onPublishDestinationChange).toHaveBeenCalledWith("facebook");
  });

  it("uses the combined destination label when both is selected", () => {
    render(
      <PublishSection
        activePostId="post-1"
        authStatus={{ connected: true, source: "oauth" }}
        availableDestinations={["instagram", "facebook"]}
        isAuthLoading={false}
        isSharing={false}
        isPublishing={false}
        publishJobsRefreshKey={0}
        publishDestination="both"
        shareUrl={null}
        shareCopyState="idle"
        localTimeZone="America/Los_Angeles"
        onCreateShareLink={vi.fn()}
        onPublishDestinationChange={vi.fn()}
        onPostNow={vi.fn()}
        onSchedulePost={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /post to facebook \+ instagram/i }),
    ).not.toBeNull();
    expect(
      screen.getByText(/instagram-only metadata stays on instagram/i),
    ).not.toBeNull();
  });
});
