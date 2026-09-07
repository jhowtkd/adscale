"use client";

import { useEffect, type MutableRefObject } from "react";
import { focusBrandSwitcher } from "./composer-state";
import type { DraftSnapshot } from "./composer-state";

export function useComposerAutosave({
  workflowVariant,
  objective,
  initialWorkId,
  hydratedWorkRef,
  workIdRef,
  autosaveBlockedWorkRef,
  activeClientProfileId,
  requestRef,
  captureSnapshot,
  ensureDraft,
  persistSnapshot,
  setError,
  directionPool,
  fontAssetKey,
  format,
  formatMode,
  intent,
  request,
  targetFormats,
  textLayout,
  currentWork,
}: {
  workflowVariant: string;
  objective: unknown;
  initialWorkId?: string;
  hydratedWorkRef: MutableRefObject<string | null>;
  workIdRef: MutableRefObject<string | null>;
  autosaveBlockedWorkRef: MutableRefObject<string | null>;
  activeClientProfileId: string | null;
  requestRef: MutableRefObject<string>;
  captureSnapshot: () => DraftSnapshot;
  ensureDraft: () => Promise<string | null>;
  persistSnapshot: (workId: string, snapshot: DraftSnapshot) => Promise<unknown>;
  setError: (value: string | null) => void;
  directionPool: unknown;
  fontAssetKey: string | null;
  format: unknown;
  formatMode: unknown;
  intent: unknown;
  request: string;
  targetFormats: unknown;
  textLayout: unknown;
  currentWork?: { id: string; status: string } | null;
}): void {
  useEffect(() => {
    if (workflowVariant === "progressive" && !objective) return;
    if (initialWorkId && !hydratedWorkRef.current) return;
    if (workIdRef.current && (!currentWork || currentWork.id !== workIdRef.current)) return;
    if (workIdRef.current && currentWork?.id === workIdRef.current && currentWork.status !== "draft") return;
    if (workIdRef.current && autosaveBlockedWorkRef.current === workIdRef.current) return;
    const timer = window.setTimeout(() => {
      if (!workIdRef.current && !activeClientProfileId) {
        if (requestRef.current.trim()) focusBrandSwitcher();
        return;
      }
      const save = async () => {
        const id = workIdRef.current ?? await ensureDraft();
        if (id) await persistSnapshot(id, captureSnapshot());
      };
      void save().catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao salvar"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    activeClientProfileId,
    autosaveBlockedWorkRef,
    captureSnapshot,
    currentWork,
    directionPool,
    ensureDraft,
    fontAssetKey,
    format,
    formatMode,
    hydratedWorkRef,
    initialWorkId,
    intent,
    objective,
    persistSnapshot,
    request,
    requestRef,
    setError,
    targetFormats,
    textLayout,
    workIdRef,
    workflowVariant,
  ]);
}
