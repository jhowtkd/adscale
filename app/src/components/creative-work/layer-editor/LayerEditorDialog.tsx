"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Redo2, Undo2, Upload, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  const t = useTranslations("dashboard.home.composer.results");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [inspectVisibility, setInspectVisibility] = useState<Record<string, boolean>>({});
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (error) alertRef.current?.focus(); }, [error]);

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
    else setError(t("editorCloseSaveFailed"));
  };
  const act = (fn: () => Promise<unknown>) => void fn().catch((reason) => setError(reason instanceof Error ? reason.message : t("editorSaveError")));
  const runExport = async (format: "draft-png" | "draft-psd") => {
    setExporting(true);
    try {
      if (!await editor.exportDraft(format)) setError(t("editorSaveError"));
    } finally {
      setExporting(false);
    }
  };
  const restore = (all: boolean) => {
    if (editor.mode !== "edit" || (!all && !selected)) return;
    if (!window.confirm(all ? t("editorRestoreAll") : t("editorRestoreLayer"))) return;
    try {
      editor.dispatch(all ? { type: "restoreAll" } : { type: "restore", id: selected! });
      setError("");
      setNotice(t("editorSaving"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("editorSaveError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) void close(); else onOpenChange(next); }}>
      <DialogContent size="full" showCloseButton={false} aria-label={t("editorTitle")}>
        <header className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur">
          <Button variant="ghost" size="icon" onClick={() => void close()} aria-label={t("editorClose")}><X /></Button>
          <div className="mr-auto min-w-36"><b className="block">{t("editorTitle")}</b><span className="text-xs text-muted-foreground">{editor.document ? `${editor.document.canvas.width}×${editor.document.canvas.height} · ${t("editorLayerCount", { count: editor.document.layers.length })}` : t("editorLoading")}</span></div>
          {editor.mode !== "edit" ? <span className="rounded bg-muted px-2 py-1 text-xs">{editor.document?.lease.heldByName ? `${t("editorReadOnly")}: ${editor.document.lease.heldByName}` : t("editorReadOnly")}</span> : null}
          <span className="text-xs text-muted-foreground">{error ? t("editorSaveError") : exporting ? t("editorSaving") : t("editorSaved")}</span>
          {editor.mode === "edit" ? <>
            <Button variant="outline" size="icon" disabled={!editor.canUndo} onClick={editor.undo} aria-label={t("editorUndo")}><Undo2 /></Button>
            <Button variant="outline" size="icon" disabled={!editor.canRedo} onClick={editor.redo} aria-label={t("editorRedo")}><Redo2 /></Button>
            <Button variant="outline" size="sm" disabled={!selected} onClick={() => restore(false)}>{t("editorRestoreLayer")}</Button>
            <Button variant="outline" size="sm" onClick={() => restore(true)}>{t("editorRestoreAll")}</Button>
          </> : null}
          <Button variant="outline" size="sm" disabled={!editor.document || exporting} onClick={() => void runExport("draft-png")}><Download />{t("editorExportPng")}</Button>
          <Button variant="outline" size="sm" disabled={!editor.document || exporting} onClick={() => void runExport("draft-psd")}><Download />{t("editorExportPsd")}</Button>
          {editor.mode === "edit" && editor.document ? <Button size="sm" disabled={exporting} onClick={async () => {
            setExporting(true);
            try {
              await editor.publish();
              setNotice(t("editorPublished"));
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : t("editorSaveError"));
            } finally {
              setExporting(false);
            }
          }}><Upload />{t("editorPublish")}</Button> : null}
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
          {editor.document ? <LayerCanvas document={editor.document} selectedLayerId={selected} onSelect={setSelected} mode={editor.mode === "edit" ? "edit" : "read"} dispatch={editor.dispatch} visibilityOverrides={editor.mode === "edit" ? undefined : inspectVisibility} /> : <div role={editor.openError ? "alert" : undefined} className="grid place-items-center p-6">{editor.openError ?? t("editorLoading")}</div>}
          {editor.document ? <aside className="min-h-0 overflow-y-auto border-l bg-muted/20 max-md:border-t max-md:border-l-0">
            <LayerPanel document={editor.document} selectedLayerId={selected} onSelect={setSelected} mode={editor.mode} dispatch={editor.dispatch} onInspectVisibilityChange={(id, visible) => setInspectVisibility((current) => ({ ...current, [id]: visible }))} />
            <LayerRegenerationPanel document={editor.document} selectedLayerId={selected} mode={editor.mode === "edit" ? "edit" : "read"} access={editor.access ?? { enabled: false, period: null, layerize: null, regeneration: null }} onRegenerate={(id, instruction) => act(() => editor.regenerate(id, instruction))} onAccept={() => act(editor.acceptCandidate)} onDiscard={() => act(editor.discardCandidate)} />
          </aside> : null}
        </div>
        <div role="status" aria-live="polite" className="sr-only">{notice || editor.mode}</div>
        <div ref={alertRef} role="alert" tabIndex={-1} className="sr-only">{error}</div>
      </DialogContent>
    </Dialog>
  );
}
