import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({
    factoryActiveLabel: "Fábrica criativa em atividade",
    factoryQueuedTitle: "Aquecendo as máquinas",
    factoryQueuedDescription: "Sua peça entrou na linha de produção.",
    factoryProcessingTitle: "Aplicando tinta fresca",
    factoryProcessingDescription: "As engrenagens estão montando seu criativo.",
  })[key] ?? key,
}));

const layerEditorMocks = vi.hoisted(() => ({
  isMobile: vi.fn(() => false),
  render: vi.fn(),
}));

vi.mock("@/lib/hooks/use-media-query", () => ({ useIsMobile: layerEditorMocks.isMobile }));
vi.mock("@/components/creative-work/layer-editor/LayerEditorDialog", () => ({
  LayerEditorDialog: (props: { open: boolean; workItemId: string; outputId: string; mode: "edit" | "inspect" }) => {
    layerEditorMocks.render(props);
    return props.open ? (
      <div
        data-testid="layer-editor-dialog"
        data-work-item-id={props.workItemId}
        data-output-id={props.outputId}
        data-mode={props.mode}
      />
    ) : null;
  },
}));

import CreativeProposalGrid from "./CreativeProposalGrid";

describe("CreativeProposalGrid", () => {
  beforeEach(() => {
    layerEditorMocks.isMobile.mockReturnValue(false);
  });

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
    quality: { schemaVersion: 1, objectiveVerdict: "pass" },
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

  it("renders the three thumbnails in fixed neutral order", () => {
    render(
      <CreativeProposalGrid
        outputs={outputs}
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: /Selecionar/ }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Selecionar Conservadora em 4:5",
      "Selecionar Equilibrada em 4:5",
      "Selecionar Ousada em 4:5",
    ]);
    expect(screen.getByTestId("proposal-level-name")).toHaveTextContent("Conservadora");
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

    fireEvent.click(screen.getByRole("button", { name: "Selecionar Ousada em 4:5" }));
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

    expect(screen.getByRole("button", { name: "Aprovar" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Baixar" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Refinar" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Selecionar Equilibrada em 4:5" }));
    expect(screen.getByTestId("proposal-level-name")).toHaveTextContent("Equilibrada");
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeVisible();
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

    fireEvent.click(screen.getByRole("button", { name: "Selecionar Ousada em 4:5" }));
    fireEvent.click(screen.getByRole("button", { name: "Repetir esta proposta" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Conservadora em 4:5" }));
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    fireEvent.click(screen.getByRole("button", { name: "Baixar" }));

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

  it("shows the queued factory inside the selected preview", () => {
    render(
      <CreativeProposalGrid
        outputs={[{ ...balancedCompleted, status: "queued", outputKey: null }]}
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    const preview = screen.getByTestId("review-preview");
    expect(preview).toHaveAttribute("aria-busy", "true");
    const status = within(preview).getByRole("status");
    expect(status).toHaveTextContent("Aquecendo as máquinas");
    expect(status).toHaveTextContent("Sua peça entrou na linha de produção.");
    expect(within(status).getByRole("img", { name: "Fábrica criativa em atividade" })).toBeVisible();
  });

  it("updates the factory copy when image processing starts", () => {
    render(
      <CreativeProposalGrid
        outputs={[{ ...balancedCompleted, status: "processing", outputKey: null }]}
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    const status = within(screen.getByTestId("review-preview")).getByRole("status");
    expect(status).toHaveTextContent("Aplicando tinta fresca");
    expect(status).toHaveTextContent("As engrenagens estão montando seu criativo.");
  });

  it("keeps outputs with the same level separate when they come from directions", () => {
    const directionOutputs = [
      { ...balancedCompleted, id: "out-direction-1", directionId: "00000000-0000-4000-8000-000000000001", directionSnapshot: { label: "Direção 1", instruction: "Uma", order: 0 } },
      { ...balancedCompleted, id: "out-direction-2", directionId: "00000000-0000-4000-8000-000000000002", directionSnapshot: { label: "Direção 2", instruction: "Duas", order: 1 } },
    ];
    render(
      <CreativeProposalGrid
        outputs={directionOutputs}
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: /Selecionar Direção/ })).toHaveLength(2);
    expect(screen.getByTestId("proposal-level-name")).toHaveTextContent("Direção 1");

    fireEvent.click(screen.getByRole("button", { name: "Selecionar Direção 2 em 4:5" }));
    expect(screen.getByTestId("proposal-level-name")).toHaveTextContent("Direção 2");
  });

  it("uses thumbnails to navigate one faithful approval surface", () => {
    render(
      <CreativeProposalGrid
        outputs={[
          { ...conservativeCompleted, id: "square", targetFormat: "1:1" },
          { ...balancedCompleted, id: "portrait", targetFormat: "4:5" },
          { ...balancedCompleted, id: "story", targetFormat: "9:16" },
        ]}
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={vi.fn()}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Miniaturas das propostas" })).toBeVisible();
    expect(screen.getAllByTestId("proposal-level")).toHaveLength(1);
    expect(screen.getByTestId("review-preview")).toHaveStyle({ aspectRatio: "1 / 1" });
    expect(screen.getByRole("img", { name: /conservadora.*1:1/i })).toHaveClass("object-contain");

    fireEvent.click(screen.getByRole("button", { name: /selecionar equilibrada em 9:16/i }));

    expect(screen.getByTestId("review-preview")).toHaveStyle({ aspectRatio: "9 / 16" });
    expect(screen.getByRole("img", { name: /equilibrada.*9:16/i })).toHaveClass("object-contain");
  });

  it("renders a piece review as a centered one-column surface", () => {
    render(
      <CreativeProposalGrid
        outputs={[conservativeCompleted, balancedCompleted]}
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={vi.fn()}
        layout="piece"
      />,
    );

    expect(screen.getByTestId("proposal-review-surface")).toHaveClass("max-w-4xl", "grid-cols-1");
    expect(screen.getByRole("navigation", { name: "Miniaturas das propostas" })).not.toHaveClass("lg:flex-col");
    expect(screen.getByTestId("review-preview")).toHaveClass("h-[min(72vh,680px)]");
  });

  it("opens the selected proposal in a faithful enlarged inspector", () => {
    render(
      <CreativeProposalGrid
        outputs={[{ ...balancedCompleted, id: "story", targetFormat: "9:16" }]}
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ampliar Equilibrada em 9:16" }));

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("img", { name: /equilibrada.*9:16.*ampliada/i })).toHaveClass("object-contain");
  });

  it("opens edit mode for the selected layerized output", () => {
    render(
      <CreativeProposalGrid
        outputs={[{
          ...balancedCompleted,
          isSelected: true,
          layerization: { status: "completed" },
          layerEditor: { revision: 2, layerCount: 3, regenerationStatus: null, updatedAt: "2026-08-22T00:00:00.000Z" },
        }]}
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Editar camadas" }));
    expect(screen.getByTestId("layer-editor-dialog")).toHaveAttribute("data-output-id", "out-balanced");
    expect(screen.getByTestId("layer-editor-dialog")).toHaveAttribute("data-mode", "edit");
  });

  it("uses inspect mode for unselected and mobile layerized outputs", () => {
    const inspectable = {
      ...balancedCompleted,
      layerization: { status: "completed" as const },
      layerEditor: { revision: 2, layerCount: 3, regenerationStatus: null, updatedAt: "2026-08-22T00:00:00.000Z" },
    };
    const { unmount } = render(
      <CreativeProposalGrid outputs={[inspectable]} onRetry={vi.fn()} onApprove={vi.fn()} onDownload={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Visualizar camadas" }));
    expect(screen.getByTestId("layer-editor-dialog")).toHaveAttribute("data-mode", "inspect");
    unmount();

    layerEditorMocks.isMobile.mockReturnValue(true);
    render(
      <CreativeProposalGrid
        outputs={[{ ...inspectable, isSelected: true }]}
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar camadas" }));
    expect(screen.getByTestId("layer-editor-dialog")).toHaveAttribute("data-mode", "inspect");
  });
});
