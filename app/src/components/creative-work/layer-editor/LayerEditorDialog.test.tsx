import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";

const mocks = vi.hoisted(() => ({
  useLayerEditor: vi.fn(),
}));

vi.mock("./useLayerEditor", () => ({
  useLayerEditor: (input: unknown) => mocks.useLayerEditor(input),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({
    editorTitle: "Editor de camadas", editorReadOnly: "Somente leitura", editorSaveError: "Não foi possível salvar as alterações",
    editorSaving: "Salvando alterações", editorSaved: "Alterações salvas", editorPending: "Alterações não salvas", editorLayers: "Camadas", editorClose: "Fechar editor", editorLoading: "Carregando", editorLayerCount: "{count} camadas", editorCloseSaveFailed: "Não foi possível salvar antes de fechar", editorRegenerate: "Regenerar camada", editorInstruction: "Instrução", editorQuotaRemaining: "Cota restante: {count}", editorNoActiveRegeneration: "Sem regeneração ativa", editorSelectLayer: "Selecione uma camada", editorConfirmRegeneration: "Confirmar regeneração", editorRestoreLayer: "Restaurar camada",
    editorRestoreAll: "Restaurar tudo", editorExportPng: "Exportar PNG", editorExportPsd: "Exportar PSD", editorPublish: "Criar nova variação", editorMoreActions: "Mais ações", editorFitCanvas: "Ajustar", editorUndo: "Desfazer", editorRedo: "Refazer", editorLayerName: "Nome da camada", editorPublished: "Nova variação criada", editorCanvas: "Canvas de camadas", editorSelectedLayer: "Camada selecionada", editorResizeHandle: "Redimensionar {handle}", editorTools: "Ferramentas do editor", editorConflict: "As camadas foram alteradas por outra pessoa", editorDiscardLocal: "Descartar alterações locais e recarregar", editorDiscardAndClose: "Descartar e fechar",
    scanningLayers: "Identificando elementos, pessoas e textos da imagem...", layerizeQueued: "Separação na fila", layerizeProcessing: "Separando camadas", layerizeRetry: "Tentar separar novamente", layerizeFailed: "A separação em camadas falhou.", "layerizeFailure.provider": "Falha do provedor",
  }[key] ?? key),
}));

import { LayerEditorDialog } from "./LayerEditorDialog";
import { LayerEditorContent } from "./LayerEditorContent";

const document: PublicLayerEditorDocumentV1 = {
  schemaVersion: 1,
  revision: 1,
  canvas: { width: 1080, height: 1080 },
  lease: { mode: "edit", leaseId: "lease-1", heldByName: null, expiresAt: null },
  regeneration: null,
  updatedAt: "2026-08-22T00:00:00.000Z",
  layers: [{
    id: "00000000-0000-4000-8000-000000000001",
    order: 0,
    name: "Produto",
    visible: true,
    x: 0,
    y: 0,
    width: 1080,
    height: 1080,
    currentKind: "source",
    imageUrl: "https://example.test/layer.png",
    description: "Product pack shot",
    source: { order: 0, name: "Produto", visible: true, x: 0, y: 0, width: 1080, height: 1080, imageUrl: "https://example.test/layer.png" },
  }],
};

function editor(mode: "edit" | "inspect") {
  return {
    document,
    leaseId: "lease-1",
    mode,
    dispatch: vi.fn(),
    open: vi.fn(),
    flush: vi.fn(),
    canUndo: false,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
    regenerate: vi.fn(),
    acceptCandidate: vi.fn(),
    discardCandidate: vi.fn(),
    flushAndRelease: vi.fn().mockResolvedValue(true),
    exportDraft: vi.fn(),
    publish: vi.fn(),
    discardLocalEdits: vi.fn(),
    abandonLocalEdits: vi.fn(),
    saveStatus: "saved",
  };
}

