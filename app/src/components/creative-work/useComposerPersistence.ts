"use client";

import { useCallback, useEffect, type MutableRefObject } from "react";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";
import type { CreativeDraftInput, CreativeWorkDraftItem, CreativeWorkItem, CreativeWorkQuote } from "@/lib/hooks/use-creative-work";
import { usageForDraftSource, type ComposerSourceAction, type DraftSource } from "./composer-attach";
import { canFlushAutosaveForWork, shouldDeferDraftCreate } from "./composer-draft";
import {
  UUID_SCHEMA,
  focusBrandSwitcher,
  isCreativeWorkConflict,
  signature,
  snapshotFromWork,
  writeStoredDraft,
  type ComposerIntent,
  type DraftSnapshot,
} from "./composer-state";
import type { ComposerRevisionRefresher, ComposerRevisionWriter } from "./composer-revision";

type CreateDraftResult = {
  work: CreativeWorkDraftItem;
  quote: CreativeWorkQuote;
};

export function useComposerPersistence({
  workflowVariant,
  initialWorkId,
  activeClientProfileId,
  objectiveRef,
  intentRef,
  workIdRef,
  draftKeyRef,
  draftEpochRef,
  createInFlightRef,
  lastPersistedRef,
  autosaveBlockedWorkRef,
  hydratedWorkRef,
  pendingCampaignIdRef,
  saveChainRef,
  persistOnUnmountRef,
  mountedRef,
  lifecycleRef,
  captureSnapshot,
  createMutation,
  autosaveMutation,
  carouselDraft,
  mutateSource,
  linkCampaign,
  recordCanonicalEvent,
  setCanonicalWorkRevision,
  refreshCanonicalWorkRevision,
  resolveCanonicalWorkRevision,
  blockStaleRevision,
  markRevisionUnavailable,
  isRevisionUnavailable,
  exposeWorkId,
  setWorkId,
  setQuote,
  setAnnouncement,
  setError,
  workStatus,
  currentWorkId,
  outputCount,
}: {
  workflowVariant: StudioRolloutVariant;
  initialWorkId?: string;
  activeClientProfileId: string | null;
  objectiveRef: MutableRefObject<ComposerIntent | null>;
  intentRef: MutableRefObject<ComposerIntent>;
  workIdRef: MutableRefObject<string | null>;
  draftKeyRef: MutableRefObject<string>;
  draftEpochRef: MutableRefObject<number>;
  createInFlightRef: MutableRefObject<Promise<string | null> | null>;
  lastPersistedRef: MutableRefObject<string | null>;
  autosaveBlockedWorkRef: MutableRefObject<string | null>;
  hydratedWorkRef: MutableRefObject<string | null>;
  pendingCampaignIdRef: MutableRefObject<string | null>;
  saveChainRef: MutableRefObject<Promise<void>>;
  persistOnUnmountRef: MutableRefObject<() => Promise<void>>;
  mountedRef: MutableRefObject<boolean>;
  lifecycleRef: MutableRefObject<number>;
  captureSnapshot: () => DraftSnapshot;
  createMutation: { mutateAsync: (payload: CreativeDraftInput) => Promise<CreateDraftResult> };
  autosaveMutation: {
    mutateAsync: (payload: Omit<CreativeDraftInput, "clientProfileId" | "draftKey"> & {
      workItemId: string;
      expectedUpdatedAt: string;
    }) => Promise<{ work?: { updatedAt?: Date | string } }>;
  };
  carouselDraft: CreativeWorkItem["settings"]["carouselDraft"];
  mutateSource: (action: ComposerSourceAction) => Promise<unknown>;
  linkCampaign: (campaignId: string | null) => Promise<boolean>;
  recordCanonicalEvent: (
    name: string,
    workId: string,
    payload?: Record<string, string | number | boolean>,
  ) => void;
  setCanonicalWorkRevision: ComposerRevisionWriter;
  refreshCanonicalWorkRevision: ComposerRevisionRefresher;
  resolveCanonicalWorkRevision: (workId: string) => Promise<string | null>;
  blockStaleRevision: (workId: string) => void;
  markRevisionUnavailable: (workId: string) => void;
  isRevisionUnavailable: (workId: string) => boolean;
  exposeWorkId: (workId: string) => void;
  setWorkId: (workId: string) => void;
  setQuote: (quote: CreativeWorkQuote) => void;
  setAnnouncement: (value: string) => void;
  setError: (value: string | null) => void;
  workStatus: string | undefined;
  currentWorkId: string | undefined;
  outputCount: number;
}) {
  const enqueueSave = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const run = saveChainRef.current.then(operation, operation);
    saveChainRef.current = run.then(() => undefined, () => undefined);
    return run;
  }, [saveChainRef]);

  const ensureDraft = useCallback((source?: DraftSource, silent = false) => {
    if (shouldDeferDraftCreate({ workflowVariant, objective: objectiveRef.current })) {
      return Promise.resolve(null);
    }
    if (workIdRef.current) return Promise.resolve(workIdRef.current);
    if (createInFlightRef.current) {
      const creating = createInFlightRef.current;
      if (!source) return creating;
      return creating.then(async (id) => {
        if (!id) return null;
        await mutateSource({
          workItemId: id,
          action: "attachSource",
          ...source,
          usage: usageForDraftSource(intentRef.current, source.usage),
        });
        return id;
      });
    }
    if (!activeClientProfileId) {
      focusBrandSwitcher();
      return Promise.resolve(null);
    }
    const snapshot = captureSnapshot();
    if (!snapshot.request && !source) return Promise.resolve(null);
    const draftEpoch = draftEpochRef.current;

    const promise = enqueueSave(async () => {
      const result = await createMutation.mutateAsync({
        clientProfileId: activeClientProfileId,
        draftKey: draftKeyRef.current,
        ...snapshot,
        ...(source ? { ...source, usage: usageForDraftSource(intentRef.current, source.usage) } : {}),
      });
      if (!UUID_SCHEMA.safeParse(result.work.id).success) {
        throw new Error("Identificador do trabalho inválido");
      }
      if (draftEpoch !== draftEpochRef.current) return null;
      recordCanonicalEvent("creative_work_started", result.work.id, {
        protocol: result.work.toolKind === "social_post" ? "variations" : result.work.toolKind,
        inputMode: snapshot.request.trim() ? (source ? "both" : "text") : "art",
      });
      workIdRef.current = result.work.id;
      lastPersistedRef.current = signature(snapshotFromWork(result.work));
      if (!setCanonicalWorkRevision(result.work.id, result.work.updatedAt)) {
        await refreshCanonicalWorkRevision(result.work.id);
      }
      writeStoredDraft(activeClientProfileId, intentRef.current, result.work.id);
      if (!silent && mountedRef.current) {
        setWorkId(result.work.id);
        setQuote(result.quote);
        setAnnouncement("Rascunho salvo");
        exposeWorkId(result.work.id);
      }
      const campaignId = pendingCampaignIdRef.current;
      if (campaignId) await linkCampaign(campaignId);
      return result.work.id;
    }).catch((cause) => {
      if (draftEpoch === draftEpochRef.current && !silent && mountedRef.current) {
        setError(cause instanceof Error ? cause.message : "Falha ao salvar rascunho");
      }
      return null;
    }).finally(() => {
      if (createInFlightRef.current === promise) createInFlightRef.current = null;
    });
    createInFlightRef.current = promise;
    return promise;
  }, [
    activeClientProfileId,
    captureSnapshot,
    createInFlightRef,
    createMutation,
    draftEpochRef,
    draftKeyRef,
    enqueueSave,
    exposeWorkId,
    intentRef,
    lastPersistedRef,
    linkCampaign,
    mountedRef,
    mutateSource,
    objectiveRef,
    pendingCampaignIdRef,
    recordCanonicalEvent,
    refreshCanonicalWorkRevision,
    setAnnouncement,
    setCanonicalWorkRevision,
    setError,
    setQuote,
    setWorkId,
    workIdRef,
    workflowVariant,
  ]);

  const persistSnapshot = useCallback((id: string, snapshot: DraftSnapshot, announce = true) => enqueueSave(async () => {
    if (autosaveBlockedWorkRef.current === id) return;
    const sentSignature = signature(snapshot);
    if (sentSignature === lastPersistedRef.current) return;
    try {
      const expectedUpdatedAt = await resolveCanonicalWorkRevision(id);
      if (!expectedUpdatedAt) {
        markRevisionUnavailable(id);
        if (mountedRef.current) setError("Recarregue o trabalho antes de continuar.");
        return;
      }
      const result = await autosaveMutation.mutateAsync({
        workItemId: id,
        expectedUpdatedAt,
        ...snapshot,
        settings: intentRef.current === "carousel"
          ? { ...snapshot.settings, carouselDraft }
          : snapshot.settings,
      });
      if (!setCanonicalWorkRevision(id, result.work?.updatedAt)) {
        try {
          if (!await refreshCanonicalWorkRevision(id)) blockStaleRevision(id);
        } catch {
          blockStaleRevision(id);
        }
      }
    } catch (cause) {
      const code = cause instanceof Error && "code" in cause
        ? (cause as Error & { code?: unknown }).code
        : cause instanceof Error
          ? cause.message
          : null;
      if (code === "creativeWorkNotDraft") autosaveBlockedWorkRef.current = id;
      if (isCreativeWorkConflict(cause)) {
        blockStaleRevision(id);
        try { await refreshCanonicalWorkRevision(id); } catch { /* keep blocked */ }
      }
      throw cause;
    }
    lastPersistedRef.current = sentSignature;
    if (announce && mountedRef.current) setAnnouncement("Alterações salvas");
  }), [
    autosaveBlockedWorkRef,
    autosaveMutation,
    blockStaleRevision,
    carouselDraft,
    enqueueSave,
    intentRef,
    lastPersistedRef,
    markRevisionUnavailable,
    mountedRef,
    refreshCanonicalWorkRevision,
    resolveCanonicalWorkRevision,
    setAnnouncement,
    setCanonicalWorkRevision,
    setError,
  ]);

  const flushAutosave = useCallback(async (): Promise<string | null> => {
    if (initialWorkId && !hydratedWorkRef.current) return null;
    await saveChainRef.current;
    const id = workIdRef.current ?? await ensureDraft();
    if (!id) return null;
    if (!canFlushAutosaveForWork({
      status: currentWorkId === id ? workStatus : undefined,
      outputCount,
      autosaveBlocked: autosaveBlockedWorkRef.current === id,
      revisionUnavailable: isRevisionUnavailable(id),
    })) return null;
    for (;;) {
      await saveChainRef.current;
      if (isRevisionUnavailable(id)) return null;
      const snapshot = captureSnapshot();
      if (signature(snapshot) === lastPersistedRef.current) return id;
      await persistSnapshot(id, snapshot);
    }
  }, [
    autosaveBlockedWorkRef,
    captureSnapshot,
    currentWorkId,
    ensureDraft,
    hydratedWorkRef,
    initialWorkId,
    isRevisionUnavailable,
    lastPersistedRef,
    outputCount,
    persistSnapshot,
    saveChainRef,
    workIdRef,
    workStatus,
  ]);

  persistOnUnmountRef.current = async () => {
    if (shouldDeferDraftCreate({ workflowVariant, objective: objectiveRef.current })) return;
    if (initialWorkId && !hydratedWorkRef.current) return;
    await saveChainRef.current;
    const id = workIdRef.current ?? await ensureDraft(undefined, true);
    if (!id) return;
    if (autosaveBlockedWorkRef.current === id) return;
    if (currentWorkId === id && workStatus !== "draft") return;
    const snapshot = captureSnapshot();
    if (signature(snapshot) !== lastPersistedRef.current) {
      await persistSnapshot(id, snapshot, false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const lifecycle = ++lifecycleRef.current;
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => {
        if (lifecycleRef.current === lifecycle) void persistOnUnmountRef.current();
      });
    };
  }, [lifecycleRef, mountedRef, persistOnUnmountRef]);

  return { enqueueSave, ensureDraft, persistSnapshot, flushAutosave };
}
