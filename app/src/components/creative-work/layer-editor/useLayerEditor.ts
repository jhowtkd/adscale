"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LAYER_EDITOR_AUTOSAVE_MS, LAYER_EDITOR_HEARTBEAT_MS, type LayerEditorAccessV1, type PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";
import { patchCreativeWork } from "@/lib/hooks/use-creative-work";
import { applyLayerEditorCommand, createLayerEditorSession, redoLayerEditor, undoLayerEditor, type LayerEditorCommand, type LayerEditorSessionState } from "./state";

type LayerEditorInput = { workItemId: string; outputId: string; mode: "edit" | "inspect" };
export type LayerEditorMode = "edit" | "inspect" | "read";
export type LayerEditorSaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";
type OpenResponse = { document: PublicLayerEditorDocumentV1; access: LayerEditorAccessV1 };
type OpenFailureDetails = { document?: PublicLayerEditorDocumentV1 | null };

function conflictDocument(error: unknown): PublicLayerEditorDocumentV1 | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { document?: PublicLayerEditorDocumentV1 | null; details?: OpenFailureDetails };
  return value.details?.document ?? value.document ?? null;
}

export function useLayerEditor(input: LayerEditorInput) {
  const [session, setSession] = useState<LayerEditorSessionState | null>(null);
  const [leaseId, setLeaseId] = useState<string | null>(null);
  const [mode, setMode] = useState<LayerEditorMode>(input.mode);
  const [access, setAccess] = useState<LayerEditorAccessV1 | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const sessionRef = useRef<LayerEditorSessionState | null>(null);
  const leaseRef = useRef<string | null>(null);
  const modeRef = useRef(mode);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const serverRevision = useRef(0);
  const saving = useRef(false);
  const savePromise = useRef<Promise<boolean> | null>(null);
  const dirty = useRef(false);
  const unresolvedConflict = useRef(false);
  const canonicalConflict = useRef<PublicLayerEditorDocumentV1 | null>(null);
  const stopped = useRef(false);
  const [hasUnresolvedConflict, setHasUnresolvedConflict] = useState(false);
  const [saveStatus, setSaveStatus] = useState<LayerEditorSaveStatus>("idle");
  const operations = useRef(new Map<string, string>());

  const replaceSession = useCallback((next: LayerEditorSessionState | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const stop = useCallback((preserveDirty = false) => {
    if (timer.current) clearTimeout(timer.current);
    if (!preserveDirty) dirty.current = false;
    stopped.current = true;
    modeRef.current = "read";
    setMode("read");
  }, []);

  const markConflict = useCallback((document?: PublicLayerEditorDocumentV1 | null) => {
    if (document) {
      canonicalConflict.current = document;
      // A conflict response can prove that another editor owns the lease. Do
      // not later attempt a release with the stale local lease id.
      if (document.lease.mode !== "edit") {
        leaseRef.current = null;
        setLeaseId(null);
      }
    }
    dirty.current = true;
    unresolvedConflict.current = true;
    setHasUnresolvedConflict(true);
    setSaveStatus("conflict");
    stop(true);
  }, [stop]);

  const applyCanonicalDocument = useCallback((document: PublicLayerEditorDocumentV1) => {
    const current = sessionRef.current;
    replaceSession(current ? { ...current, present: document } : createLayerEditorSession(document));
  }, [replaceSession]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (modeRef.current !== "edit") return !dirty.current;
    if (timer.current) clearTimeout(timer.current);
    while (dirty.current || saving.current) {
      if (saving.current) {
        const pending = savePromise.current;
        if (!pending || !await pending) return false;
        continue;
      }
      const current = sessionRef.current;
      const activeLeaseId = leaseRef.current;
      if (!dirty.current) continue;
      if (!current || !activeLeaseId) return false;
      saving.current = true;
      dirty.current = false;
      setSaveStatus("saving");
      const present = current.present;
      const pending = (async () => {
        try {
          const response = await patchCreativeWork<OpenResponse>(input.workItemId, {
            action: "saveLayerEditor",
            outputId: input.outputId,
            leaseId: activeLeaseId,
            expectedRevision: serverRevision.current,
            snapshot: {
              layers: present.layers.map((layer) => ({
                id: layer.id,
                order: layer.order,
                name: layer.name,
                visible: layer.visible,
                x: layer.x,
                y: layer.y,
                width: layer.width,
                height: layer.height,
                useSource: layer.currentKind === "source",
              })),
            },
          });
          serverRevision.current = response.document.revision;
          setAccess(response.access);
          if (!dirty.current) applyCanonicalDocument(response.document);
          if (!dirty.current) setSaveStatus("saved");
          return true;
        } catch (error) {
          const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : null;
          if (code === "layer_editor_locked" || code === "layer_editor_revision_conflict") markConflict(conflictDocument(error));
          else setSaveStatus("error");
          return false;
        } finally {
          saving.current = false;
          savePromise.current = null;
        }
      })();
      savePromise.current = pending;
      if (!await pending) return false;
    }
    return true;
  }, [applyCanonicalDocument, input.outputId, input.workItemId, markConflict]);

  const scheduleSave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), LAYER_EDITOR_AUTOSAVE_MS);
  }, [flush]);

  const open = useCallback(async (discardLocal = false) => {
    let response: OpenResponse;
    try {
      response = await patchCreativeWork<OpenResponse>(input.workItemId, {
        action: "openLayerEditor",
        outputId: input.outputId,
        mode: input.mode,
      });
    } catch (error) {
      const document = conflictDocument(error);
      if (!document) throw error;
      serverRevision.current = document.revision;
      leaseRef.current = null;
      setLeaseId(null);
      applyCanonicalDocument(document);
      markConflict(document);
      setOpenError(error instanceof Error ? error.message : "Unable to open the layer editor");
      return;
    }
    serverRevision.current = response.document.revision;
    setAccess(response.access);
    leaseRef.current = response.document.lease.leaseId;
    setLeaseId(response.document.lease.leaseId);
    const nextMode: LayerEditorMode = response.document.lease.mode === "edit"
      ? "edit"
      : input.mode === "inspect" ? "inspect" : "read";
    modeRef.current = nextMode;
    setMode(nextMode);
    stopped.current = nextMode !== "edit";
    if (discardLocal || !dirty.current) {
      dirty.current = false;
      unresolvedConflict.current = false;
      setHasUnresolvedConflict(false);
      setSaveStatus("saved");
    }
    setOpenError(null);
    if (discardLocal || !dirty.current) applyCanonicalDocument(response.document);
  }, [applyCanonicalDocument, input.mode, input.outputId, input.workItemId, markConflict]);

  useEffect(() => {
    const opening = setTimeout(() => {
      void open().catch((error) => {
        setOpenError(error instanceof Error ? error.message : "Unable to open the layer editor");
        stop();
      });
    }, 0);
    return () => {
      clearTimeout(opening);
      if (timer.current) clearTimeout(timer.current);
      if (leaseRef.current) {
        void patchCreativeWork(input.workItemId, {
          action: "releaseLayerEditor",
          outputId: input.outputId,
          leaseId: leaseRef.current,
        });
      }
    };
  }, [input.outputId, input.workItemId, open, stop]);

  const commitSession = useCallback((next: LayerEditorSessionState) => {
    if (next === sessionRef.current) return;
    replaceSession(next);
    dirty.current = true;
    setSaveStatus("idle");
    scheduleSave();
  }, [replaceSession, scheduleSave]);

  const dispatch = useCallback((command: LayerEditorCommand) => {
    const current = sessionRef.current;
    if (modeRef.current !== "edit" || !current || current.present.regeneration) return;
    commitSession(applyLayerEditorCommand(current, command));
  }, [commitSession]);

  const undo = useCallback(() => {
    const current = sessionRef.current;
    if (modeRef.current !== "edit" || !current || current.present.regeneration) return;
    commitSession(undoLayerEditor(current));
  }, [commitSession]);

  const redo = useCallback(() => {
    const current = sessionRef.current;
    if (modeRef.current !== "edit" || !current || current.present.regeneration) return;
    commitSession(redoLayerEditor(current));
  }, [commitSession]);

  useEffect(() => {
    if (mode !== "edit" || !leaseId) return;
    const heartbeat = setInterval(() => {
      if (globalThis.document.visibilityState !== "visible") return;
      void patchCreativeWork<OpenResponse>(input.workItemId, {
        action: "heartbeatLayerEditor",
        outputId: input.outputId,
        leaseId,
      }).then((response) => {
        serverRevision.current = response.document.revision;
        setAccess(response.access);
        if (!dirty.current) applyCanonicalDocument(response.document);
      }).catch((error) => {
        const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : null;
        if (code === "layer_editor_locked" || code === "layer_editor_revision_conflict") markConflict(conflictDocument(error));
        else { setSaveStatus("error"); stop(); }
      });
    }, LAYER_EDITOR_HEARTBEAT_MS);
    return () => clearInterval(heartbeat);
  }, [applyCanonicalDocument, input.outputId, input.workItemId, leaseId, markConflict, mode, stop]);

  const command = useCallback(async (action: string, extra: Record<string, unknown> = {}, operationKey = action, operationId?: string) => {
    if (modeRef.current !== "edit" || !leaseRef.current) return null;
    const stableOperationId = operationId ?? operations.current.get(operationKey) ?? crypto.randomUUID();
    if (!operationId) operations.current.set(operationKey, stableOperationId);
    if (!await flush()) return null;
    try {
      const result = await patchCreativeWork(input.workItemId, {
        action,
        outputId: input.outputId,
        leaseId: leaseRef.current,
        expectedRevision: serverRevision.current,
        operationId: stableOperationId,
        ...extra,
      });
      if (!operationId) operations.current.delete(operationKey);
      return result;
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : null;
      if (code === "layer_editor_locked" || code === "layer_editor_revision_conflict") markConflict(conflictDocument(error));
      throw error;
    }
  }, [flush, input.outputId, input.workItemId, markConflict]);

  const regenerate = useCallback(async (layerId: string, instruction: string) => {
    const result = await command("regenerateLayer", { layerId, instruction }, `regenerate:${layerId}:${instruction}`);
    if (result) await open();
    return result;
  }, [command, open]);
  const acceptCandidate = useCallback(async () => {
    const operationId = sessionRef.current?.present.regeneration?.id;
    if (!operationId) return null;
    const result = await command("acceptLayerCandidate", {}, "accept", operationId);
    if (result) await open();
    return result;
  }, [command, open]);
  const discardCandidate = useCallback(async () => {
    const operationId = sessionRef.current?.present.regeneration?.id;
    if (!operationId) return null;
    const result = await command("discardLayerCandidate", {}, "discard", operationId);
    if (result) await open();
    return result;
  }, [command, open]);

  const document = session?.present ?? null;
  const regenerationStatus = document?.regeneration?.status;

  useEffect(() => {
    if (!( ["reserved", "processing"] as const).includes(regenerationStatus as "reserved" | "processing")) return;
    const polling = setInterval(() => {
      if (!stopped.current) void open();
    }, 2_000);
    return () => clearInterval(polling);
  }, [open, regenerationStatus]);

  const exportDraft = useCallback(async (format: "draft-png" | "draft-psd") => {
    const popup = globalThis.window.open("about:blank", "_blank");
    if (!popup) return false;
    try {
      if (!await flush()) throw new Error("Unable to save the current revision");
      popup.location.assign(`/api/creative-work/${input.workItemId}/outputs/${input.outputId}/download?format=${format}&revision=${serverRevision.current}`);
      return true;
    } catch {
      popup.close();
      return false;
    }
  }, [flush, input.outputId, input.workItemId]);

  const publish = useCallback(async () => {
    const result = await command("publishLayerEditor");
    if (result && typeof result === "object" && "ok" in result && result.ok === true && leaseRef.current) {
      await patchCreativeWork(input.workItemId, { action: "releaseLayerEditor", outputId: input.outputId, leaseId: leaseRef.current });
      leaseRef.current = null;
      setLeaseId(null);
      stop();
    }
    return result;
  }, [command, input.outputId, input.workItemId, stop]);

  const flushAndRelease = useCallback(async () => {
    if (unresolvedConflict.current) return false;
    if (!await flush()) return false;
    if (leaseRef.current) {
      try {
        await patchCreativeWork(input.workItemId, { action: "releaseLayerEditor", outputId: input.outputId, leaseId: leaseRef.current });
        leaseRef.current = null;
        setLeaseId(null);
      } catch {
        return false;
      }
    }
    return true;
  }, [flush, input.outputId, input.workItemId]);

  const discardLocalEdits = useCallback(async () => {
    const canonical = canonicalConflict.current;
    if (canonical) {
      serverRevision.current = canonical.revision;
      replaceSession(createLayerEditorSession(canonical));
      dirty.current = false;
      unresolvedConflict.current = false;
      canonicalConflict.current = null;
      setHasUnresolvedConflict(false);
      setSaveStatus("saved");
      return;
    }
    await open(true);
  }, [open, replaceSession]);

  const abandonLocalEdits = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    dirty.current = false;
    unresolvedConflict.current = false;
    canonicalConflict.current = null;
    setHasUnresolvedConflict(false);
    setSaveStatus("idle");
    stop();
    const activeLeaseId = leaseRef.current;
    leaseRef.current = null;
    setLeaseId(null);
    if (activeLeaseId) {
      await patchCreativeWork(input.workItemId, { action: "releaseLayerEditor", outputId: input.outputId, leaseId: activeLeaseId }).catch(() => undefined);
    }
  }, [input.outputId, input.workItemId, stop]);

  return {
    document,
    access,
    leaseId,
    mode,
    openError,
    hasUnresolvedConflict,
    saveStatus,
    dispatch,
    open,
    flush,
    canUndo: mode === "edit" && !document?.regeneration && Boolean(session?.past.length),
    canRedo: mode === "edit" && !document?.regeneration && Boolean(session?.future.length),
    undo,
    redo,
    regenerate,
    acceptCandidate,
    discardCandidate,
    flushAndRelease,
    discardLocalEdits,
    abandonLocalEdits,
    exportDraft,
    publish,
  };
}
