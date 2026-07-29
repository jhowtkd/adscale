import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MotionBoundary, { AnimatePresence, animate, m, useReducedMotion } from "./MotionBoundary";

describe("MotionBoundary", () => {
  it("preserves the public children contract", () => {
    render(
      <MotionBoundary>
        <span>content</span>
      </MotionBoundary>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("exposes the shared animation boundary primitives", () => {
    expect(AnimatePresence).toBeDefined();
    expect(animate).toBeDefined();
    expect(m).toBeDefined();
    expect(useReducedMotion).toBeDefined();
  });
});
