import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { credits?: number }) => key === "revisionCta" ? `Gerar variação · ${values?.credits} créditos` : key,
}));

const annotationMocks = vi.hoisted(() => ({ compile: vi.fn((annotations: Array<{ comment: string }>, generalComment?: string) => [generalComment?.trim(), ...annotations.map((annotation, index) => `${index + 1}. ${annotation.comment}`)].filter(Boolean).join("\n")), render: vi.fn(), isMobile: vi.fn(() => false) }));
const layerEditorMocks = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("@/lib/hooks/use-media-query", () => ({ useIsMobile: annotationMocks.isMobile }));
vi.mock("@/components/creative-work/layer-editor/LayerEditorDialog", () => ({
  LayerEditorDialog: (props: { open: boolean; workItemId: string; outputId: string; mode: "edit" | "inspect"; onOpenChange: (open: boolean) => void }) => {
    layerEditorMocks.render(props);
    return props.open ? <div data-testid="layer-editor-dialog" data-work-item-id={props.workItemId} data-output-id={props.outputId} data-mode={props.mode} /> : null;
  },
}));
vi.mock("@/components/assistant/CreativeAnnotationEditor", () => ({
  default: ({ onAdd, annotations, isMobile, layout, sidePanel, onBusyChange, generalComment = "", onGeneralCommentChange }: { onAdd: (item: { x: number; y: number; width: number; height: number; comment: string }) => void; annotations: Array<{ comment: string }>; isMobile: boolean; layout?: string; sidePanel?: React.ReactNode; onBusyChange?: (busy: boolean) => void; generalComment?: string; onGeneralCommentChange?: (comment: string) => void }) => <div data-testid="annotation-editor" data-layout={layout} data-mobile={String(isMobile)} data-count={annotations.length}><div data-testid="annotation-editor-preview">{isMobile ? <div data-testid="annotation-mobile-drawing-disabled" /> : <button type="button" onClick={() => onAdd({ x: 0.1, y: 0.2, width: 0.3, height: 0.2, comment: "Reduzir título" })}>add annotation</button>}</div><aside data-testid="annotation-editor-right-panel"><textarea data-testid="annotation-general-comment" value={generalComment} onChange={(event) => onGeneralCommentChange?.(event.target.value)} /><button type="button" onClick={() => onBusyChange?.(true)}>voice busy</button><button type="button" onClick={() => onBusyChange?.(false)}>voice idle</button>{annotations.length > 0 ? <ol data-testid="annotation-numbered-list"><li>1. Reduzir título</li></ol> : null}{sidePanel}</aside></div>,
}));
vi.mock("@/components/creative-work/output-annotation", () => ({
  OUTPUT_ANNOTATION_MAX_COUNT: 5,
  OUTPUT_ANNOTATION_COMMENT_MAX_LENGTH: 300,
  compileOutputAnnotationInstruction: annotationMocks.compile,
  renderAnnotatedOutputFile: annotationMocks.render,
}));

import CreativeProposalGrid from "./CreativeProposalGrid";

