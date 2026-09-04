"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, MoreHorizontal, Redo2, Undo2, Upload, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PublicLayerizationState } from "@/server/layerize/contracts";
import { LayerCanvas } from "./LayerCanvas";
import { LayerPanel } from "./LayerPanel";
import { LayerRegenerationPanel } from "./LayerRegenerationPanel";
import { LayerScanner } from "./LayerScanner";
import { useLayerEditor } from "./useLayerEditor";

type LayerEditorDialogProps = {
  open: boolean;
  workItemId: string;
  outputId: string;
  mode?: "edit" | "inspect";
  layerization?: PublicLayerizationState | null;
  sourceImageUrl?: string;
  hasLayerEditor?: boolean;
  layerizeRemaining?: number | null;
  onRetryLayerize?: () => void;
  onOpenChange: (open: boolean) => void;
  onPublished?: () => void | Promise<void>;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function LayerEditorDialog({
  open,
  workItemId,
  outputId,
  mode = "edit",
  layerization = null,
  sourceImageUrl,
  hasLayerEditor = false,
  layerizeRemaining,
  onRetryLayerize,
  onOpenChange,
  onPublished,
}: LayerEditorDialogProps) {
  const t = useTranslations("dashboard.home.composer.results");
  const preparing = Boolean(sourceImageUrl) && layerization?.status !== "completed" && !hasLayerEditor;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" showCloseButton={false} aria-label={t("editorTitle")} className="gap-0 p-0">
        {preparing && sourceImageUrl ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex min-h-14 items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
              <Button variant="ghost" size="icon" className="min-h-11 min-w-11" onClick={() => onOpenChange(false)} aria-label={t("editorClose")}><X /></Button>
              <div className="mr-auto min-w-36"><b className="block text-sm">{t("editorTitle")}</b><span className="text-xs text-[var(--text-muted)]">{t("scanningLayers")}</span></div>
            </header>
            <LayerScanner
              sourceImageUrl={sourceImageUrl}
              layerization={layerization}
              layerizeRemaining={layerizeRemaining}
              onRetryLayerize={onRetryLayerize}
            />
          </div>
        ) : (
          <LayerEditorSession
            open={open}
            workItemId={workItemId}
            outputId={outputId}
            mode={mode}
            onOpenChange={onOpenChange}
            onPublished={onPublished}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LayerEditorSession({ open, workItemId, outputId, mode = "edit", onOpenChange, onPublished }: LayerEditorDialogProps) {
  const editor = useLayerEditor({ workItemId, outputId, mode });
  const { canRedo, canUndo, mode: editorMode, redo, undo } = editor;
  const t = useTranslations("dashboard.home.composer.results");
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [inspectVisibility, setInspectVisibility] = useState<Record<string, boolean>>({});
  const [moreOpen, setMoreOpen] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const regenerationPanelRef = useRef<HTMLDivElement>(null);
  const askInputRef = useRef<HTMLTextAreaElement>(null);
  const canMutate = editor.mode === "edit" && !["reserved", "processing", "ready"].includes(editor.document?.regeneration?.status ?? "");
  const recoverableHeartbeatFailure = !editor.hasUnresolvedConflict && editor.mode === "read" && editor.saveStatus === "error" && Boolean(editor.document);

  useEffect(() => {
    if (!(error || editor.hasUnresolvedConflict || recoverableHeartbeatFailure)) return;
    const focusAlert = setTimeout(() => setTimeout(() => alertRef.current?.focus(), 0), 0);
    return () => clearTimeout(focusAlert);
  }, [editor.hasUnresolvedConflict, error, recoverableHeartbeatFailure]);

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
  const focusAskBar = () => {
    regenerationPanelRef.current?.focus();
    askInputRef.current?.focus();
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
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
        <Button variant="ghost" size="icon" className="min-h-11 min-w-11" onClick={() => void close()} aria-label={t("editorClose")}><X /></Button>
        <div className="mr-auto min-w-0">
          <b className="block truncate text-sm">{t("editorTitle")}</b>
          <span className="text-xs text-[var(--text-muted)]" aria-live="polite">{error ? t("editorSaveError") : exporting ? t("editorSaving") : editor.document ? saveLabel : t("editorLoading")}</span>
        </div>
        {editor.mode !== "edit" ? <span className="rounded-full bg-[var(--surface-inset)] px-2 py-1 text-xs text-[var(--text-secondary)]">{editor.document?.lease.heldByName ? `${t("editorReadOnly")}: ${editor.document.lease.heldByName}` : t("editorReadOnly")}</span> : null}
        {canMutate ? <>
          <Button variant="ghost" size="icon" className="min-h-11 min-w-11" disabled={!editor.canUndo} onClick={editor.undo} aria-label={t("editorUndo")}><Undo2 /></Button>
          <Button variant="ghost" size="icon" className="min-h-11 min-w-11" disabled={!editor.canRedo} onClick={editor.redo} aria-label={t("editorRedo")}><Redo2 /></Button>
        </> : null}
        <Button variant="ghost" size="icon" className="min-h-11 min-w-11" disabled={!editor.document || exporting} onClick={() => void runExport("draft-png")} aria-label={t("editorExportPng")}><Download /></Button>
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={t("editorMoreActions")}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onClick={() => setMoreOpen((open) => !open)}
          >
            <MoreHorizontal />
          </Button>
          {moreOpen ? (
            <div role="menu" className="absolute right-0 top-full z-[var(--layer-popover)] mt-1 min-w-52 rounded-[var(--radius-overlay)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-1 shadow-[var(--shadow-floating)]">
              {canMutate ? <>
                <button type="button" role="menuitem" disabled={!selected} className={cn("flex min-h-11 w-full items-center rounded-[var(--radius-control)] px-3 text-left text-sm disabled:opacity-50")} onClick={() => { setMoreOpen(false); restore(false); }}>{t("editorRestoreLayer")}</button>
                <button type="button" role="menuitem" className="flex min-h-11 w-full items-center rounded-[var(--radius-control)] px-3 text-left text-sm" onClick={() => { setMoreOpen(false); restore(true); }}>{t("editorRestoreAll")}</button>
              </> : null}
              <button type="button" role="menuitem" disabled={!editor.document || exporting} className="flex min-h-11 w-full items-center rounded-[var(--radius-control)] px-3 text-left text-sm disabled:opacity-50" onClick={() => { setMoreOpen(false); void runExport("draft-psd"); }}>{t("editorExportPsd")}</button>
            </div>
          ) : null}
        </div>
        {canMutate && editor.document ? <Button size="sm" className="min-h-11" disabled={exporting} onClick={() => void publish()}><Upload />{t("editorPublish")}</Button> : null}
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_17rem]">
        {editor.document ? <LayerCanvas document={editor.document} selectedLayerId={selected} hoveredLayerId={hovered} onSelect={setSelected} onHover={setHovered} onEditWithAi={focusAskBar} mode={canMutate ? "edit" : "read"} dispatch={editor.dispatch} visibilityOverrides={canMutate ? undefined : inspectVisibility} /> : <div role={editor.openError ? "alert" : undefined} className="grid place-items-center p-6">{editor.openError ?? t("editorLoading")}</div>}
        {editor.document ? (
          <aside className="min-h-0 overflow-y-auto border-[var(--border-subtle)] max-md:border-t md:border-l animate-layer-reveal" style={{ ["--layer-reveal-index" as string]: Math.min(editor.document.layers.length, 4) }}>
            <LayerPanel document={editor.document} selectedLayerId={selected} hoveredLayerId={hovered} onSelect={setSelected} onHover={setHovered} mode={canMutate ? "edit" : "read"} dispatch={editor.dispatch} onInspectVisibilityChange={(id, visible) => setInspectVisibility((current) => ({ ...current, [id]: visible }))} />
          </aside>
        ) : null}
      </div>
      {editor.document ? (
        <div ref={regenerationPanelRef} tabIndex={-1}>
          <LayerRegenerationPanel
            document={editor.document}
            selectedLayerId={selected}
            mode={editor.mode === "edit" ? "edit" : "read"}
            access={editor.access ?? { enabled: false, period: null, layerize: null, regeneration: null }}
            inputRef={askInputRef}
            onClearSelection={() => setSelected(null)}
            onRegenerate={(id, instruction) => act(regenerationAction(() => editor.regenerate(id, instruction)))}
            onRetryDispatch={() => act(regenerationAction(editor.retryRegeneration))}
            onAccept={() => act(regenerationAction(editor.acceptCandidate))}
            onDiscard={() => act(regenerationAction(editor.discardCandidate))}
          />
        </div>
      ) : null}
      {editor.hasUnresolvedConflict ? <div ref={alertRef} role="alert" tabIndex={-1} className="flex flex-wrap items-center gap-2 border-t border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning-text)]"><p>{t("editorConflict")}</p><Button variant="outline" size="sm" className="min-h-11" onClick={() => act(editor.discardLocalEdits)}>{t("editorDiscardLocal")}</Button><Button variant="outline" size="sm" className="min-h-11" onClick={() => void discardAndClose()}>{t("editorDiscardAndClose")}</Button></div> : recoverableHeartbeatFailure ? <div ref={alertRef} role="alert" tabIndex={-1} className="flex flex-wrap items-center gap-2 border-t border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning-text)]"><p>{t("editorSaveError")}</p><Button variant="outline" size="sm" className="min-h-11" onClick={() => act(editor.discardLocalEdits)}>{t("editorDiscardLocal")}</Button></div> : null}
      <div role="status" aria-live="polite" className="sr-only">{notice || editor.mode}</div>
      <div ref={editor.hasUnresolvedConflict || recoverableHeartbeatFailure ? undefined : alertRef} role="alert" tabIndex={-1} className="sr-only">{error || (editor.hasUnresolvedConflict ? t("editorConflict") : "")}</div>
    </div>
  );
}
