import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CreativeProposalGrid from "./CreativeProposalGrid";

describe("CreativeProposalGrid", () => {
  const conservativeCompleted = {
    id: "out-conservative",
    workspaceId: "ws-1",
    workItemId: "work-1",
    creativeLevel: "conservative" as const,
    status: "completed" as const,
    outputKey: "key-conservative",
    cost: null,
    failureCode: null,
    quality: null,
    isSelected: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const balancedCompleted = {
    ...conservativeCompleted,
    id: "out-balanced",
    creativeLevel: "balanced" as const,
    outputKey: "key-balanced",
  };

  const boldFailed = {
    ...conservativeCompleted,
    id: "out-bold",
    creativeLevel: "bold" as const,
    status: "failed" as const,
    outputKey: null,
    failureCode: "provider_error",
  };

  const outputs = [boldFailed, conservativeCompleted, balancedCompleted];

  it("renders the three level cards in fixed neutral order", () => {
    render(
      <CreativeProposalGrid
        outputs={outputs}
        onRetry={vi.fn()}
        onSelect={vi.fn()}
        onSave={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    const levels = screen.getAllByTestId("proposal-level-name");
    expect(levels.map((el) => el.textContent)).toEqual(["conservative", "balanced", "bold"]);
  });

  it("exposes a retry affordance on failed cards", () => {
    render(
      <CreativeProposalGrid
        outputs={outputs}
        onRetry={vi.fn()}
        onSelect={vi.fn()}
        onSave={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Repetir esta proposta" })).toBeVisible();
  });

  it("exposes select/save/download on completed cards", () => {
    render(
      <CreativeProposalGrid
        outputs={outputs}
        onRetry={vi.fn()}
        onSelect={vi.fn()}
        onSave={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Selecionar" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Salvar na biblioteca" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Baixar" })).toHaveLength(2);
  });

  it("invokes retry/save/select/download callbacks", () => {
    const onRetry = vi.fn();
    const onSave = vi.fn();
    const onSelect = vi.fn();
    const onDownload = vi.fn();

    render(
      <CreativeProposalGrid
        outputs={outputs}
        onRetry={onRetry}
        onSelect={onSelect}
        onSave={onSave}
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Repetir esta proposta" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Selecionar" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Salvar na biblioteca" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Baixar" })[0]);

    expect(onRetry).toHaveBeenCalledWith(boldFailed.id);
    expect(onSelect).toHaveBeenCalledWith(conservativeCompleted.id);
    expect(onSave).toHaveBeenCalledWith(conservativeCompleted.id);
    expect(onDownload).toHaveBeenCalledWith(conservativeCompleted.id);
  });
});