describe("LayerEditorDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the full desktop editing surface", () => {
    mocks.useLayerEditor.mockReturnValue(editor("edit"));

    render(<LayerEditorDialog open workItemId="work-1" outputId="output-1" onOpenChange={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Editor de camadas" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Canvas de camadas" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Camadas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar nova variação" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Produto/ }));
    expect(screen.getByLabelText("Camada selecionada")).toHaveClass("z-[var(--layer-skip-link)]");
    expect(mocks.useLayerEditor).toHaveBeenCalledWith({ workItemId: "work-1", outputId: "output-1", mode: "edit" });
  });

  it("renders an inspect surface without publication controls", () => {
    mocks.useLayerEditor.mockReturnValue(editor("inspect"));

    render(<LayerEditorDialog open workItemId="work-2" outputId="output-2" mode="inspect" onOpenChange={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Editor de camadas" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Canvas de camadas" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Camadas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar nova variação" })).not.toBeInTheDocument();
    expect(mocks.useLayerEditor).toHaveBeenCalledWith({ workItemId: "work-2", outputId: "output-2", mode: "inspect" });
  });

  it("uses edit-only buttons and Cmd/Ctrl+Z shortcuts outside editable fields", () => {
    const value = editor("edit");
    value.canUndo = true;
    value.canRedo = true;
    mocks.useLayerEditor.mockReturnValue(value);
    render(<LayerEditorDialog open workItemId="work-3" outputId="output-3" onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    fireEvent.click(screen.getByRole("button", { name: "Refazer" }));
    expect(value.undo).toHaveBeenCalledTimes(1);
    expect(value.redo).toHaveBeenCalledTimes(1);

    const undo = new KeyboardEvent("keydown", { key: "z", metaKey: true, cancelable: true });
    window.dispatchEvent(undo);
    const redo = new KeyboardEvent("keydown", { key: "z", metaKey: true, shiftKey: true, cancelable: true });
    window.dispatchEvent(redo);
    expect(undo.defaultPrevented).toBe(true);
    expect(redo.defaultPrevented).toBe(true);
    expect(value.undo).toHaveBeenCalledTimes(2);
    expect(value.redo).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: /Produto/ }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Nome da camada" }), { key: "z", metaKey: true });
    expect(value.undo).toHaveBeenCalledTimes(2);
  });

  it("restores a selected layer or all layers only after confirmation", async () => {
    const value = editor("edit");
    mocks.useLayerEditor.mockReturnValue(value);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<LayerEditorDialog open workItemId="work-4" outputId="output-4" onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    expect(await screen.findByRole("menuitem", { name: "Restaurar camada" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    fireEvent.click(screen.getByRole("button", { name: /Produto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Restaurar camada" }));
    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Restaurar tudo" }));

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(value.dispatch).toHaveBeenNthCalledWith(1, { type: "restore", id: document.layers[0].id });
    expect(value.dispatch).toHaveBeenNthCalledWith(2, { type: "restoreAll" });
    expect(screen.getAllByRole("status").at(-1)).toHaveTextContent("Salvando alterações");
  });

  it("does not restore when confirmation is cancelled", async () => {
    const value = editor("edit");
    mocks.useLayerEditor.mockReturnValue(value);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<LayerEditorDialog open workItemId="work-5" outputId="output-5" onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Produto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Restaurar camada" }));
    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Restaurar tudo" }));

    expect(value.dispatch).not.toHaveBeenCalled();
  });

  it("hands off only after a confirmed publication", async () => {
    const value = editor("edit");
    const onOpenChange = vi.fn();
    const onPublished = vi.fn().mockResolvedValue(undefined);
    value.publish.mockResolvedValue({ ok: true });
    mocks.useLayerEditor.mockReturnValue(value);
    render(<LayerEditorDialog open workItemId="work-6" outputId="output-6" onOpenChange={onOpenChange} onPublished={onPublished} />);

    fireEvent.click(screen.getByRole("button", { name: "Criar nova variação" }));

    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the editor open when publication is not confirmed", async () => {
    const value = editor("edit");
    const onOpenChange = vi.fn();
    value.publish.mockResolvedValue(null);
    mocks.useLayerEditor.mockReturnValue(value);
    render(<LayerEditorDialog open workItemId="work-7" outputId="output-7" onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Criar nova variação" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível salvar as alterações"));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("offers explicit conflict recovery while disabling document mutation controls", async () => {
    const value = { ...editor("edit"), document: { ...document, regeneration: { id: "regen", status: "processing" as const, layerId: document.layers[0]!.id, instruction: "Change", candidateUrl: null, failureCode: null } }, hasUnresolvedConflict: true, saveStatus: "conflict" as const };
    mocks.useLayerEditor.mockReturnValue(value);
    render(<LayerEditorDialog open workItemId="work-8" outputId="output-8" onOpenChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Criar nova variação" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descartar alterações locais e recarregar" })).toBeInTheDocument();
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("As camadas foram alteradas por outra pessoa");
    await waitFor(() => expect(window.document.activeElement).toHaveAttribute("role", "alert"));
  });

  it("offers explicit reload recovery after a generic heartbeat failure", async () => {
    const value = { ...editor("edit"), mode: "read" as const, saveStatus: "error" as const };
    const onOpenChange = vi.fn();
    value.discardLocalEdits.mockResolvedValue(undefined);
    value.flushAndRelease.mockResolvedValue(true);
    mocks.useLayerEditor.mockReturnValue(value);
    render(<LayerEditorDialog open workItemId="work-heartbeat" outputId="output-heartbeat" onOpenChange={onOpenChange} />);

    const recover = screen.getByRole("button", { name: "Descartar alterações locais e recarregar" });
    await waitFor(() => expect(window.document.activeElement).toHaveAttribute("role", "alert"), { timeout: 3000 });
    fireEvent.click(recover);
    await waitFor(() => expect(value.discardLocalEdits).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Fechar editor" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows the scanner without mounting the editor until layerization completes", () => {
    const { rerender } = render(
      <LayerEditorDialog
        open
        workItemId="work-scan"
        outputId="output-scan"
        sourceImageUrl="https://example.test/source.png"
        layerization={{ status: "processing" } as never}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Identificando elementos, pessoas e textos da imagem...")).toBeVisible();
    expect(screen.getByText("Separando camadas")).toBeVisible();
    expect(mocks.useLayerEditor).not.toHaveBeenCalled();

    mocks.useLayerEditor.mockReturnValue(editor("edit"));
    rerender(
      <LayerEditorDialog
        open
        workItemId="work-scan"
        outputId="output-scan"
        sourceImageUrl="https://example.test/source.png"
        layerization={{ status: "completed" } as never}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: "Canvas de camadas" })).toBeInTheDocument();
    expect(screen.getByAltText("Produto")).toHaveClass("animate-layer-reveal");
    expect(mocks.useLayerEditor).toHaveBeenCalled();
  });

  it("offers retry after a failed layerization", () => {
    const onRetryLayerize = vi.fn();
    mocks.useLayerEditor.mockReturnValue(editor("edit"));
    render(
      <LayerEditorDialog
        open
        workItemId="work-fail"
        outputId="output-fail"
        sourceImageUrl="https://example.test/source.png"
        layerization={{ status: "failed", failureCode: "provider_error" } as never}
        layerizeRemaining={2}
        onRetryLayerize={onRetryLayerize}
        onOpenChange={vi.fn()}
      />,
    );
    expect(mocks.useLayerEditor).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tentar separar novamente" }));
    expect(onRetryLayerize).toHaveBeenCalledOnce();
  });

  it("keeps close and history header controls at 44px", () => {
    const value = editor("edit");
    value.canUndo = true;
    value.canRedo = true;
    mocks.useLayerEditor.mockReturnValue(value);
    render(<LayerEditorDialog open workItemId="work-9" outputId="output-9" onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Produto/ }));
    for (const name of ["Fechar editor", "Desfazer", "Refazer", "Exportar PNG", "Mais ações"]) {
      expect(within(screen.getByRole("banner")).getByRole("button", { name })).toHaveClass("min-h-11", "min-w-11");
    }
    expect(within(screen.getByRole("banner")).getByRole("button", { name: "Criar nova variação" })).toHaveClass("min-h-11");
  });

  it("hosts the same single session inline without a dialog wrapper", () => {
    mocks.useLayerEditor.mockReturnValue(editor("edit"));
    const onOpenChange = vi.fn();
    render(
      <LayerEditorContent
        open
        workItemId="work-inline"
        outputId="output-inline"
        mode="edit"
        presentation="inline"
        onOpenChange={onOpenChange}
      />,
    );

    expect(screen.queryByRole("dialog", { name: "Editor de camadas" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Canvas de camadas" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Camadas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar nova variação" })).toBeInTheDocument();
    expect(mocks.useLayerEditor).toHaveBeenCalledWith({ workItemId: "work-inline", outputId: "output-inline", mode: "edit" });
  });

  it("routes external exit requests through the flushed close", async () => {
    const value = editor("edit");
    const onOpenChange = vi.fn();
    mocks.useLayerEditor.mockReturnValue(value);
    const view = render(
      <LayerEditorContent
        open
        workItemId="work-exit"
        outputId="output-exit"
        presentation="inline"
        onOpenChange={onOpenChange}
        exitRequestToken={0}
      />,
    );

    expect(value.flushAndRelease).not.toHaveBeenCalled();
    view.rerender(
      <LayerEditorContent
        open
        workItemId="work-exit"
        outputId="output-exit"
        presentation="inline"
        onOpenChange={onOpenChange}
        exitRequestToken={1}
      />,
    );

    await waitFor(() => expect(value.flushAndRelease).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("keeps the editor mounted when the external exit flush fails", async () => {
    const value = editor("edit");
    const onOpenChange = vi.fn();
    value.flushAndRelease = vi.fn().mockResolvedValue(false);
    mocks.useLayerEditor.mockReturnValue(value);
    const view = render(
      <LayerEditorContent
        open
        workItemId="work-exit-fail"
        outputId="output-exit-fail"
        presentation="inline"
        onOpenChange={onOpenChange}
        exitRequestToken={0}
      />,
    );

    view.rerender(
      <LayerEditorContent
        open
        workItemId="work-exit-fail"
        outputId="output-exit-fail"
        presentation="inline"
        onOpenChange={onOpenChange}
        exitRequestToken={2}
      />,
    );

    await waitFor(() => expect(value.flushAndRelease).toHaveBeenCalledTimes(1));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Canvas de camadas" })).toBeInTheDocument();
  });
});
