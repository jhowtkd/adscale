import { fireEvent, render, screen } from "@testing-library/react";
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
    editorSaving: "Salvando alterações", editorSaved: "Alterações salvas", editorRestoreLayer: "Restaurar camada",
    editorRestoreAll: "Restaurar tudo", editorExportPng: "Exportar PNG", editorExportPsd: "Exportar PSD", editorPublish: "Criar nova versão",
  }[key] ?? key),
}));

import { LayerEditorDialog } from "./LayerEditorDialog";

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
    expect(screen.getByRole("complementary", { name: "Camadas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar nova versão" })).toBeInTheDocument();
    expect(mocks.useLayerEditor).toHaveBeenCalledWith({ workItemId: "work-1", outputId: "output-1", mode: "edit" });
  });

  it("renders an inspect surface without publication controls", () => {
    mocks.useLayerEditor.mockReturnValue(editor("inspect"));

    render(<LayerEditorDialog open workItemId="work-2" outputId="output-2" mode="inspect" onOpenChange={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Editor de camadas" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Canvas de camadas" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Camadas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar nova versão" })).not.toBeInTheDocument();
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

  it("restores a selected layer or all layers only after confirmation", () => {
    const value = editor("edit");
    mocks.useLayerEditor.mockReturnValue(value);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<LayerEditorDialog open workItemId="work-4" outputId="output-4" onOpenChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Restaurar camada" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Produto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Restaurar camada" }));
    fireEvent.click(screen.getByRole("button", { name: "Restaurar tudo" }));

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(value.dispatch).toHaveBeenNthCalledWith(1, { type: "restore", id: document.layers[0].id });
    expect(value.dispatch).toHaveBeenNthCalledWith(2, { type: "restoreAll" });
    expect(screen.getAllByRole("status").at(-1)).toHaveTextContent("Restaurando alterações");
  });

  it("does not restore when confirmation is cancelled", () => {
    const value = editor("edit");
    mocks.useLayerEditor.mockReturnValue(value);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<LayerEditorDialog open workItemId="work-5" outputId="output-5" onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Produto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Restaurar camada" }));
    fireEvent.click(screen.getByRole("button", { name: "Restaurar tudo" }));

    expect(value.dispatch).not.toHaveBeenCalled();
  });
});
