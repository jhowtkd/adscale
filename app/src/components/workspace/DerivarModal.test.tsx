import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DerivarModal from "./DerivarModal";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("DerivarModal", () => {
  it("renders four option labels from i18n keys", () => {
    render(<DerivarModal open onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(screen.getByText("options.manualArt.title")).toBeInTheDocument();
    expect(screen.getByText("options.autoArt.title")).toBeInTheDocument();
    expect(screen.getByText("options.singleFormat.title")).toBeInTheDocument();
    expect(screen.getByText("options.batchFormat.title")).toBeInTheDocument();
  });

  it.each([
    ["options.manualArt.title", "manual_art"],
    ["options.autoArt.title", "auto_art"],
    ["options.singleFormat.title", "single_format"],
    ["options.batchFormat.title", "batch_format"],
  ] as const)("clicking %s calls onSelect with %s", (label, intent) => {
    const onSelect = vi.fn();
    render(<DerivarModal open onClose={vi.fn()} onSelect={onSelect} />);

    fireEvent.click(screen.getByText(label));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(intent);
  });
});
