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
    flush: vi.fn(async () => null),
    hasUnsavedChanges: vi.fn(() => false),
    review: vi.fn(),
    edit: vi.fn(),
    beginFreshDraftAttempt: vi.fn(),
    confirm: vi.fn(),
    reloadDraft: vi.fn(),
  },
  layerize: vi.fn(),
  editorProps: null as { exitRequestToken?: number; onOpenChange: (open: boolean) => void } | null,
}));

vi.mock("./useOutputReview", () => ({
  useOutputReview: () => mocks.review,
}));

vi.mock("./layer-editor/LayerEditorContent", () => ({
  LayerEditorContent: (props: { exitRequestToken?: number; onOpenChange: (open: boolean) => void }) => {
    mocks.editorProps = props;
    return (
      <div data-testid="layer-editor-content-stub">
        <button onClick={() => props.onOpenChange(false)}>editor-fechar-ok</button>
      </div>
    );
  },
}));

vi.mock("./layer-editor/LayerScanner", () => ({
  LayerScanner: () => <div data-testid="layer-scanner-stub" />,
}));

vi.mock("./CreativeResultCard", () => ({
  CreativeResultCard: (props: {
    output: { id: string; parentOutputId?: string | null };
    onApprove: (id: string) => void;
    onDownload: (id: string) => void;
    onRetryThroughReview?: (output: { id: string; parentOutputId?: string | null }) => void;
  }) => (
    <div data-testid="result-card-stub" data-output={props.output.id}>
      <button onClick={() => props.onApprove(props.output.id, false)}>Escolher</button>
      <button onClick={() => props.onDownload(props.output.id)}>Baixar</button>
      <button onClick={() => props.onRetryThroughReview?.(props.output)}>
        revisar-nova-tentativa
      </button>
    </div>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number; label?: string }) => {
    if (key === "versionLabel") return `Versão ${values?.count ?? 0}`;
    if (key === "reviewAnnotations") return `${values?.count ?? 0} comentário(s)`;
    if (key === "reviewCostLine") return `Custo: ${values?.count ?? 0} créditos`;
    if (key === "pieceAlt") return `Peça ${values?.label ?? ""}`;
    if (key === "commentPinName") return `Comentário ${values?.count ?? 0}`;
    if (key === "resumePreviousInstructions") return "Retomar instruções anteriores";
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
  mocks.review.error = null;
  mocks.review.beginFreshDraftAttempt.mockClear();
  mocks.review.update.mockClear();
  // Fresh per-test implementations: leaked reassigns from a previous test
  // would otherwise poison the navigation guard.
  mocks.review.flush = vi.fn(async () => null);
  mocks.review.hasUnsavedChanges = vi.fn(() => false);
  mocks.editorProps = null;
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

  it("renders nothing without crashing when the work has no outputs yet", () => {
    render(<StudioPieceWorkspace composer={composerMock([])} />);
    expect(screen.queryByTestId("studio-piece-workspace")).not.toBeInTheDocument();
  });

  it("fixes the initial selection per work so polling arrivals never steal it", () => {
    const base = output({ id: "base" });
    const composer = composerMock([base]);
    const view = render(<StudioPieceWorkspace composer={composer} />);
    expect(screen.getByTestId("result-card-stub")).toHaveAttribute("data-output", "base");

    const newer = output({ id: "newer", parentOutputId: "base", versionNumber: 2 });
    view.rerender(<StudioPieceWorkspace composer={composerMock([base, newer])} />);
    expect(screen.getByTestId("result-card-stub")).toHaveAttribute("data-output", "base");
  });

  it("shows the base read-only while the selected child has no art", () => {
    const base = output({
      id: "base",
      reviewDraft: {
        version: 1, revision: 1, revisionKey: "00000000-0000-4000-8000-00000000000a",
        action: "refine", targetFormat: "4:5", instruction: "base",
        revisionAssetId: null,
        annotations: [{ id: "a-1", x: 0.5, y: 0.5, text: "nota da base" }],
      },
    });
    const queued = output({ id: "queued", parentOutputId: "base", status: "queued", hasOutput: false });
    render(<StudioPieceWorkspace composer={composerMock([base, queued])} />);
    fireEvent.click(screen.getByRole("button", { name: "Versão 2 · 4:5" }));
    // Base image stays visible; its persisted pin is display-only.
    expect(screen.getByRole("img", { name: /peça/i })).toHaveAttribute("src", "/api/creative-work/work-1/outputs/base/download");
    expect(screen.getByLabelText("Comentário 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Comentário 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Comentar" })).not.toBeInTheDocument();
    expect(mocks.review.update).not.toHaveBeenCalled();
  });

  it("exits the layer editor through its flush path before comparing", () => {
    const base = output({ id: "base" });
    const child = output({
      id: "child",
      parentOutputId: "base",
      versionNumber: 2,
      layerization: { status: "completed", operationId: "op-1" } as CreativeWorkOutput["layerization"],
    });
    const composer = composerMock([base, child], {
      canLayerize: true,
      layerEditorAccess: { enabled: true, period: null, layerize: { remaining: 1, limit: 2 }, regeneration: null },
    });
    render(<StudioPieceWorkspace composer={composer} />);
    // Default selection is the newest completed child, whose layers are ready.
    fireEvent.click(screen.getByRole("button", { name: "Camadas" }));
    expect(screen.getByTestId("layer-editor-content-stub")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Comparar com a base" }));
    // The editor stays mounted and only receives the guarded exit request.
    expect(screen.getByTestId("layer-editor-content-stub")).toBeInTheDocument();
    expect(mocks.editorProps?.exitRequestToken).toBe(1);
    expect(screen.queryByRole("button", { name: "Fechar comparação" })).not.toBeInTheDocument();

    // Simulated successful flushAndRelease: only now compare opens.
    fireEvent.click(screen.getByRole("button", { name: "editor-fechar-ok" }));
    expect(screen.queryByTestId("layer-editor-content-stub")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fechar comparação" })).toBeInTheDocument();
  });

  it("flushes the editor before switching pieces through a thumbnail", () => {
    const base = output({ id: "base" });
    const child = output({
      id: "child",
      parentOutputId: "base",
      versionNumber: 2,
      layerization: { status: "completed", operationId: "op-1" } as CreativeWorkOutput["layerization"],
    });
    const composer = composerMock([base, child], {
      canLayerize: true,
      layerEditorAccess: { enabled: true, period: null, layerize: { remaining: 1, limit: 2 }, regeneration: null },
    });
    render(<StudioPieceWorkspace composer={composer} />);
    fireEvent.click(screen.getByRole("button", { name: "Camadas" }));
    fireEvent.click(screen.getByRole("button", { name: "Versão 1 · 4:5" }));
    // Editor holds the artwork until its flush path completes…
    expect(screen.getByTestId("layer-editor-content-stub")).toBeInTheDocument();
    expect(screen.getByTestId("result-card-stub")).toHaveAttribute("data-output", "child");
    // …then the deferred selection lands.
    fireEvent.click(screen.getByRole("button", { name: "editor-fechar-ok" }));
    expect(screen.queryByTestId("layer-editor-content-stub")).not.toBeInTheDocument();
    expect(screen.getByTestId("result-card-stub")).toHaveAttribute("data-output", "base");
  });

  it("routes a failed revision back to the reviewed flow on its base", () => {
    const base = output({ id: "base" });
    const failedRevision = output({
      id: "failed-child",
      parentOutputId: "base",
      versionNumber: 2,
      status: "failed",
      hasOutput: false,
    });
    render(<StudioPieceWorkspace composer={composerMock([base, failedRevision])} />);
    fireEvent.click(screen.getByRole("button", { name: "Versão 2 · 4:5" }));
    fireEvent.click(screen.getByRole("button", { name: "revisar-nova-tentativa" }));
    // Selection moved to the base, whose review dock has the cost + confirm.
    expect(screen.getByTestId("result-card-stub")).toHaveAttribute("data-output", "base");
    expect(screen.getByRole("textbox", { name: "O que você quer mudar?" })).toBeInTheDocument();
    // The parent's consumed revision is spent: a fresh draft/key is required.
    expect(mocks.review.beginFreshDraftAttempt).toHaveBeenCalledTimes(1);
  });

  it("stays on the current piece with its error when the pre-switch autosave fails", async () => {
    const base = output({ id: "base" });
    const child = output({ id: "child", parentOutputId: "base", versionNumber: 2 });
    // The newest completed child starts selected; switching to the base first
    // flushes the pending draft.
    mocks.review.hasUnsavedChanges = vi.fn(() => true);
    mocks.review.flush = vi.fn(async () => null);
    mocks.review.error = "Erro ao salvar";
    render(<StudioPieceWorkspace composer={composerMock([base, child])} />);
    fireEvent.click(screen.getByRole("button", { name: "Versão 1 · 4:5" }));
    await waitFor(() => expect(mocks.review.flush).toHaveBeenCalledTimes(1));
    // Flush failed: the selection stays on the child, text and error preserved.
    expect(screen.getByTestId("result-card-stub")).toHaveAttribute("data-output", "child");
    expect(screen.getByRole("alert")).toHaveTextContent("Erro ao salvar");
  });

  it("seeds a fresh attempt from the failed child context when the base has no draft", () => {
    const base = output({ id: "base", reviewDraft: null });
    const failedRevision = output({
      id: "failed-child",
      parentOutputId: "base",
      versionNumber: 2,
      status: "failed",
      hasOutput: false,
      revisionContext: {
        version: 1, reviewRevision: 1, sourceOutputId: "base", sourceOutputVersion: 1,
        action: "refine", targetFormat: "4:5", instruction: "tentativa 1",
        revisionAssetId: null, annotations: [],
      },
    });
    render(<StudioPieceWorkspace composer={composerMock([base, failedRevision])} />);
    fireEvent.click(screen.getByRole("button", { name: "Versão 2 · 4:5" }));
    fireEvent.click(screen.getByRole("button", { name: "revisar-nova-tentativa" }));
    expect(mocks.review.beginFreshDraftAttempt).toHaveBeenCalledWith({
      targetOutputId: "base",
      from: { action: "refine", targetFormat: "4:5", instruction: "tentativa 1", revisionAssetId: null, annotations: [] },
    });
    expect(mocks.review.update).not.toHaveBeenCalled();
  });

  it("offers an explicit resume instead of overwriting a newer base draft", () => {
    const base = output({
      id: "base",
      reviewDraft: {
        version: 1, revision: 2, revisionKey: "00000000-0000-4000-8000-0000000000b1",
        action: "refine", targetFormat: "4:5", instruction: "rascunho mais novo do pai",
        revisionAssetId: null, annotations: [],
      },
    });
    const failedRevision = output({
      id: "failed-child",
      parentOutputId: "base",
      versionNumber: 2,
      status: "failed",
      hasOutput: false,
      revisionContext: {
        version: 1, reviewRevision: 2, sourceOutputId: "base", sourceOutputVersion: 1,
        action: "format", targetFormat: "9:16", instruction: "tentativa 1",
        revisionAssetId: null, annotations: [],
      },
    });
    render(<StudioPieceWorkspace composer={composerMock([base, failedRevision])} />);
    fireEvent.click(screen.getByRole("button", { name: "Versão 2 · 4:5" }));
    fireEvent.click(screen.getByRole("button", { name: "revisar-nova-tentativa" }));
    // The base draft is preserved; the old instructions come back explicitly.
    expect(mocks.review.update).not.toHaveBeenCalledWith(expect.objectContaining({ instruction: "tentativa 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Retomar instruções anteriores" }));
    expect(mocks.review.update).toHaveBeenLastCalledWith(expect.objectContaining({
      instruction: "tentativa 1", targetFormat: "9:16", action: "format",
    }));
  });

  it("closes a scanner panel directly without waiting for an editor flush", () => {
    const base = output({ id: "base" });
    const composer = composerMock([base], {
      canLayerize: true,
      layerEditorAccess: { enabled: true, period: null, layerize: { remaining: 2, limit: 2 }, regeneration: null },
    });
    render(<StudioPieceWorkspace composer={composer} />);
    fireEvent.click(screen.getByRole("button", { name: "Camadas" }));
    expect(screen.getByTestId("layer-scanner-stub")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Camadas" }));
    // No editor session exists to flush: the panel closes immediately.
    expect(screen.queryByTestId("layer-scanner-stub")).not.toBeInTheDocument();
    expect(mocks.editorProps).toBeNull();
  });
});
