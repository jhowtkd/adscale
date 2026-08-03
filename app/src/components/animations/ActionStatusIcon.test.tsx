import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ActionStatusIcon } from "./ActionStatusIcon";

describe("ActionStatusIcon", () => {
  it("reflects only the supplied action state and stays decorative", () => {
    const { rerender } = render(<ActionStatusIcon state="idle" />);
    expect(screen.queryByTestId("action-status-icon")).not.toBeInTheDocument();

    rerender(<ActionStatusIcon state="pending" />);
    expect(screen.getByTestId("action-status-icon")).toHaveAttribute("data-action-status", "pending");
    expect(screen.getByTestId("action-status-icon")).toHaveAttribute("aria-hidden", "true");

    rerender(<ActionStatusIcon state="success" />);
    expect(screen.getByTestId("action-status-icon")).toHaveAttribute("data-action-status", "success");

    rerender(<ActionStatusIcon state="error" />);
    expect(screen.getByTestId("action-status-icon")).toHaveAttribute("data-action-status", "error");
  });
});
