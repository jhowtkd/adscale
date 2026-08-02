import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MotionValue } from "./MotionValue";

describe("MotionValue", () => {
  it("keeps the final value available while the visual value transitions", () => {
    const { rerender } = render(<MotionValue value={28} suffix="%" />);

    expect(screen.getByTestId("motion-value")).toHaveAttribute("data-motion-value", "28%");
    expect(screen.getByText("28%")).toBeInTheDocument();

    rerender(<MotionValue value={71} suffix="%" />);

    expect(screen.getByTestId("motion-value")).toHaveAttribute("data-motion-value", "71%");
    expect(screen.getByText("71%")).toBeInTheDocument();
  });
});
