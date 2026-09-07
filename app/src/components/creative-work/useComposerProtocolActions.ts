"use client";

import { useCallback, type MutableRefObject, type RefObject } from "react";
import { uploadChatAttachment } from "@/lib/assistant/chat-attachments";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";
import type { CreativeWorkItem, CreativeWorkQuote, CreativeWorkSource } from "@/lib/hooks/use-creative-work";
import type { CreativeDirection, CreativeDirectionPool } from "@/server/creative-work/contracts";
import type { DraftSource } from "./composer-attach";
import {
  firstProgressiveObjectiveUsage,
  nextProtocolDirectionPool,
  nextProtocolTargetFormats,
  protocolSwitchHasPendingWork,
  selectIntentDecision,
} from "./composer-protocol";
import {
  canonicalQuote,
  readStoredDraft,
  reusableSourceForProtocol,
  signature,
  writeStoredDraft,
  type ComposerActionPhase,
  type ComposerIntent,
  type DraftSnapshot,
} from "./composer-state";

type Format = CreativeWorkItem["format"];

export function useComposerProtocolActions({
  workflowVariant,
  activeClientProfileId,
  currentWork,
  sources,
  bufferedFile,
  isUploading,
  actionPhase,
  sourceMutationPending,
  createMutationPending,
  pendingProtocolSwitch,
  protocolSwitchNotice,
  tHome,
  objectiveRef,
  intentRef,
  workIdRef,
  requestRef,
  formatRef,
  targetFormatsRef,
  textLayoutRef,
  fontAssetKeyRef,
  directionPoolRef,
  draftKeyRef,
  draftEpochRef,
  createInFlightRef,
  autosaveBlockedWorkRef,
  hydratedWorkRef,
  lastPersistedRef,
  briefingOverridesRef,
  briefingVersionRef,
  directionSuggestionRequestedRef,
  directionTouchedRef,
  uploadInFlightRef,
  pendingProtocolTransitionRef,
  composerRef,
  captureSnapshot,
  ensureDraft,
  flushAutosave,
  markPlanInputEdited,
  exposeIntent,
  exposeWorkId,
  recordStudioEvent,
  setObjective,
  setIntent,
  setTargetFormats,
  setTextLayout,
  setFontAssetKey,
  setDirectionPool,
  setQuote,
  setWorkId,
  setRequestState,
  setError,
  setBrandConflict,
  setInferredBriefingContext,
  setBriefingEditState,
  setPendingDirectionSuggestions,
  setDirectionSuggestionState,
  setDirectionSuggestionRetryToken,
  setActionPhase,
  setProtocolSwitchNotice,
  setPendingProtocolSwitch,
  setIsUploading,
  setBufferedFile,
}: {
  workflowVariant: StudioRolloutVariant;
  activeClientProfileId: string | null;
  currentWork: Pick<CreativeWorkItem, "id" | "status" | "request" | "clientProfileId"> | undefined;
  sources: readonly CreativeWorkSource[];
  bufferedFile: File | null;
  isUploading: boolean;
  actionPhase: ComposerActionPhase;
  sourceMutationPending: boolean;
  createMutationPending: boolean;
  pendingProtocolSwitch: ComposerIntent | null;
  protocolSwitchNotice: { from: ComposerIntent; to: ComposerIntent } | null;
  tHome: (key: "composer.progressiveUploadFailed") => string;
  objectiveRef: MutableRefObject<ComposerIntent | null>;
  intentRef: MutableRefObject<ComposerIntent>;
  workIdRef: MutableRefObject<string | null>;
  requestRef: MutableRefObject<string>;
  formatRef: MutableRefObject<Format>;
  targetFormatsRef: MutableRefObject<Format[]>;
  textLayoutRef: MutableRefObject<"top" | "center" | "bottom" | "side">;
  fontAssetKeyRef: MutableRefObject<string | null>;
  directionPoolRef: MutableRefObject<CreativeDirectionPool | null>;
  draftKeyRef: MutableRefObject<string>;
  draftEpochRef: MutableRefObject<number>;
  createInFlightRef: MutableRefObject<Promise<string | null> | null>;
  autosaveBlockedWorkRef: MutableRefObject<string | null>;
  hydratedWorkRef: MutableRefObject<string | null>;
  lastPersistedRef: MutableRefObject<string | null>;
  briefingOverridesRef: MutableRefObject<unknown>;
  briefingVersionRef: MutableRefObject<number | undefined>;
  directionSuggestionRequestedRef: MutableRefObject<string | null>;
  directionTouchedRef: MutableRefObject<boolean>;
  uploadInFlightRef: MutableRefObject<boolean>;
  pendingProtocolTransitionRef: MutableRefObject<((committed: boolean) => void) | null>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  captureSnapshot: () => DraftSnapshot;
  ensureDraft: (source?: DraftSource) => Promise<string | null>;
  flushAutosave: () => Promise<string | null>;
  markPlanInputEdited: () => void;
  exposeIntent: (intent: ComposerIntent) => void;
  exposeWorkId: (workId: string) => void;
  recordStudioEvent: (eventKey: string, properties?: Record<string, string | number | boolean>) => void;
  setObjective: (value: ComposerIntent | null) => void;
  setIntent: (value: ComposerIntent) => void;
  setTargetFormats: (value: Format[]) => void;
  setTextLayout: (value: "top" | "center" | "bottom" | "side") => void;
  setFontAssetKey: (value: string | null) => void;
  setDirectionPool: (value: CreativeDirectionPool | null) => void;
  setQuote: (value: CreativeWorkQuote) => void;
  setWorkId: (value: string | null) => void;
  setRequestState: (value: string) => void;
  setError: (value: string | null) => void;
  setBrandConflict: (value: null) => void;
  setInferredBriefingContext: (value: null) => void;
  setBriefingEditState: (value: "idle") => void;
  setPendingDirectionSuggestions: (value: {
    directions: CreativeDirection[];
    preserveSelection: boolean;
  } | null) => void;
  setDirectionSuggestionState: (value: "idle" | "loading" | "ready" | "error") => void;
  setDirectionSuggestionRetryToken: (value: number | ((current: number) => number)) => void;
  setActionPhase: (value: ComposerActionPhase) => void;
  setProtocolSwitchNotice: (value: { from: ComposerIntent; to: ComposerIntent } | null) => void;
  setPendingProtocolSwitch: (value: ComposerIntent | null) => void;
  setIsUploading: (value: boolean) => void;
  setBufferedFile: (value: File | null) => void;
}) {
  const switchToProtocol = useCallback(async (next: ComposerIntent) => {
    const previous = intentRef.current;
    if (next === previous) return true;

    const currentWorkId = workIdRef.current;
    const currentIsDraft = Boolean(currentWorkId && currentWork?.id === currentWorkId && currentWork.status === "draft");
    const currentHasContext = currentIsDraft && Boolean(currentWork?.request.trim() || sources.length);
    const profileId = currentWork?.clientProfileId ?? activeClientProfileId;
    const reusableSource = reusableSourceForProtocol(previous, next, sources);

    if (currentIsDraft) {
      try {
        setActionPhase("saving");
        await flushAutosave();
      } catch (cause) {
        setActionPhase("idle");
        setError(cause instanceof Error ? cause.message : "Falha ao preservar o rascunho");
        return false;
      }
      if (profileId && currentWorkId) writeStoredDraft(profileId, previous, currentWorkId);
    }

    markPlanInputEdited();
    draftEpochRef.current += 1;
    createInFlightRef.current = null;
    autosaveBlockedWorkRef.current = null;
    hydratedWorkRef.current = null;
    lastPersistedRef.current = null;
    requestRef.current = "";
    setRequestState("");
    setError(null);
    setBrandConflict(null);
    setInferredBriefingContext(null);
    setBriefingEditState("idle");
    briefingOverridesRef.current = undefined;
    briefingVersionRef.current = undefined;
    directionSuggestionRequestedRef.current = null;
    directionTouchedRef.current = false;
    setPendingDirectionSuggestions(null);
    setDirectionSuggestionState("idle");
    setDirectionSuggestionRetryToken(0);
    setActionPhase("idle");
    intentRef.current = next;
    setIntent(next);
    const nextTargets = nextProtocolTargetFormats(next);
    targetFormatsRef.current = nextTargets;
    setTargetFormats(nextTargets);
    textLayoutRef.current = "top";
    fontAssetKeyRef.current = null;
    setTextLayout("top");
    setFontAssetKey(null);
    const nextDirectionPool = nextProtocolDirectionPool(next);
    directionPoolRef.current = nextDirectionPool;
    setDirectionPool(nextDirectionPool);
    setQuote(canonicalQuote(next, formatRef.current, nextTargets, nextDirectionPool ?? undefined));
    const nextWorkId = profileId ? readStoredDraft(profileId, next) : null;
    workIdRef.current = nextWorkId;
    setWorkId(nextWorkId);
    if (nextWorkId) exposeWorkId(nextWorkId);
    else {
      draftKeyRef.current = crypto.randomUUID();
      exposeIntent(next);
      if (reusableSource) await ensureDraft(reusableSource);
    }
    setProtocolSwitchNotice(currentHasContext ? { from: previous, to: next } : null);
    if (next !== "restyle") requestAnimationFrame(() => composerRef.current?.focus());
    return true;
  }, [
    activeClientProfileId,
    autosaveBlockedWorkRef,
    briefingOverridesRef,
    briefingVersionRef,
    composerRef,
    createInFlightRef,
    currentWork,
    directionPoolRef,
    directionSuggestionRequestedRef,
    directionTouchedRef,
    draftEpochRef,
    draftKeyRef,
    ensureDraft,
    exposeIntent,
    exposeWorkId,
    flushAutosave,
    formatRef,
    hydratedWorkRef,
    intentRef,
    lastPersistedRef,
    markPlanInputEdited,
    requestRef,
    setActionPhase,
    setBrandConflict,
    setBriefingEditState,
    setDirectionPool,
    setDirectionSuggestionRetryToken,
    setDirectionSuggestionState,
    setError,
    setFontAssetKey,
    setInferredBriefingContext,
    setIntent,
    setPendingDirectionSuggestions,
    setProtocolSwitchNotice,
    setQuote,
    setRequestState,
    setTargetFormats,
    setTextLayout,
    setWorkId,
    sources,
    targetFormatsRef,
    textLayoutRef,
    fontAssetKeyRef,
    workIdRef,
  ]);

  const selectIntent = useCallback((next: ComposerIntent, awaitTransition = false) => {
    const decision = selectIntentDecision({
      workflowVariant,
      hasObjective: Boolean(objectiveRef.current),
      next,
      current: intentRef.current,
      hasPendingWork: protocolSwitchHasPendingWork({
        isUploading,
        actionPhase,
        sourceMutationPending,
        createMutationPending,
        createInFlight: Boolean(createInFlightRef.current),
        hasUnsavedChanges: lastPersistedRef.current !== null
          && signature(captureSnapshot()) !== lastPersistedRef.current,
      }),
    });

    if (decision === "first_progressive") {
      markPlanInputEdited();
      objectiveRef.current = next;
      setObjective(next);
      intentRef.current = next;
      setIntent(next);
      const nextTargets = nextProtocolTargetFormats(next);
      targetFormatsRef.current = nextTargets;
      setTargetFormats(nextTargets);
      const nextDirectionPool = nextProtocolDirectionPool(next);
      directionPoolRef.current = nextDirectionPool;
      setDirectionPool(nextDirectionPool);
      setQuote(canonicalQuote(next, formatRef.current, nextTargets, nextDirectionPool ?? undefined));
      exposeIntent(next);
      recordStudioEvent("studio_goal_selected", { protocol: next });
      return (async () => {
        if (bufferedFile) {
          uploadInFlightRef.current = true;
          setIsUploading(true);
          try {
            const uploaded = await uploadChatAttachment(bufferedFile);
            const usage = firstProgressiveObjectiveUsage(next);
            if (await ensureDraft({ assetId: uploaded.assetId, usage })) setBufferedFile(null);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : tHome("composer.progressiveUploadFailed"));
          } finally {
            uploadInFlightRef.current = false;
            setIsUploading(false);
          }
        } else if (requestRef.current.trim()) {
          await ensureDraft();
        }
        return true;
      })();
    }
    if (decision === "noop") return Promise.resolve(true);
    if (decision === "defer") {
      setPendingProtocolSwitch(next);
      if (!awaitTransition) return;
      pendingProtocolTransitionRef.current?.(false);
      return new Promise<boolean>((resolve) => {
        pendingProtocolTransitionRef.current = resolve;
      });
    }
    const transition = switchToProtocol(next).then((committed) => {
      if (committed) recordStudioEvent("studio_goal_selected", { protocol: next });
      return committed;
    });
    if (awaitTransition) return transition;
    void transition;
  }, [
    actionPhase,
    bufferedFile,
    captureSnapshot,
    createInFlightRef,
    createMutationPending,
    directionPoolRef,
    ensureDraft,
    exposeIntent,
    formatRef,
    intentRef,
    isUploading,
    lastPersistedRef,
    markPlanInputEdited,
    objectiveRef,
    pendingProtocolTransitionRef,
    recordStudioEvent,
    requestRef,
    setBufferedFile,
    setDirectionPool,
    setError,
    setIntent,
    setIsUploading,
    setObjective,
    setPendingProtocolSwitch,
    setQuote,
    setTargetFormats,
    sourceMutationPending,
    switchToProtocol,
    tHome,
    targetFormatsRef,
    uploadInFlightRef,
    workflowVariant,
  ]);

  const confirmProtocolSwitch = useCallback(() => {
    const next = pendingProtocolSwitch;
    setPendingProtocolSwitch(null);
    const transition = next ? switchToProtocol(next) : Promise.resolve(false);
    void transition.then((committed) => {
      if (committed && next) recordStudioEvent("studio_goal_selected", { protocol: next });
      pendingProtocolTransitionRef.current?.(committed);
      pendingProtocolTransitionRef.current = null;
    });
  }, [pendingProtocolSwitch, pendingProtocolTransitionRef, recordStudioEvent, setPendingProtocolSwitch, switchToProtocol]);

  const cancelProtocolSwitch = useCallback(() => {
    setPendingProtocolSwitch(null);
    pendingProtocolTransitionRef.current?.(false);
    pendingProtocolTransitionRef.current = null;
  }, [pendingProtocolTransitionRef, setPendingProtocolSwitch]);

  const returnToPreviousProtocol = useCallback(() => {
    const previous = protocolSwitchNotice?.from;
    if (!previous) return;
    void switchToProtocol(previous).then((committed) => {
      if (committed) recordStudioEvent("studio_goal_selected", { protocol: previous });
    });
  }, [protocolSwitchNotice, recordStudioEvent, switchToProtocol]);

  return {
    selectIntent,
    confirmProtocolSwitch,
    cancelProtocolSwitch,
    returnToPreviousProtocol,
  };
}
