"use client";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudioEntryInterview } from "./StudioEntryInterview";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `entryInterview.${key}`,
}));

describe("StudioEntryInterview", () => {
  it("renders slot choices as a quiet nowrap kicker instead of wrapping pills", () => {
    const onSelect = vi.fn();
    render(
      <StudioEntryInterview
        chips={[
          { slot: "protocol", options: ["single", "variations"] },
          { slot: "offer", options: ["launch", "capture"] },
        ]}
        answers={{ protocol: "single" }}
        onSelect={onSelect}
        locale="pt-BR"
      />,
    );

    const eyebrow = screen.getByText("entryInterview.suggestionsEyebrow");
    expect(eyebrow).toBeVisible();
    expect(eyebrow.className).toContain("bg-clip-text");
    expect(eyebrow.className).not.toContain("text-[var(--text-muted)]");
    const protocolGroup = screen.getAllByRole("radiogroup")[0];
    expect(protocolGroup).toHaveAttribute("aria-label", "entryInterview.suggestionsGroup");
    expect(protocolGroup.className).toContain("flex-nowrap");
    expect(protocolGroup.className).not.toContain("flex-wrap");

    const selected = screen.getByRole("radio", { name: "Peça única" });
    expect(selected).toHaveAttribute("aria-checked", "true");
    expect(selected.className).not.toMatch(/border-/);
    expect(screen.getByRole("radio", { name: "Variações" })).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByRole("radio", { name: "Lançamento" }));
    expect(onSelect).toHaveBeenCalledWith("offer", "launch");
  });

  it("announces request updates when writtenToken increments", () => {
    const { rerender } = render(
      <StudioEntryInterview
        chips={[{ slot: "offer", options: ["launch"] }]}
        answers={{}}
        onSelect={vi.fn()}
        locale="en"
        writtenToken={0}
      />,
    );

    const statusAtZero = screen.getByRole("status");
    expect(statusAtZero).toHaveAttribute("aria-live", "polite");
    expect(statusAtZero).toHaveTextContent("");

    rerender(
      <StudioEntryInterview
        chips={[{ slot: "offer", options: ["launch"] }]}
        answers={{}}
        onSelect={vi.fn()}
        locale="en"
        writtenToken={1}
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("entryInterview.requestUpdated 1");
  });

  it("announces request updates when chips are empty but writtenToken increments", () => {
    const { rerender } = render(
      <StudioEntryInterview
        chips={[]}
        answers={{}}
        onSelect={vi.fn()}
        locale="en"
        writtenToken={0}
      />,
    );

    const statusAtZero = screen.getByRole("status");
    expect(statusAtZero).toHaveAttribute("aria-live", "polite");
    expect(statusAtZero).toHaveTextContent("");

    rerender(
      <StudioEntryInterview
        chips={[]}
        answers={{}}
        onSelect={vi.fn()}
        locale="en"
        writtenToken={2}
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("entryInterview.requestUpdated 2");
  });
});
