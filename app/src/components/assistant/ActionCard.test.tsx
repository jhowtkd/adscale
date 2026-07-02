import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ActionCard, type ActionCardProps } from "./ActionCard";
import { quickRestyleContract } from "@/server/assistant/action-contracts/contracts/quick-restyle";
import messages from "../../../messages/pt-BR.json";

function renderCard(overrides: Partial<ActionCardProps> = {}) {
  const defaults: ActionCardProps = {
    contract: quickRestyleContract,
    snapshot: {
      baseCreativeId: "550e8400-e29b-41d4-a716-446655440000",
      styleReferenceId: "550e8400-e29b-41d4-a716-446655440001",
    },
    status: "pending",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <ActionCard {...defaults} {...overrides} />
    </NextIntlClientProvider>
  );
}

describe("ActionCard", () => {
  it("renders the action label as title", () => {
    renderCard();
    expect(screen.getByText(quickRestyleContract.label)).toBeInTheDocument();
  });

  it("does NOT display credit cost", () => {
    renderCard();
    expect(screen.queryByText(/créditos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/credits/i)).not.toBeInTheDocument();
  });

  it("shows risk copy when optional field missing", () => {
    renderCard({
      snapshot: { baseCreativeId: "550e8400-e29b-41d4-a716-446655440000" },
    });
    expect(screen.getByText(/divergir/i)).toBeInTheDocument();
  });

  it("calls onConfirm when confirm clicked", () => {
    const onConfirm = vi.fn();
    renderCard({ onConfirm });
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel clicked", () => {
    const onCancel = vi.fn();
    renderCard({ onCancel });
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows spinner in executing state", () => {
    renderCard({ status: "executing" });
    expect(screen.getByText(/gerando/i)).toBeInTheDocument();
    // confirm/cancel buttons are not shown while executing
    expect(
      screen.queryByRole("button", { name: /confirmar/i })
    ).not.toBeInTheDocument();
  });

  it("renders success copy in completed state", () => {
    renderCard({ status: "completed" });
    expect(screen.getByText(/conclu[ií]do/i)).toBeInTheDocument();
  });

  it("renders error copy in error state", () => {
    renderCard({ status: "error", errorMessage: "boom" });
    expect(screen.getByText(/falha/i)).toBeInTheDocument();
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
  });

  it("renders edit fields when Edit clicked and editFields provided", () => {
    const onEditSubmit = vi.fn();
    renderCard({
      editFields: <label>Intensidade <input /></label>,
      onEditSubmit,
    });
    // Edit button only appears when editFields provided
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(screen.getByText(/intensidade/i)).toBeInTheDocument();
  });

  it("calls onEditSubmit when Save clicked in edit mode", () => {
    const onEditSubmit = vi.fn();
    renderCard({
      editFields: <label>Intensidade <input /></label>,
      onEditSubmit,
    });
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    // In edit mode the Confirm button triggers handleSubmitEdit
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    expect(onEditSubmit).toHaveBeenCalledOnce();
  });

  it("returns to non-editing view when Cancel clicked in edit mode", () => {
    const onEditSubmit = vi.fn();
    renderCard({
      // Missing optional styleReferenceId so risk copy renders
      snapshot: { baseCreativeId: "550e8400-e29b-41d4-a716-446655440000" },
      editFields: <label>Intensidade <input /></label>,
      onEditSubmit,
    });
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    // Edit fields are visible while editing
    expect(screen.getByText(/intensidade/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    // Back to non-editing: risk copy re-renders, edit fields disappear
    expect(screen.getByText(/divergir/i)).toBeInTheDocument();
    expect(screen.queryByText(/intensidade/i)).not.toBeInTheDocument();
    // Cancel must not trigger a save
    expect(onEditSubmit).not.toHaveBeenCalled();
  });

  it("does not show Edit button when editFields not provided", () => {
    renderCard();
    expect(
      screen.queryByRole("button", { name: /editar/i })
    ).not.toBeInTheDocument();
  });
});
