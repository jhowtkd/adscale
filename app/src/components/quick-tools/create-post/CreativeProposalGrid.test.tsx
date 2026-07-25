import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import CreativeProposalGrid from "./CreativeProposalGrid";

describe("CreativeProposalGrid", () => {
  const conservativeCompleted = {
    id: "out-conservative",
    workspaceId: "ws-1",
    workItemId: "work-1",
    creativeLevel: "conservative" as const,
    targetFormat: "4:5" as const,
    versionNumber: 1,
    parentOutputId: null,
    revisionInstruction: null,
    revisionAssetId: null,
    retryCount: 0,
    operationKey: "conservative:4:5:1",
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
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={vi.fn()}
      />,
    );

    const levels = screen.getAllByTestId("proposal-level-name");
    expect(levels.map((el) => el.textContent)).toEqual(["Conservadora", "Equilibrada", "Ousada"]);
  });

  it("exposes a retry affordance on failed cards", () => {
    render(
      <CreativeProposalGrid
        outputs={outputs}
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Repetir esta proposta" })).toBeVisible();
  });

  it("exposes approve, download, and edit actions on completed cards", () => {
    render(
      <CreativeProposalGrid
        outputs={outputs}
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Aprovar" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Baixar" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Editar" })).toHaveLength(2);
  });

  it("invokes retry/save/download callbacks", () => {
    const onRetry = vi.fn();
    const onApprove = vi.fn();
    const onDownload = vi.fn();

    render(
      <CreativeProposalGrid
        outputs={outputs}
        onRetry={onRetry}
        onApprove={onApprove}
        onDownload={onDownload}
        onRevise={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Repetir esta proposta" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Aprovar" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Baixar" })[0]);

    expect(onRetry).toHaveBeenCalledWith(boldFailed.id);
    expect(onApprove).toHaveBeenCalledWith(conservativeCompleted.id);
    expect(onDownload).toHaveBeenCalledWith(conservativeCompleted.id);
  });

  it("renders one planned output without synthetic empty cards", () => {
    render(
      <CreativeProposalGrid
        outputs={[balancedCompleted]}
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId("proposal-level")).toHaveLength(1);
    expect(screen.getByTestId("proposal-level-name")).toHaveTextContent("Equilibrada");
  });
});
