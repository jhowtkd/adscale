import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { AdscaleLoader } from "./AdscaleLoader";

vi.mock("@/lib/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => true,
}));

describe("AdscaleLoader", () => {
  it("renders one static monogram path plus the travelling contour", () => {
    const { container } = render(<AdscaleLoader />);
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });
});
