import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnimatedDisplayValue } from "./AnimatedDisplayValue";

describe("AnimatedDisplayValue", () => {
  it("keeps the final value available while the visual value transitions", () => {
    const { rerender } = render(<AnimatedDisplayValue value="28%" />);

    expect(document.querySelector('[data-motion-value="28%"]')).toBeVisible();
    expect(screen.getByText("28%")).toBeInTheDocument();

    rerender(<AnimatedDisplayValue value="71%" />);

    expect(document.querySelector('[data-motion-value="71%"]')).toBeVisible();
    expect(screen.getByText("71%")).toBeInTheDocument();
  });
});
