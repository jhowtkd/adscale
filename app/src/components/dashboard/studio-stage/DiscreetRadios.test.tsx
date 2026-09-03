import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiscreetRadios } from "./DiscreetRadios";

describe("DiscreetRadios", () => {
  it("exposes a radiogroup and selects without a segmented track", () => {
    const onChange = vi.fn();
    render(
      <DiscreetRadios
        label="Origem"
        value="all"
        onChange={onChange}
        options={[
          { value: "all", label: "Todos" },
          { value: "campaign", label: "Campanhas" },
        ]}
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "Origem" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Todos" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Campanhas" }));
    expect(onChange).toHaveBeenCalledWith("campaign");
    expect(screen.getByRole("radio", { name: "Todos" }).className).not.toMatch(/border-/);
  });
});
