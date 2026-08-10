import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ImageCursorTrail from "./image-cursor-trail";

describe("ImageCursorTrail", () => {
  it("activates the next image and retires the tail", () => {
    const { container } = render(
      <ImageCursorTrail items={["/one.jpg", "/two.jpg"]} distance={100} maxNumberOfImages={1} />
    );
    const trail = container.querySelector("div")!;
    const images = container.querySelectorAll("img");

    fireEvent.pointerMove(trail, { clientX: 100, clientY: 100 });
    expect(images[0]).toHaveAttribute("data-status", "active");

    fireEvent.pointerMove(trail, { clientX: 200, clientY: 200 });
    expect(images[0]).toHaveAttribute("data-status", "inactive");
    expect(images[1]).toHaveAttribute("data-status", "active");
  });
});
