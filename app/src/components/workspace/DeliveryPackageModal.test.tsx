import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DeliveryPackageModal from "./DeliveryPackageModal";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("DeliveryPackageModal", () => {
  it("shows all formats selected by default and disables the source format", () => {
    render(
      <DeliveryPackageModal
        open
        sourceFormat="1:1"
        isSubmitting={false}
        onOpenChange={vi.fn()}
        onDownloadCurrent={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByLabelText("1:1")).toBeChecked();
    expect(screen.getByLabelText("1:1")).toBeDisabled();
    expect(screen.getByLabelText("4:5")).toBeChecked();
    expect(screen.getByLabelText("9:16")).toBeChecked();
  });

  it("allows unselecting non-source formats", () => {
    render(
      <DeliveryPackageModal
        open
        sourceFormat="1:1"
        isSubmitting={false}
        onOpenChange={vi.fn()}
        onDownloadCurrent={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText("4:5"));
    expect(screen.getByLabelText("4:5")).not.toBeChecked();
    expect(screen.getByLabelText("1:1")).toBeChecked();
  });

  it("calls onConfirm with selected formats", () => {
    const onConfirm = vi.fn();
    render(
      <DeliveryPackageModal
        open
        sourceFormat="1:1"
        isSubmitting={false}
        onOpenChange={vi.fn()}
        onDownloadCurrent={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByLabelText("9:16"));
    fireEvent.click(screen.getByLabelText("1.91:1"));
    fireEvent.click(screen.getByLabelText("16:9"));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(onConfirm).toHaveBeenCalledWith(["1:1", "4:5"]);
  });

  it("disables confirm when only the source format is selected", () => {
    render(
      <DeliveryPackageModal
        open
        sourceFormat="1:1"
        isSubmitting={false}
        onOpenChange={vi.fn()}
        onDownloadCurrent={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText("4:5"));
    fireEvent.click(screen.getByLabelText("9:16"));
    fireEvent.click(screen.getByLabelText("1.91:1"));
    fireEvent.click(screen.getByLabelText("16:9"));

    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("downloads the current creative even when no extra formats are selected", () => {
    const onDownloadCurrent = vi.fn();
    render(
      <DeliveryPackageModal
        open
        sourceFormat="1:1"
        isSubmitting={false}
        onOpenChange={vi.fn()}
        onDownloadCurrent={onDownloadCurrent}
        onConfirm={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText("4:5"));
    fireEvent.click(screen.getByLabelText("9:16"));
    fireEvent.click(screen.getByLabelText("1.91:1"));
    fireEvent.click(screen.getByLabelText("16:9"));
    fireEvent.click(screen.getByRole("button", { name: /downloadCurrent/i }));

    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
    expect(onDownloadCurrent).toHaveBeenCalledOnce();
  });

  it("exports a 3:4 source via download-current without inventing a 3:4 derivation target (ICE-04B)", () => {
    const onDownloadCurrent = vi.fn();
    render(
      <DeliveryPackageModal
        open
        sourceFormat="3:4"
        isSubmitting={false}
        onOpenChange={vi.fn()}
        onDownloadCurrent={onDownloadCurrent}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("3:4")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /downloadCurrent/i }));
    expect(onDownloadCurrent).toHaveBeenCalledOnce();
  });
});
