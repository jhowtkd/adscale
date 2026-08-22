"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LAYER_EDITOR_AUTOSAVE_MS, LAYER_EDITOR_HEARTBEAT_MS, type PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";
import { patchCreativeWork } from "@/lib/hooks/use-creative-work";
import { applyLayerEditorCommand, createLayerEditorSession, redoLayerEditor, undoLayerEditor, type LayerEditorCommand, type LayerEditorSessionState } from "./state";

type LayerEditorInput = { workItemId: string; outputId: string; mode: "edit" | "inspect" };
type OpenResponse = { document: PublicLayerEditorDocumentV1 };

export function useLayerEditor(input: LayerEditorInput) {
  const [session, setSession] = useState<LayerEditorSessionState | null>(null);
  const [leaseId, setLeaseId] = useState<string | null>(null);
  const [mode, setMode] = useState(input.mode);
  const sessionRef = useRef<LayerEditorSessionState | null>(null);
  const leaseRef = useRef<string | null>(null);
  const modeRef = useRef(mode);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const serverRevision = useRef(0);
  const saving = useRef(false);
  const dirty = useRef(false);
  const operation = useRef<string | null>(null);

  const replaceSession = useCallback((next: LayerEditorSessionState | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    modeRef.current = "inspect";
    setMode("inspect");
  }, []);

  const applyCanonicalDocument = useCallback((document: PublicLayerEditorDocumentV1) => {
    const current = sessionRef.current;
    replaceSession(current ? { ...current, present: document } : createLayerEditorSession(document));
  }, [replaceSession]);

  const flush = useCallback(async (): Promise<void> => {
    const current = sessionRef.current;
    if (saving.current || !dirty.current || modeRef.current !== "edit" || !leaseRef.current || !current) return;
    saving.current = true;
    dirty.current = false;
    const present = current.present;
    try {
      const response = await patchCreativeWork<OpenResponse>(input.workItemId, {
        action: "saveLayerEditor",
        outputId: input.outputId,
        leaseId: leaseRef.current,
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
      if (!dirty.current) applyCanonicalDocument(response.document);
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : null;
      if (code === "layer_editor_locked" || code === "layer_editor_revision_conflict") stop();
    } finally {
      saving.current = false;
      if (dirty.current && modeRef.current === "edit") void flush();
    }
  }, [applyCanonicalDocument, input.outputId, input.workItemId, stop]);

  const scheduleSave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), LAYER_EDITOR_AUTOSAVE_MS);
  }, [flush]);

  const open = useCallback(async () => {
    const response = await patchCreativeWork<OpenResponse>(input.workItemId, {
      action: "openLayerEditor",
      outputId: input.outputId,
      mode: input.mode,
    });
    serverRevision.current = response.document.revision;
    leaseRef.current = response.document.lease.leaseId;
    setLeaseId(response.document.lease.leaseId);
    if (!dirty.current) applyCanonicalDocument(response.document);
  }, [applyCanonicalDocument, input.mode, input.outputId, input.workItemId]);

  useEffect(() => {
    void open();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (leaseRef.current) {
        void patchCreativeWork(input.workItemId, {
          action: "releaseLayerEditor",
          outputId: input.outputId,
          leaseId: leaseRef.current,
        });
      }
    };
  }, [input.outputId, input.workItemId, open]);

  const commitSession = useCallback((next: LayerEditorSessionState) => {
    if (next === sessionRef.current) return;
    replaceSession(next);
    dirty.current = true;
    scheduleSave();
  }, [replaceSession, scheduleSave]);

  const dispatch = useCallback((command: LayerEditorCommand) => {
    const current = sessionRef.current;
    if (modeRef.current !== "edit" || !current) return;
    commitSession(applyLayerEditorCommand(current, command));
  }, [commitSession]);

  const undo = useCallback(() => {
    const current = sessionRef.current;
    if (modeRef.current !== "edit" || !current) return;
    commitSession(undoLayerEditor(current));
  }, [commitSession]);

  const redo = useCallback(() => {
    const current = sessionRef.current;
    if (modeRef.current !== "edit" || !current) return;
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
        if (!dirty.current) applyCanonicalDocument(response.document);
      }).catch(stop);
    }, LAYER_EDITOR_HEARTBEAT_MS);
    return () => clearInterval(heartbeat);
  }, [applyCanonicalDocument, input.outputId, input.workItemId, leaseId, mode, stop]);

  const command = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (modeRef.current !== "edit" || !leaseRef.current) return null;
    operation.current ??= crypto.randomUUID();
    await flush();
    return patchCreativeWork(input.workItemId, {
      action,
      outputId: input.outputId,
      leaseId: leaseRef.current,
      expectedRevision: serverRevision.current,
      operationId: operation.current,
      ...extra,
    });
  }, [flush, input.outputId, input.workItemId]);

  const regenerate = useCallback((layerId: string, instruction: string) => command("regenerateLayer", { layerId, instruction }), [command]);
  const acceptCandidate = useCallback(() => command("acceptLayerCandidate"), [command]);
  const discardCandidate = useCallback(() => command("discardLayerCandidate"), [command]);

  const document = session?.present ?? null;

  useEffect(() => {
    if (!document || !(["reserved", "processing"] as const).includes(document.regeneration?.status as "reserved" | "processing")) return;
    const polling = setInterval(() => void open(), 2_000);
    return () => clearInterval(polling);
  }, [document?.regeneration?.status, open]);

  const exportDraft = useCallback(async (format: "draft-png" | "draft-psd") => {
    const popup = globalThis.window.open("about:blank", "_blank");
    try {
      await flush();
      popup?.location.assign(`/api/creative-work/${input.workItemId}/outputs/${input.outputId}/download?format=${format}&revision=${serverRevision.current}`);
      return true;
    } catch {
      popup?.close();
      return false;
    }
  }, [flush, input.outputId, input.workItemId]);

  const publish = useCallback(async () => {
    const result = await command("publishLayerEditor");
    if (result && leaseRef.current) {
      await patchCreativeWork(input.workItemId, { action: "releaseLayerEditor", outputId: input.outputId, leaseId: leaseRef.current });
    }
    return result;
  }, [command, input.outputId, input.workItemId]);

  const flushAndRelease = useCallback(async () => {
    await flush();
    if (leaseRef.current) {
      await patchCreativeWork(input.workItemId, { action: "releaseLayerEditor", outputId: input.outputId, leaseId: leaseRef.current });
    }
    return true;
  }, [flush, input.outputId, input.workItemId]);

  return {
    document,
    leaseId,
    mode,
    dispatch,
    open,
    flush,
    canUndo: mode === "edit" && Boolean(session?.past.length),
    canRedo: mode === "edit" && Boolean(session?.future.length),
    undo,
    redo,
    regenerate,
    acceptCandidate,
    discardCandidate,
    flushAndRelease,
    exportDraft,
    publish,
  };
}