describe("CreativeProposalGrid", () => {
  beforeEach(() => { vi.clearAllMocks(); annotationMocks.isMobile.mockReturnValue(false); });
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
    expect(screen.getByRole("button", { name: "Editar" })).toBeVisible();

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
    expect(screen.getByTestId("annotation-editor")).toBeVisible();
    expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-layout", "split");
  });

  it("opens one edit dialog for the selected layerized output and closes annotation inspection", () => {
    const layerized = {
      ...balancedCompleted,
      isSelected: true,
      layerEditor: { revision: 2, layerCount: 3, regenerationStatus: null, updatedAt: "2026-08-22T00:00:00.000Z" },
    };
    const before = window.location.href;
    render(<CreativeProposalGrid outputs={[layerized]} onRetry={vi.fn()} onApprove={vi.fn()} onDownload={vi.fn()} onRevise={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Ampliar Equilibrada em 4:5" }));
    expect(screen.getByTestId("annotation-editor")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Editar camadas", hidden: true }));

    expect(screen.queryByTestId("annotation-editor")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("layer-editor-dialog")).toHaveLength(1);
    expect(screen.getByTestId("layer-editor-dialog")).toHaveAttribute("data-output-id", "out-balanced");
    expect(screen.getByTestId("layer-editor-dialog")).toHaveAttribute("data-mode", "edit");
    expect(window.location.href).toBe(before);
  });

  it("opens inspect mode for an unselected output and on mobile", () => {
    const inspectable = {
      ...balancedCompleted,
      layerEditor: { revision: 2, layerCount: 3, regenerationStatus: null, updatedAt: "2026-08-22T00:00:00.000Z" },
    };
    const { unmount } = render(<CreativeProposalGrid outputs={[inspectable]} onRetry={vi.fn()} onApprove={vi.fn()} onDownload={vi.fn()} onRevise={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Visualizar camadas" }));
    expect(screen.getByTestId("layer-editor-dialog")).toHaveAttribute("data-mode", "inspect");
    unmount();

    annotationMocks.isMobile.mockReturnValue(true);
    render(<CreativeProposalGrid outputs={[{ ...inspectable, isSelected: true }]} onRetry={vi.fn()} onApprove={vi.fn()} onDownload={vi.fn()} onRevise={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar camadas" }));
    expect(screen.getByTestId("layer-editor-dialog")).toHaveAttribute("data-mode", "inspect");
  });

  it("submits one annotated revision and clears only on success", async () => {
    const onRevise = vi.fn(async () => true);
    const annotatedFile = new File(["png"], "output-out-balanced-annotations.png", { type: "image/png" });
    annotationMocks.render.mockResolvedValueOnce(annotatedFile);
    render(<CreativeProposalGrid outputs={[balancedCompleted]} onRetry={vi.fn()} onApprove={vi.fn()} onDownload={vi.fn()} onRevise={onRevise} />);
    fireEvent.click(screen.getByRole("button", { name: /Ampliar/ }));
    fireEvent.click(screen.getByRole("button", { name: "add annotation" }));
    expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-count", "1");
    fireEvent.click(screen.getByRole("button", { name: "Gerar variação · 50 créditos" }));
    await waitFor(() => expect(onRevise).toHaveBeenCalledWith("out-balanced", "1. Reduzir título", annotatedFile));
    expect(onRevise).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("submits general-only feedback once without an annotated upload and clears it on success", async () => {
    const onRevise = vi.fn(async () => true);
    render(<CreativeProposalGrid outputs={[balancedCompleted]} onRetry={vi.fn()} onApprove={vi.fn()} onDownload={vi.fn()} onRevise={onRevise} />);
    fireEvent.click(screen.getByRole("button", { name: /Ampliar/ }));
    fireEvent.change(screen.getByTestId("annotation-general-comment"), { target: { value: "  Ajustar contraste  " } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar variação · 50 créditos" }));
    await waitFor(() => expect(onRevise).toHaveBeenCalledWith("out-balanced", "Ajustar contraste", null));
    expect(onRevise).toHaveBeenCalledTimes(1);
    expect(annotationMocks.render).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Ampliar/ }));
    expect(screen.getByTestId("annotation-general-comment")).toHaveValue("");
  });

  it("submits general feedback and numbered rectangles in one annotated revision", async () => {
    const onRevise = vi.fn(async () => true);
    const annotatedFile = new File(["png"], "output.png", { type: "image/png" });
    annotationMocks.render.mockResolvedValueOnce(annotatedFile);
    render(<CreativeProposalGrid outputs={[balancedCompleted]} onRetry={vi.fn()} onApprove={vi.fn()} onDownload={vi.fn()} onRevise={onRevise} />);
    fireEvent.click(screen.getByRole("button", { name: /Ampliar/ }));
    fireEvent.change(screen.getByTestId("annotation-general-comment"), { target: { value: "Ajustar contraste" } });
    fireEvent.click(screen.getByRole("button", { name: "add annotation" }));
    fireEvent.click(screen.getByRole("button", { name: "Gerar variação · 50 créditos" }));
    await waitFor(() => expect(onRevise).toHaveBeenCalledWith("out-balanced", "Ajustar contraste\n1. Reduzir título", annotatedFile));
    expect(annotationMocks.render).toHaveBeenCalledTimes(1);
  });

  it("blocks the paid annotation CTA while voice is busy, then submits once after idle", async () => {
    const onRevise = vi.fn(async () => true);
    const annotatedFile = new File(["png"], "output-out-balanced-annotations.png", { type: "image/png" });
    annotationMocks.render.mockResolvedValueOnce(annotatedFile);
    render(<CreativeProposalGrid outputs={[balancedCompleted]} onRetry={vi.fn()} onApprove={vi.fn()} onDownload={vi.fn()} onRevise={onRevise} />);
    fireEvent.click(screen.getByRole("button", { name: /Ampliar/ }));
    fireEvent.click(screen.getByRole("button", { name: "add annotation" }));
    fireEvent.click(screen.getByRole("button", { name: "voice busy" }));
    const revise = screen.getByRole("button", { name: "Gerar variação · 50 créditos" });
    expect(revise).toBeDisabled();
    fireEvent.click(revise);
    expect(onRevise).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "voice idle" }));
    fireEvent.click(screen.getByRole("button", { name: "Gerar variação · 50 créditos" }));
    await waitFor(() => expect(onRevise).toHaveBeenCalledWith("out-balanced", "1. Reduzir título", annotatedFile));
    expect(onRevise).toHaveBeenCalledTimes(1);
  });

  it("places numbered comments and the revision control in the inspector right panel", () => {
    render(<CreativeProposalGrid outputs={[balancedCompleted]} onRetry={vi.fn()} onApprove={vi.fn()} onDownload={vi.fn()} onRevise={vi.fn(async () => true)} />);
    fireEvent.click(screen.getByRole("button", { name: "Ampliar Equilibrada em 4:5" }));
    fireEvent.click(screen.getByRole("button", { name: "add annotation" }));
    const rightPanel = screen.getByTestId("annotation-editor-right-panel");
    expect(rightPanel).toContainElement(screen.getByTestId("annotation-numbered-list"));
    expect(rightPanel).toContainElement(screen.getByRole("button", { name: "Gerar variação · 50 créditos" }));
    expect(screen.getByTestId("annotation-editor-preview")).not.toContainElement(screen.getByTestId("annotation-numbered-list"));
  });

  it("keeps rectangle and general drafts isolated across a two-output round trip after command failure", async () => {
    const onRevise = vi.fn(async () => false);
    annotationMocks.render.mockResolvedValueOnce(new File(["png"], "output.png", { type: "image/png" }));
    render(<CreativeProposalGrid outputs={[conservativeCompleted, balancedCompleted]} onRetry={vi.fn()} onApprove={vi.fn()} onDownload={vi.fn()} onRevise={onRevise} />);
    fireEvent.click(screen.getByRole("button", { name: "Ampliar Conservadora em 4:5" }));
    fireEvent.click(screen.getByRole("button", { name: "add annotation" }));
    fireEvent.change(screen.getByTestId("annotation-general-comment"), { target: { value: "Primeiro" } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar variação · 50 créditos" }));
    await waitFor(() => expect(onRevise).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("annotationRevisionError");
    expect(screen.getByRole("button", { name: "Gerar variação · 50 créditos" })).toBeEnabled();
    expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-count", "1");
    expect(screen.getByTestId("annotation-general-comment")).toHaveValue("Primeiro");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Equilibrada em 4:5" }));
    fireEvent.click(screen.getByRole("button", { name: "Ampliar Equilibrada em 4:5" }));
    expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-count", "0");
    expect(screen.getByTestId("annotation-general-comment")).toHaveValue("");
    fireEvent.change(screen.getByTestId("annotation-general-comment"), { target: { value: "Segundo" } });
    fireEvent.click(screen.getByRole("button", { name: "add annotation" }));
    expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-count", "1");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Conservadora em 4:5" }));
    fireEvent.click(screen.getByRole("button", { name: "Ampliar Conservadora em 4:5" }));
    expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-count", "1");
    expect(screen.getByTestId("annotation-general-comment")).toHaveValue("Primeiro");
  });

  it("retains the draft and reports an alert when image preparation fails", async () => {
    annotationMocks.render.mockRejectedValueOnce(new Error("canvas failed"));
    const onRevise = vi.fn(async () => true);
    render(<CreativeProposalGrid outputs={[balancedCompleted]} onRetry={vi.fn()} onApprove={vi.fn()} onDownload={vi.fn()} onRevise={onRevise} />);
    fireEvent.click(screen.getByRole("button", { name: /Ampliar/ }));
    fireEvent.click(screen.getByRole("button", { name: "add annotation" }));
    fireEvent.change(screen.getByTestId("annotation-general-comment"), { target: { value: "Manter este texto" } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar variação · 50 créditos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("annotationPreparationError");
    expect(screen.getByRole("button", { name: "Gerar variação · 50 créditos" })).toBeEnabled();
    expect(annotationMocks.render).toHaveBeenCalledTimes(1);
    expect(onRevise).not.toHaveBeenCalled();
    expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-count", "1");
    expect(screen.getByTestId("annotation-general-comment")).toHaveValue("Manter este texto");
  });

  it("passes mobile mode to the annotation editor", () => {
    annotationMocks.isMobile.mockReturnValue(true);
    render(<CreativeProposalGrid outputs={[balancedCompleted]} onRetry={vi.fn()} onApprove={vi.fn()} onDownload={vi.fn()} onRevise={vi.fn(async () => true)} />);
    fireEvent.click(screen.getByRole("button", { name: "Ampliar Equilibrada em 4:5" }));
    expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-mobile", "true");
  });

  it("submits mobile feedback through the same single revision command", async () => {
    annotationMocks.isMobile.mockReturnValue(true);
    const onRevise = vi.fn(async () => true);
    render(<CreativeProposalGrid outputs={[balancedCompleted]} onRetry={vi.fn()} onApprove={vi.fn()} onDownload={vi.fn()} onRevise={onRevise} />);
    fireEvent.click(screen.getByRole("button", { name: "Ampliar Equilibrada em 4:5" }));
    expect(screen.getByTestId("annotation-mobile-drawing-disabled")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "add annotation" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("annotation-general-comment"), { target: { value: "Ajustar contraste" } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar variação · 50 créditos" }));
    await waitFor(() => expect(onRevise).toHaveBeenCalledWith("out-balanced", "Ajustar contraste", null));
    expect(onRevise).toHaveBeenCalledTimes(1);
  });
});
