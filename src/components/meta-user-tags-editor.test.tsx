// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MetaUserTagsEditor } from "./meta-user-tags-editor";

const setImageDimensions = (
  image: HTMLImageElement,
  dimensions: {
    clientWidth: number;
    clientHeight: number;
    naturalWidth: number;
    naturalHeight: number;
  },
) => {
  Object.defineProperty(image, "clientWidth", {
    configurable: true,
    value: dimensions.clientWidth,
  });
  Object.defineProperty(image, "clientHeight", {
    configurable: true,
    value: dimensions.clientHeight,
  });
  Object.defineProperty(image, "naturalWidth", {
    configurable: true,
    value: dimensions.naturalWidth,
  });
  Object.defineProperty(image, "naturalHeight", {
    configurable: true,
    value: dimensions.naturalHeight,
  });
};

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

    const image = document.querySelector("img");
    if (!(image instanceof HTMLImageElement)) {
      throw new Error("Expected preview image to render");
    }
    setImageDimensions(image, {
      clientWidth: 200,
      clientHeight: 200,
      naturalWidth: 200,
      naturalHeight: 200,
    });
    fireEvent.load(image);

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

  it("uses the actual visible image frame when the preview is letterboxed", () => {
    const onChange = vi.fn();

    render(
      <MetaUserTagsEditor
        ariaLabelPrefix="Publish"
        imageUrl="https://cdn.example.com/poster.png"
        tags={[{ username: "first", x: 0.5, y: 0.5 }]}
        onChange={onChange}
      />,
    );

    const image = document.querySelector("img");
    if (!(image instanceof HTMLImageElement)) {
      throw new Error("Expected preview image to render");
    }
    setImageDimensions(image, {
      clientWidth: 200,
      clientHeight: 100,
      naturalWidth: 100,
      naturalHeight: 100,
    });
    fireEvent.load(image);

    const preview = screen.getByRole("button", {
      name: "Publish user tag image preview",
    });
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      x: 50,
      y: 0,
      top: 0,
      left: 50,
      bottom: 100,
      right: 150,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    fireEvent.click(preview, { clientX: 50, clientY: 50 });

    expect(onChange).toHaveBeenCalledWith([
      { username: "first", x: 0, y: 0.5 },
    ]);
  });
});
