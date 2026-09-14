import { describe, expect, it } from "vitest";
import { containedImageBounds, imagePoint } from "./piece-review-geometry";

describe("containedImageBounds", () => {
  it("ignores margins and uses the rendered image for coordinates", () => {
    const box = containedImageBounds({ left: 0, top: 0, width: 600, height: 400 }, 400, 500);
    expect(box).toEqual({ left: 140, top: 0, width: 320, height: 400 });
    expect(imagePoint(box, 100, 200)).toBeNull();
    expect(imagePoint(box, 300, 200)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("centers the image inside a wide box", () => {
    const box = containedImageBounds({ left: 10, top: 20, width: 500, height: 300 }, 1000, 500);
    expect(box).toEqual({ left: 10, top: 20 + (300 - 250) / 2, width: 500, height: 250 });
  });

  it("returns null for zero or non-finite dimensions", () => {
    expect(containedImageBounds({ left: 0, top: 0, width: 600, height: 400 }, 0, 500)).toBeNull();
    expect(containedImageBounds({ left: 0, top: 0, width: 600, height: 400 }, 400, 0)).toBeNull();
    expect(containedImageBounds({ left: 0, top: 0, width: 0, height: 400 }, 400, 500)).toBeNull();
    expect(containedImageBounds({ left: 0, top: 0, width: 600, height: 0 }, 400, 500)).toBeNull();
    expect(containedImageBounds({ left: 0, top: 0, width: 600, height: 400 }, Number.NaN, 500)).toBeNull();
    expect(containedImageBounds({ left: Number.NaN, top: 0, width: 600, height: 400 }, 400, 500)).toBeNull();
    expect(containedImageBounds({ left: 0, top: 0, width: Number.POSITIVE_INFINITY, height: 400 }, 400, 500)).toBeNull();
  });
});

describe("imagePoint", () => {
  const box = { left: 140, top: 0, width: 320, height: 400 };

  it("normalizes points inside the rendered image", () => {
    expect(imagePoint(box, box.left, box.top)).toEqual({ x: 0, y: 0 });
    expect(imagePoint(box, box.left + box.width, box.top + box.height)).toEqual({ x: 1, y: 1 });
    expect(imagePoint(box, 300, 100)).toEqual({ x: 0.5, y: 0.25 });
  });

  it("rejects points outside the rendered image", () => {
    expect(imagePoint(box, 139, 200)).toBeNull();
    expect(imagePoint(box, 461, 200)).toBeNull();
    expect(imagePoint(box, 300, -1)).toBeNull();
    expect(imagePoint(box, 300, 401)).toBeNull();
  });

  it("rejects non-finite coordinates and a null box", () => {
    expect(imagePoint(box, Number.NaN, 200)).toBeNull();
    expect(imagePoint(box, 300, Number.POSITIVE_INFINITY)).toBeNull();
    expect(imagePoint(null, 300, 200)).toBeNull();
  });
});
