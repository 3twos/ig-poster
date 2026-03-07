// @vitest-environment jsdom

import type * as React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { PostSummary } from "@/lib/post";

import { PostListItem } from "./post-list-item";

function makePost(overrides?: Partial<PostSummary>): PostSummary {
  return {
    id: "post-1",
    title: "How High-Growth Teams Design Trust",
    status: "generated",
    createdAt: "2026-03-01T08:00:00.000Z",
    updatedAt: "2026-03-06T08:00:00.000Z",
    assetCount: 5,
    variantCount: 3,
    ...overrides,
  };
}

beforeAll(() => {
  if (!("PointerEvent" in window)) {
    Object.defineProperty(window, "PointerEvent", {
      value: MouseEvent,
      configurable: true,
    });
  }
});

function renderPostListItem(props: React.ComponentProps<typeof PostListItem>) {
  return render(
    <TooltipProvider>
      <PostListItem {...props} />
    </TooltipProvider>,
  );
}

describe("PostListItem quick actions", () => {
  it("collapses expanded status actions when clicking outside the card", () => {
    const postNow = vi.fn();
    const schedulePost = vi.fn();

    renderPostListItem(
      {
        post: makePost(),
        isActive: false,
        onSelect: vi.fn(),
        onPostNow: postNow,
        onSchedulePost: schedulePost,
        onArchive: vi.fn(),
        onDelete: vi.fn(),
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "UNPOSTED" }));
    expect(screen.queryByRole("button", { name: "POST" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "POST AT" })).not.toBeNull();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("button", { name: "POST" })).toBeNull();
    expect(screen.queryByRole("button", { name: "POST AT" })).toBeNull();
    expect(screen.queryByRole("button", { name: "UNPOSTED" })).not.toBeNull();
  });

  it("requires confirmation before immediate publish from status quick action", () => {
    const postNow = vi.fn();

    renderPostListItem(
      {
        post: makePost(),
        isActive: false,
        onSelect: vi.fn(),
        onPostNow: postNow,
        onSchedulePost: vi.fn(),
        onArchive: vi.fn(),
        onDelete: vi.fn(),
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "UNPOSTED" }));
    fireEvent.click(screen.getByRole("button", { name: "POST" }));

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).queryByText("Post now?")).not.toBeNull();
    expect(postNow).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Post now" }));
    expect(postNow).toHaveBeenCalledTimes(1);
  });

  it("shows menu publish actions independently and clears expanded state before post-now confirm", () => {
    const postNow = vi.fn();

    renderPostListItem(
      {
        post: makePost(),
        isActive: false,
        onSelect: vi.fn(),
        onPostNow: postNow,
        onArchive: vi.fn(),
        onDelete: vi.fn(),
      },
    );

    // Expand chip actions first; selecting Post now from the menu should collapse this.
    fireEvent.click(screen.getByRole("button", { name: "UNPOSTED" }));
    expect(screen.queryByRole("button", { name: "POST" })).not.toBeNull();

    const menuTrigger = screen.getByRole("button", { name: "Post options" });
    fireEvent.pointerDown(menuTrigger, { button: 0 });
    fireEvent.click(menuTrigger);

    // When only onPostNow is available, Post at should not be offered.
    expect(screen.queryByRole("menuitem", { name: "Post at..." })).toBeNull();
    const postNowMenuItem = screen.getByRole("menuitem", { name: "Post now" });

    fireEvent.click(postNowMenuItem);

    // Expanded chip actions should collapse after menu selection.
    expect(screen.queryByRole("button", { name: "POST" })).toBeNull();
    // Menu path should still open the same confirmation dialog.
    expect(screen.queryByRole("alertdialog")).not.toBeNull();
  });
});
