import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({
    formatTrigger: "Adaptar formato",
    formatDialogLabel: "Proporções disponíveis",
    cancelFormat: "Cancelar adaptação",
  }[key] ?? key),
}));

import { PieceFormatPopover } from "./PieceFormatPopover";

function openPanel(value: "1:1" | "4:5" | "9:16" | null = null) {
  const onChoose = vi.fn();
  const onCancel = vi.fn();
  const view = render(<PieceFormatPopover value={value} onChoose={onChoose} onCancel={onCancel} />);
  fireEvent.click(screen.getByRole("button", { name: "Adaptar formato" }));
  return { onChoose, onCancel, ...view };
}

describe("PieceFormatPopover", () => {
  it("renders the anchored trigger and available proportions", () => {
    const { unmount } = render(<PieceFormatPopover value={null} onChoose={vi.fn()} onCancel={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Adaptar formato" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    unmount();
    openPanel();
    const dialog = screen.getByRole("dialog", { name: "Proporções disponíveis" });
    for (const format of ["1:1", "4:5", "9:16"]) {
      expect(screen.getByRole("button", { name: format, exact: true })).toBeInTheDocument();
    }
    expect(dialog.querySelector("button[aria-pressed='true']")).toBeNull();
  });

  it("marks only the applied format as pressed", () => {
    openPanel("4:5");
    expect(screen.getByRole("button", { name: "4:5", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "9:16", exact: true })).toHaveAttribute("aria-pressed", "false");
  });

  it("chooses a format without cancelling", () => {
    const { onChoose, onCancel } = openPanel("4:5");
    fireEvent.click(screen.getByRole("button", { name: "9:16", exact: true }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith("9:16");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("offers cancel only when an adaptation is applied", () => {
    const first = openPanel(null);
    expect(screen.queryByRole("button", { name: "Cancelar adaptação" })).not.toBeInTheDocument();
    first.unmount();
    const { onCancel, onChoose } = openPanel("9:16");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar adaptação" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("keeps the closed panel hidden in both popover and fallback environments", () => {
    const { unmount } = render(<PieceFormatPopover value={null} onChoose={vi.fn()} onCancel={vi.fn()} />);
    // Closed panels are hidden, so role queries cannot see them — probe the DOM.
    const dialog = document.querySelector("div[popover]");
    expect(dialog).not.toBeNull();
    // Native popovers hide through the UA [popover] closed style; the class
    // must only restore flex on :popover-open, never unconditionally.
    expect(dialog!.className).toContain("[&:popover-open]:flex");
    expect(dialog!.className).not.toMatch(/(?:^|\s)flex(?:\s|$)/);
    // jsdom has no popover API: the inline fallback must hide the closed panel.
    expect(dialog).toHaveStyle({ display: "none" });
    unmount();
  });

  it("closes through Escape without choosing or cancelling", () => {
    const { onChoose, onCancel } = openPanel(null);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Proporções disponíveis" }), { key: "Escape" });
    expect(onChoose).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Adaptar formato" })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("PieceFormatPopover offered formats (ICE-04B)", () => {
  it("renders 3:4 only when the offered list includes it", () => {
    const first = render(
      <PieceFormatPopover value={null} onChoose={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Adaptar formato" }));
    expect(screen.queryByRole("button", { name: "3:4", exact: true })).not.toBeInTheDocument();
    first.unmount();

    render(
      <PieceFormatPopover
        value={null}
        formats={["1:1", "4:5", "9:16", "3:4"]}
        onChoose={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Adaptar formato" }));
    fireEvent.click(screen.getByRole("button", { name: "3:4", exact: true }));
  });
});
