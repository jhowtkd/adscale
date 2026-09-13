import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () => ({ endpoint }: { endpoint: string }) => (
    <div data-testid="agentation" data-endpoint={endpoint} />
  ),
}));

import AdminAgentation from "./AdminAgentation";

it("connects admin annotations to the local MCP server", () => {
  render(<AdminAgentation />);
  expect(screen.getByTestId("agentation")).toHaveAttribute("data-endpoint", "http://localhost:4747");
});
