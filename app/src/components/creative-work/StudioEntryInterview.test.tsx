"use client";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudioEntryInterview } from "./StudioEntryInterview";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `entryInterview.${key}`,
}));

describe("StudioEntryInterview", () => {
  it("renders chips as toggle buttons with wrap layout", () => {
    const onSelect = vi.fn();
    const { container } = render(
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

    const chipButtons = screen.getAllByRole("button");
    expect(chipButtons).toHaveLength(4);
    expect(chipButtons[0]).toHaveAttribute("aria-pressed", "true");
    expect(chipButtons[1]).toHaveAttribute("aria-pressed", "false");

    const wrapRow = container.querySelector(".flex-wrap");
    expect(wrapRow).toBeInTheDocument();
    expect(wrapRow).not.toHaveClass("overflow-x-auto");

    fireEvent.click(chipButtons[2]);
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

    expect(screen.queryByRole("status")).not.toBeInTheDocument();

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

    expect(screen.queryByRole("status")).not.toBeInTheDocument();

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
