import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreditConfirmModal from "./CreditConfirmModal";

describe("CreditConfirmModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    render(
      <CreditConfirmModal
        open={false}
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByTestId("credit-confirm-modal")).not.toBeInTheDocument();
  });

  it("renders neutral version context when open", () => {
    render(
      <CreditConfirmModal
        open={true}
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByTestId("credit-confirm-modal")).toBeInTheDocument();
    expect(screen.getByText(/A versão atual continuará disponível/)).toBeInTheDocument();
    expect(screen.queryByText(/crédit|saldo|custo/i)).not.toBeInTheDocument();
  });

  it("renders confirm and cancel buttons", () => {
    render(
      <CreditConfirmModal
        open={true}
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button clicked and closes modal", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <CreditConfirmModal
        open={true}
        isPending={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel when cancel button clicked", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <CreditConfirmModal
        open={true}
        isPending={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables confirm button and shows spinner when isPending is true", () => {
    render(
      <CreditConfirmModal
        open={true}
        isPending={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const confirmBtn = screen.getByRole("button", { name: /Confirmar/ });
    expect(confirmBtn).toBeDisabled();
    expect(confirmBtn.querySelector("svg")).toBeTruthy();
  });

  it("disables cancel button when isPending is true", () => {
    render(
      <CreditConfirmModal
        open={true}
        isPending={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  });

  it("calls onCancel when dialog is closed via backdrop escape", () => {
    const onCancel = vi.fn();
    render(
      <CreditConfirmModal
        open={true}
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    const dialog = screen.getByTestId("credit-confirm-modal");
    expect(dialog).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });
});
