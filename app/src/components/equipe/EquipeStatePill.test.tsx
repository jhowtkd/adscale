import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EquipeStatePill from "./EquipeStatePill";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = ((key: string) => `states.${key}`) as ((key: string) => string) & {
      has: (key: string) => boolean;
    };
    t.has = (key: string) => key !== "mystery";
    return t;
  },
}));

describe("EquipeStatePill", () => {
  it.each([
    "ready",
    "needs_confirmation",
    "edit_with_warning",
    "edited_in_review",
    "blocked",
    "adjusting",
    "scheduled",
    "held",
    "missed_window",
    "failed",
    "do_not_publish",
    "cancelled",
    "published",
    "available_for_download",
  ])("renders the %s pill from the API state", (state) => {
    render(<EquipeStatePill state={state} />);
    const pill = screen.getByTestId("equipe-state-pill");
    expect(pill).toHaveAttribute("data-state", state);
    expect(pill).toHaveTextContent(`states.${state}`);
  });

  it("falls back to the raw state for unknown values", () => {
    render(<EquipeStatePill state="mystery" />);
    expect(screen.getByTestId("equipe-state-pill")).toHaveTextContent("mystery");
  });

  it("stays inside narrow cards and keeps the full label on hover", () => {
    render(<EquipeStatePill state="available_for_download" />);
    const pill = screen.getByTestId("equipe-state-pill");
    expect(pill).toHaveClass("max-w-full");
    expect(pill).toHaveAttribute("title", "states.available_for_download");
  });
});
