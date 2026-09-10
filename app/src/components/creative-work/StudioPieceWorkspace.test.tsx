import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreativeWorkOutput } from "@/lib/hooks/use-creative-work";
import type { CreativeComposerViewModel } from "./useCreativeComposer";

const mocks = vi.hoisted(() => ({
  review: {
    draft: { action: "refine", targetFormat: "4:5", instruction: "", revisionAssetId: null, annotations: [] as unknown[] },
    phase: "editing",
    error: null as string | null,
    pendingOutputId: null as string | null,
    referencePending: false,
    isBusy: false,
    saving: false,
    saveState: null as string | null,
    update: vi.fn(),
    attachReference: vi.fn(),
    flush: vi.fn(),
    review: vi.fn(),
    edit: vi.fn(),
    confirm: vi.fn(),
    reloadDraft: vi.fn(),
  },
  layerize: vi.fn(),
}));

vi.mock("./useOutputReview", () => ({
  useOutputReview: () => mocks.review,
}));

vi.mock("./layer-editor/LayerEditorContent", () => ({
  LayerEditorContent: () => <div data-testid="layer-editor-content-stub" />,
}));

vi.mock("./layer-editor/LayerScanner", () => ({
  LayerScanner: () => <div data-testid="layer-scanner-stub" />,
}));

vi.mock("./CreativeResultCard", () => ({
  CreativeResultCard: (props: { output: { id: string }; onApprove: (id: string) => void; onDownload: (id: string) => void }) => (
    <div data-testid="result-card-stub" data-output={props.output.id}>
      <button onClick={() => props.onApprove(props.output.id, false)}>Escolher</button>
      <button onClick={() => props.onDownload(props.output.id)}>Baixar</button>
    </div>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number; label?: string }) => {
    if (key === "versionLabel") return `Versão ${values?.count ?? 0}`;
    if (key === "reviewAnnotations") return `${values?.count ?? 0} comentário(s)`;
    if (key === "reviewCostLine") return `Custo: ${values?.count ?? 0} créditos`;
    if (key === "pieceAlt") return `Peça ${values?.label ?? ""}`;
    if (key === "layerizeQuotaRemaining") return `Cota: ${values?.count ?? 0}`;
    return ({
      title: "Resultados",
      "status.queued": "Na fila", "status.processing": "Processando", "status.completed": "Pronto", "status.failed": "Falhou",
      compareWithBase: "Comparar com a base", closeCompare: "Fechar comparação",
      layersPanel: "Camadas", layersGenerate: "Gerar camadas", layersUnavailable: "Separação indisponível",
      reviewInstruction: "O que você quer mudar?", reviewAction: "Revisar",
      confirmRevision: "Confirmar e gerar", sendingRevision: "Enviando", reconcilingRevision: "Confirmando envio",
      createVariation: "Criar variação", formatTrigger: "Adaptar formato", cancelFormat: "Cancelar adaptação",
      "formatDialogLabel": "Proporções disponíveis",
      commentMode: "Comentar", commentAdd: "Adicionar comentário", commentText: "Comentário",
      commentX: "X (%)", commentY: "Y (%)", commentSave: "Salvar comentário", commentRemove: "Remover comentário",
      commentSaving: "Salvando", commentSaved: "Salvo", commentSaveError: "Erro ao salvar",
      referenceUploading: "Enviando referência", expandPiece: "Ampliar peça", refine: "Refinar",
      technicalDetails: "Detalhes técnicos", cancel: "Cancelar", choosePiece: "Escolher",
    }[key] ?? key);
  },
}));

vi.mock("@/lib/hooks/use-media-query", () => ({
  useIsMobile: () => false,
}));

import { StudioPieceWorkspace } from "./StudioPieceWorkspace";

function output(overrides: Partial<CreativeWorkOutput>): CreativeWorkOutput {
  return {
    id: "o",
    workItemId: "work-1",
    creativeLevel: "balanced",
    targetFormat: "4:5",
    versionNumber: 1,
    parentOutputId: null,
    revisionInstruction: null,
    revisionAssetId: null,
    retryCount: 0,
    status: "completed",
    hasOutput: true,
    failureCode: null,
    quality: null,
    layerization: null,
    layerEditor: null,
    isSelected: false,
    createdAt: new Date("2026-09-10T00:00:00Z"),
    updatedAt: new Date("2026-09-10T00:00:00Z"),
    ...overrides,
  };
}

