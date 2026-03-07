// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MetaUserTagsEditor } from "./meta-user-tags-editor";

describe("MetaUserTagsEditor", () => {
  it("updates the selected tag coordinates from image clicks", () => {
    const onChange = vi.fn();

    render(
      <MetaUserTagsEditor
        ariaLabelPrefix="Publish"
        imageUrl="https://cdn.example.com/poster.png"
        tags={[
          { username: "first", x: 0.1, y: 0.2 },
          { username: "second", x: 0.5, y: 0.5 },
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Publish select user tag 2 for image placement",
      }),
    );

    const preview = screen.getByRole("button", {
      name: "Publish user tag image preview",
    });
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 200,
      right: 200,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    });

    fireEvent.click(preview, { clientX: 150, clientY: 60 });

    expect(onChange).toHaveBeenCalledWith([
      { username: "first", x: 0.1, y: 0.2 },
      { username: "second", x: 0.75, y: 0.3 },
    ]);
  });
});
