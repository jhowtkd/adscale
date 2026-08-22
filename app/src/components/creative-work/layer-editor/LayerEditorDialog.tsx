"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { LayerCanvas } from "./LayerCanvas";
import { LayerPanel } from "./LayerPanel";
import { LayerRegenerationPanel } from "./LayerRegenerationPanel";
import { useLayerEditor } from "./useLayerEditor";

type LayerEditorDialogProps = {
  open: boolean;
  workItemId: string;
  outputId: string;
  mode?: "edit" | "inspect";
  onOpenChange: (open: boolean) => void;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function LayerEditorDialog({ open, workItemId, outputId, mode = "edit", onOpenChange }: LayerEditorDialogProps) {
  const editor = useLayerEditor({ workItemId, outputId, mode });
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open || editor.mode !== "edit") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((!event.metaKey && !event.ctrlKey) || event.key.toLowerCase() !== "z" || isEditableTarget(event.target)) return;
      if (event.shiftKey) {
        if (!editor.canRedo) return;
        event.preventDefault();
        editor.redo();
        return;
      }
      if (!editor.canUndo) return;
      event.preventDefault();
      editor.undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor.canRedo, editor.canUndo, editor.mode, editor.redo, editor.undo, open]);

  const close = async () => {
    if (await editor.flushAndRelease()) onOpenChange(false);
  };
  const act = (fn: () => Promise<unknown>) => void fn().catch((reason) => setError(reason instanceof Error ? reason.message : "Falha"));
  const runExport = async (format: "draft-png" | "draft-psd") => {
    setExporting(true);
    try {
      if (!await editor.exportDraft(format)) setError(`Falha ao exportar ${format === "draft-png" ? "PNG" : "PSD"}`);
    } finally {
      setExporting(false);
    }
  };
  const restore = (all: boolean) => {
    if (editor.mode !== "edit" || (!all && !selected)) return;
    if (!window.confirm(all ? "Restaurar todas as camadas para a versão original?" : "Restaurar esta camada para a versão original?")) return;
    try {
      editor.dispatch(all ? { type: "restoreAll" } : { type: "restore", id: selected! });
      setError("");
      setNotice("Restaurando alterações. Salvando alterações.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao restaurar camadas");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) void close(); else onOpenChange(next); }}>
      <DialogContent size="full" showCloseButton={false} aria-label="Editor de camadas">
        <header className="flex items-center gap-3 border-b p-3">
          <button onClick={() => void close()} aria-label="Fechar editor">Fechar</button>
          <b>Editor de camadas</b>
          {editor.mode === "edit" ? <>
            <button type="button" disabled={!editor.canUndo} onClick={editor.undo}>Desfazer</button>
            <button type="button" disabled={!editor.canRedo} onClick={editor.redo}>Refazer</button>
            <button type="button" disabled={!selected} onClick={() => restore(false)}>Restaurar camada</button>
            <button type="button" onClick={() => restore(true)}>Restaurar tudo</button>
          </> : null}
          <button disabled={!editor.document || exporting} onClick={() => void runExport("draft-png")}>Exportar PNG</button>
          <button disabled={!editor.document || exporting} onClick={() => void runExport("draft-psd")}>Exportar PSD</button>
          {editor.mode === "edit" && editor.document ? <button disabled={exporting} onClick={async () => {
            setExporting(true);
            try {
              await editor.publish();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "Falha ao publicar");
            } finally {
              setExporting(false);
            }
          }}>Criar nova versão</button> : null}
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_22rem] max-sm:block">
          {editor.document ? <LayerCanvas document={editor.document} selectedLayerId={selected} onSelect={setSelected} mode={editor.mode === "edit" ? "edit" : "read"} dispatch={editor.dispatch} /> : <div>Carregando</div>}
          {editor.document ? <aside>
            <LayerPanel document={editor.document} selectedLayerId={selected} onSelect={setSelected} mode={editor.mode} dispatch={editor.dispatch} />
            <LayerRegenerationPanel document={editor.document} selectedLayerId={selected} mode={editor.mode === "edit" ? "edit" : "read"} access={editor.access ?? { enabled: false, period: null, layerize: null, regeneration: null }} onRegenerate={(id, instruction) => act(() => editor.regenerate(id, instruction))} onAccept={() => act(editor.acceptCandidate)} onDiscard={() => act(editor.discardCandidate)} />
          </aside> : null}
        </div>
        <div role="status" className="sr-only">{notice || editor.mode}</div>
        <div role="alert" className="sr-only">{error}</div>
      </DialogContent>
    </Dialog>
  );
}