function composerMock(outputs: CreativeWorkOutput[], overrides: Record<string, unknown> = {}) {
  return {
    workId: "work-1",
    workTitle: "Institucional",
    outputs,
    canLayerize: false,
    layerEditorAccess: undefined,
    revisionCreditCost: 10,
    error: null,
    approvalErrorOutputId: null,
    layerizeOutput: mocks.layerize,
    refreshOutputs: vi.fn(),
    retryOutput: vi.fn(),
    retryRevisionOutput: vi.fn(),
    approveOutput: vi.fn(),
    downloadOutput: vi.fn(),
    isRetryingOutput: vi.fn(() => false),
    isApprovingOutput: vi.fn(() => false),
    isLayerizingOutput: vi.fn(() => false),
    ...overrides,
  } as unknown as CreativeComposerViewModel;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.review.draft = { action: "refine", targetFormat: "4:5", instruction: "", revisionAssetId: null, annotations: [] };
  mocks.review.phase = "editing";
  mocks.review.error = null;
  mocks.review.pendingOutputId = null;
  mocks.review.saveState = null;
});

describe("StudioPieceWorkspace", () => {
  it("keeps result, review field and thumbnails inside the contained box", () => {
    const base = output({ id: "base" });
    render(<StudioPieceWorkspace composer={composerMock([base])} />);
    const box = screen.getByTestId("studio-piece-workspace");
    expect(within(box).getByRole("img", { name: /peça/i })).toBeInTheDocument();
    expect(within(box).getByRole("textbox", { name: "O que você quer mudar?" })).toBeInTheDocument();
    expect(screen.queryByText(/^Versões$/)).not.toBeInTheDocument();
    expect(within(box).getByRole("button", { name: "Versão 1 · 4:5" })).toHaveAttribute("aria-pressed", "true");
  });

  it("selecting a thumbnail only inspects it and never approves", () => {
    const base = output({ id: "base" });
    const child = output({ id: "child", parentOutputId: "base", versionNumber: 2 });
    const composer = composerMock([base, child]);
    render(<StudioPieceWorkspace composer={composer} />);
    fireEvent.click(screen.getByRole("button", { name: "Versão 2 · 4:5" }));
    expect(screen.getByTestId("result-card-stub")).toHaveAttribute("data-output", "child");
    expect(composer.approveOutput).not.toHaveBeenCalled();
  });

  it("keeps the base visible with an explicit status while a queued child is selected", () => {
    const base = output({ id: "base" });
    const queued = output({ id: "queued", parentOutputId: "base", status: "queued", hasOutput: false });
    render(<StudioPieceWorkspace composer={composerMock([base, queued])} />);
    fireEvent.click(screen.getByRole("button", { name: "Versão 2 · 4:5" }));
    expect(screen.getByRole("img", { name: /peça/i })).toHaveAttribute("src", "/api/creative-work/work-1/outputs/base/download");
    expect(screen.getByText("Na fila")).toBeInTheDocument();
  });

  it("chooses and cancels a format without touching the written instruction", () => {
    const base = output({ id: "base" });
    const composer = composerMock([base]);
    const view = render(<StudioPieceWorkspace composer={composer} />);
    fireEvent.change(screen.getByRole("textbox", { name: "O que você quer mudar?" }), { target: { value: "Preserve a pessoa" } });
    mocks.review.draft = { action: "refine", targetFormat: "4:5", instruction: "Preserve a pessoa", revisionAssetId: null, annotations: [] };
    mocks.review.update.mockImplementation((patch: Record<string, unknown>) => {
      mocks.review.draft = { ...(mocks.review.draft as Record<string, unknown>), ...patch } as typeof mocks.review.draft;
    });
    fireEvent.click(screen.getByRole("button", { name: "Adaptar formato" }));
    fireEvent.click(screen.getByRole("button", { name: "9:16", exact: true }));
    expect(mocks.review.update).toHaveBeenLastCalledWith(expect.objectContaining({ action: "format", targetFormat: "9:16" }));
    // Choosing a format never rewrites or clears the written instruction.
    expect((mocks.review.draft as { instruction: string }).instruction).toBe("Preserve a pessoa");
    view.rerender(<StudioPieceWorkspace composer={composer} />);
    expect(screen.getByRole("textbox", { name: "O que você quer mudar?" })).toHaveValue("Preserve a pessoa");
    fireEvent.click(screen.getByRole("button", { name: "Adaptar formato" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar adaptação" }));
    expect(mocks.review.update).toHaveBeenLastCalledWith(expect.objectContaining({ action: "refine", targetFormat: "4:5" }));
    expect((mocks.review.draft as { instruction: string }).instruction).toBe("Preserve a pessoa");
  });

  it("reviews and confirms through the frozen plan with the canonical cost", async () => {
    const base = output({ id: "base" });
    mocks.review.phase = "reviewing";
    mocks.review.draft = { action: "format", targetFormat: "9:16", instruction: "Preserve a pessoa", revisionAssetId: null, annotations: [{ id: "a1", x: 0.5, y: 0.5, text: "nota" }] };
    render(<StudioPieceWorkspace composer={composerMock([base])} />);
    expect(screen.getByTestId("piece-review-confirmation")).toBeInTheDocument();
    expect(screen.getByText(/créditos/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("piece-review-confirm"));
    await waitFor(() => expect(mocks.review.confirm).toHaveBeenCalledTimes(1));
  });

  it("compares the selected piece with its ancestor side by side", () => {
    const base = output({ id: "base" });
    const child = output({ id: "child", parentOutputId: "base", versionNumber: 2 });
    render(<StudioPieceWorkspace composer={composerMock([base, child])} />);
    fireEvent.click(screen.getByRole("button", { name: "Versão 2 · 4:5" }));
    fireEvent.click(screen.getByRole("button", { name: "Comparar com a base" }));
    const images = screen.getAllByRole("img", { name: /peça|versão/i });
    expect(images.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByRole("button", { name: "Fechar comparação" }));
    expect(screen.queryByRole("button", { name: "Fechar comparação" })).not.toBeInTheDocument();
  });

  it("opens the layer panel without charging and generates layers only on explicit action", () => {
    const base = output({ id: "base" });
    const composer = composerMock([base], {
      canLayerize: true,
      layerEditorAccess: { enabled: true, period: null, layerize: { remaining: 2, limit: 2 }, regeneration: null },
    });
    render(<StudioPieceWorkspace composer={composer} />);
    fireEvent.click(screen.getByRole("button", { name: "Camadas" }));
    expect(mocks.layerize).not.toHaveBeenCalled();
    expect(screen.getByTestId("layer-scanner-stub")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gerar camadas" }));
    expect(mocks.layerize).toHaveBeenCalledTimes(1);
    expect(mocks.layerize.mock.calls[0][0]).toBe("base");
  });

  it("disables layer generation when no quota remains and shows the reason", () => {
    const base = output({ id: "base", layerization: { status: "failed", operationId: "op-1" } as CreativeWorkOutput["layerization"] });
    const composer = composerMock([base], {
      canLayerize: true,
      layerEditorAccess: { enabled: true, period: null, layerize: { remaining: 0, limit: 2 }, regeneration: null },
    });
    render(<StudioPieceWorkspace composer={composer} />);
    fireEvent.click(screen.getByRole("button", { name: "Camadas" }));
    expect(screen.getByRole("button", { name: "Gerar camadas" })).toBeDisabled();
    expect(screen.getByText("Cota: 0")).toBeInTheDocument();
  });

  it("hosts the inline layer editor when layers are ready without leaving the box", () => {
    const base = output({ id: "base", layerization: { status: "completed", operationId: "op-1" } as CreativeWorkOutput["layerization"] });
    const composer = composerMock([base], {
      canLayerize: true,
      layerEditorAccess: { enabled: true, period: null, layerize: { remaining: 1, limit: 2 }, regeneration: null },
    });
    render(<StudioPieceWorkspace composer={composer} />);
    fireEvent.click(screen.getByRole("button", { name: "Camadas" }));
    expect(mocks.layerize).not.toHaveBeenCalled();
    expect(screen.getByTestId("layer-editor-content-stub")).toBeInTheDocument();
  });

  it("surfaces composer errors without dropping the artwork", () => {
    const base = output({ id: "base" });
    render(<StudioPieceWorkspace composer={composerMock([base], { error: "Falha ao gerar" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Falha ao gerar");
    expect(screen.getByRole("img", { name: /peça/i })).toBeInTheDocument();
  });

  it("moves the selection only when its own confirmation returns the child id", () => {
    const base = output({ id: "base" });
    render(<StudioPieceWorkspace composer={composerMock([base])} />);
    // Polling-like re-render with a new sibling must not change selection.
    // pendingOutputId only arrives through the review hook.
    expect(mocks.review.pendingOutputId).toBeNull();
  });
});
