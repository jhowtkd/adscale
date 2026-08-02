import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MotionBoundary, { AnimatePresence, animate, m, useReducedMotion } from "./MotionBoundary";

vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();

  return {
    ...actual,
    MotionConfig: ({
      children,
      reducedMotion,
    }: {
      children: React.ReactNode;
      reducedMotion?: "always" | "never" | "user";
    }) => (
      <div data-testid="motion-config" data-reduced-motion={reducedMotion}>
        {children}
      </div>
    ),
  };
});

describe("MotionBoundary", () => {
  it("preserves the public children contract", () => {
    render(
      <MotionBoundary>
        <span>content</span>
      </MotionBoundary>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("delegates reduced motion to the user's system preference", () => {
    render(
      <MotionBoundary>
        <span>authenticated content</span>
      </MotionBoundary>,
    );

    expect(screen.getByTestId("motion-config")).toHaveAttribute(
      "data-reduced-motion",
      "user",
    );
    expect(screen.getByText("authenticated content")).toBeVisible();
  });

  it("exposes the shared animation boundary primitives", () => {
    expect(AnimatePresence).toBeDefined();
    expect(animate).toBeDefined();
    expect(m).toBeDefined();
    expect(useReducedMotion).toBeDefined();
  });
});
