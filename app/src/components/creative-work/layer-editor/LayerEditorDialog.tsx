"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Redo2, RotateCcw, Undo2, Upload, X } from "lucide-react";
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
  onPublished?: () => void | Promise<void>;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function LayerEditorDialog({ open, workItemId, outputId, mode = "edit", onOpenChange, onPublished }: LayerEditorDialogProps) {
  const editor = useLayerEditor({ workItemId, outputId, mode });
  const { canRedo, canUndo, mode: editorMode, redo, undo } = editor;
  const t = useTranslations("dashboard.home.composer.results");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [inspectVisibility, setInspectVisibility] = useState<Record<string, boolean>>({});
  const alertRef = useRef<HTMLDivElement>(null);
  const regenerationPanelRef = useRef<HTMLDivElement>(null);
  const canMutate = editor.mode === "edit" && !["reserved", "processing", "ready"].includes(editor.document?.regeneration?.status ?? "");

  useEffect(() => { if (error || editor.hasUnresolvedConflict) alertRef.current?.focus(); }, [editor.hasUnresolvedConflict, error]);

  useEffect(() => {
    if (!open || editorMode !== "edit") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((!event.metaKey && !event.ctrlKey) || event.key.toLowerCase() !== "z" || isEditableTarget(event.target)) return;
      if (event.shiftKey) {
        if (!canRedo) return;
        event.preventDefault();
        redo();
        return;
      }
      if (!canUndo) return;
      event.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canRedo, canUndo, editorMode, open, redo, undo]);

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
    if (!canMutate || (!all && !selected)) return;
    if (!window.confirm(all ? t("editorRestoreAll") : t("editorRestoreLayer"))) return;
    try {
      editor.dispatch(all ? { type: "restoreAll" } : { type: "restore", id: selected! });
      setError("");
      setNotice(t("editorSaving"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("editorSaveError"));
    }
  };
  const publish = async () => {
    setExporting(true);
    try {
      const result = await editor.publish();
      if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
        setError(t("editorSaveError"));
        return;
      }
      setNotice(t("editorPublished"));
      onOpenChange(false);
      void Promise.resolve(onPublished?.()).catch(() => undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("editorSaveError"));
    } finally {
      setExporting(false);
    }
  };
  const regenerationAction = (fn: () => Promise<unknown>) => async () => {
    await fn();
    regenerationPanelRef.current?.focus();
  };
  const discardAndClose = async () => {
    try {
      await editor.abandonLocalEdits();
      onOpenChange(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("editorSaveError"));
    }
  };
  const saveLabel = editor.saveStatus === "saving"
    ? t("editorSaving")
    : editor.saveStatus === "saved"
      ? t("editorSaved")
      : editor.saveStatus === "conflict"
        ? t("editorConflict")
        : editor.saveStatus === "error"
          ? t("editorSaveError")
          : t("editorPending");

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) void close(); else onOpenChange(next); }}>
      <DialogContent size="full" showCloseButton={false} aria-label={t("editorTitle")}>
        <header className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur">
          <Button variant="ghost" size="icon" onClick={() => void close()} aria-label={t("editorClose")}><X /></Button>
          <div className="mr-auto min-w-36"><b className="block">{t("editorTitle")}</b><span className="text-xs text-muted-foreground">{editor.document ? `${editor.document.canvas.width}×${editor.document.canvas.height} · ${t("editorLayerCount", { count: editor.document.layers.length })}` : t("editorLoading")}</span></div>
          {editor.mode !== "edit" ? <span className="rounded bg-muted px-2 py-1 text-xs">{editor.document?.lease.heldByName ? `${t("editorReadOnly")}: ${editor.document.lease.heldByName}` : t("editorReadOnly")}</span> : null}
          <span className="text-xs text-muted-foreground" aria-live="polite">{error ? t("editorSaveError") : exporting ? t("editorSaving") : saveLabel}</span>
          {canMutate ? <>
            <Button variant="outline" size="icon" disabled={!editor.canUndo} onClick={editor.undo} aria-label={t("editorUndo")}><Undo2 /></Button>
            <Button variant="outline" size="icon" disabled={!editor.canRedo} onClick={editor.redo} aria-label={t("editorRedo")}><Redo2 /></Button>
            <Button variant="outline" size="sm" disabled={!selected} onClick={() => restore(false)}>{t("editorRestoreLayer")}</Button>
            <Button variant="outline" size="sm" onClick={() => restore(true)}>{t("editorRestoreAll")}</Button>
          </> : null}
          <Button variant="outline" size="sm" disabled={!editor.document || exporting} onClick={() => void runExport("draft-png")}><Download />{t("editorExportPng")}</Button>
          <Button variant="outline" size="sm" disabled={!editor.document || exporting} onClick={() => void runExport("draft-psd")}><Download />{t("editorExportPsd")}</Button>
          {canMutate && editor.document ? <Button size="sm" disabled={exporting} onClick={() => void publish()}><Upload />{t("editorPublish")}</Button> : null}
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[3.5rem_minmax(0,1fr)_22rem]">
          {editor.document ? <aside aria-label={t("editorTools")} className="hidden min-h-0 flex-col items-center gap-2 border-r bg-muted/20 px-1 py-3 xl:flex">
            {canMutate ? <>
              <Button variant="ghost" size="icon" title={t("editorUndo")} aria-label={t("editorUndo")} disabled={!editor.canUndo} onClick={editor.undo}><Undo2 /></Button>
              <Button variant="ghost" size="icon" title={t("editorRedo")} aria-label={t("editorRedo")} disabled={!editor.canRedo} onClick={editor.redo}><Redo2 /></Button>
              <Button variant="ghost" size="icon" title={t("editorRestoreAll")} aria-label={t("editorRestoreAll")} onClick={() => restore(true)}><RotateCcw /></Button>
            </> : null}
            <Button variant="ghost" size="icon" title={t("editorExportPng")} aria-label={t("editorExportPng")} disabled={exporting} onClick={() => void runExport("draft-png")}><Download /></Button>
          </aside> : null}
          {editor.document ? <LayerCanvas document={editor.document} selectedLayerId={selected} onSelect={setSelected} mode={canMutate ? "edit" : "read"} dispatch={editor.dispatch} visibilityOverrides={canMutate ? undefined : inspectVisibility} /> : <div role={editor.openError ? "alert" : undefined} className="grid place-items-center p-6">{editor.openError ?? t("editorLoading")}</div>}
          {editor.document ? <aside className="min-h-0 overflow-y-auto border-l bg-muted/20 max-md:border-t max-md:border-l-0">
            <LayerPanel document={editor.document} selectedLayerId={selected} onSelect={setSelected} mode={canMutate ? "edit" : "read"} dispatch={editor.dispatch} onInspectVisibilityChange={(id, visible) => setInspectVisibility((current) => ({ ...current, [id]: visible }))} />
            <div ref={regenerationPanelRef} tabIndex={-1}>
              <LayerRegenerationPanel document={editor.document} selectedLayerId={selected} mode={editor.mode === "edit" ? "edit" : "read"} access={editor.access ?? { enabled: false, period: null, layerize: null, regeneration: null }} onRegenerate={(id, instruction) => act(regenerationAction(() => editor.regenerate(id, instruction)))} onRetryDispatch={() => act(regenerationAction(editor.retryRegeneration))} onAccept={() => act(regenerationAction(editor.acceptCandidate))} onDiscard={() => act(regenerationAction(editor.discardCandidate))} />
            </div>
          </aside> : null}
        </div>
        {editor.hasUnresolvedConflict ? <div role="alert" className="flex flex-wrap items-center gap-2 border-t border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-950"><p>{t("editorConflict")}</p><Button variant="outline" size="sm" onClick={() => act(editor.discardLocalEdits)}>{t("editorDiscardLocal")}</Button><Button variant="outline" size="sm" onClick={() => void discardAndClose()}>{t("editorDiscardAndClose")}</Button></div> : null}
        <div role="status" aria-live="polite" className="sr-only">{notice || editor.mode}</div>
        <div ref={alertRef} role="alert" tabIndex={-1} className="sr-only">{error || (editor.hasUnresolvedConflict ? t("editorConflict") : "")}</div>
      </DialogContent>
    </Dialog>
  );
}
