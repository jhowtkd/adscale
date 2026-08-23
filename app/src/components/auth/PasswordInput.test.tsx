import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PasswordInput from "./PasswordInput";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("PasswordInput accessibility", () => {
  it("keeps the visibility toggle keyboard reachable and stateful", () => {
    render(
      <PasswordInput
        id="password"
        label="Password"
        value="secret"
        onChange={vi.fn()}
      />
    );

    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).not.toHaveAttribute("tabindex", "-1");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
  });
});
