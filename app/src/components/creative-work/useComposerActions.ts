"use client";

import { useCallback, type RefObject } from "react";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";
import { useComposerAnnouncements } from "./useComposerAnnouncements";
import { useComposerAutosave } from "./useComposerAutosave";
import { useComposerBrandConflict } from "./useComposerBrandConflict";
import { useComposerBriefing } from "./useComposerBriefing";
import { useComposerDirectionSuggestions } from "./useComposerDirectionSuggestions";
import { useComposerOutputActions } from "./useComposerOutputActions";
import { useComposerPersistence } from "./useComposerPersistence";
import { useComposerPlanActions } from "./useComposerPlanActions";
import { useComposerProtocolActions } from "./useComposerProtocolActions";
import { useComposerSourceActions } from "./useComposerSourceActions";
import { useComposerTemplateAttach } from "./useComposerTemplateAttach";
import { useComposerWorkMutations } from "./useComposerWorkMutations";
import type { useComposerQueries } from "./useComposerQueries";
import type { useComposerSessionState } from "./useComposerSessionState";

type Session = ReturnType<typeof useComposerSessionState>;
type Queries = ReturnType<typeof useComposerQueries>;

export function useComposerActions({
  session,
  queries,
  workflowVariant,
  initialWorkId,
  initialTemplateId,
  focusComposer,
  studioSessionId,
  activeClientProfileId,
  isLoadingProfile,
  exposeWorkId,
  exposeIntent,
  exposeCampaignId,
  consumeInitialTemplateParams,
  recordStudioEvent,
  recordCanonicalEvent,
  tHome,
  tResults,
}: {
  session: Session;
  queries: Queries;
  workflowVariant: StudioRolloutVariant;
  initialWorkId?: string;
  initialTemplateId?: string;
  focusComposer: boolean;
  studioSessionId?: string;
  activeClientProfileId: string | null;
  isLoadingProfile: boolean;
  exposeWorkId: (workId: string) => void;
  exposeIntent: (intent: Session["intent"]) => void;
  exposeCampaignId: (campaignId: string | null) => void;
  consumeInitialTemplateParams: () => void;
  recordStudioEvent: (eventKey: string, properties?: Record<string, string | number | boolean>) => void;
  recordCanonicalEvent: (eventKey: string, creativeWorkId: string, properties?: Record<string, string | number | boolean>) => void;
  tHome: (key: string, values?: { name: string }) => string;
  tResults: (key: string) => string;
}) {
  const {
    workIdRef, pendingCampaignIdRef, setPendingCampaignId, setAnnouncement, setError,
    objectiveRef, intentRef, draftKeyRef, draftEpochRef, createInFlightRef, lastPersistedRef,
    autosaveBlockedWorkRef, hydratedWorkRef, saveChainRef, persistOnUnmountRef, mountedRef,
    lifecycleRef, captureSnapshot, setWorkId, setQuote, composerRef, didFocusComposerRef,
    focusFrameRef, objective, requestRef, directionPool, fontAssetKey, format, formatMode,
    intent, request, targetFormats, textLayout, markPlanInputEdited, setRequestState,
    setInferredBriefingContext, setBriefingEditState, briefingOverridesRef, briefingVersionRef,
    inferredBriefing, bufferedFile, isUploading, actionPhase, pendingProtocolSwitch,
    protocolSwitchNotice, formatRef, targetFormatsRef, textLayoutRef, fontAssetKeyRef,
    directionPoolRef, directionSuggestionRequestedRef, directionTouchedRef, uploadInFlightRef,
    pendingProtocolTransitionRef, setObjective, setIntent, setTargetFormats, setTextLayout,
    setFontAssetKey, setDirectionPool, setPendingDirectionSuggestions, setDirectionSuggestionState,
    setDirectionSuggestionRetryToken, setActionPhase, setProtocolSwitchNotice,
    setPendingProtocolSwitch, setIsUploading, setBufferedFile, workId, directionSuggestionRetryToken,
    failedInitialTemplateId, templateRetryToken, autoTemplateRef, setFailedInitialTemplateId,
    setTemplateRetryToken, submitGuardRef, preparedPlanInputRef, setPreparedPlanInput,
    planInputEditEpochRef, invalidatedPlanRevision, setBrandConflict, setBrandTrainingSuggestion,
    setFormat, setPreparedPlanCycle, brandConflict, revisionAttemptsRef, setApprovalErrorOutputId,
    briefingEditState,
  } = session;

  const { linkCampaign, mutateSource } = useComposerWorkMutations({
    workIdRef: workIdRef,
    pendingCampaignIdRef: pendingCampaignIdRef,
    exposeCampaignId,
    setPendingCampaignId: setPendingCampaignId,
    setAnnouncement: setAnnouncement,
    setError: setError,
    tHome: (key) => tHome(key),
    detailQuery: queries.detailQuery,
    linkCampaignMutation: queries.linkCampaignMutation,
    sourceMutation: queries.sourceMutation,
    resolveCanonicalWorkRevision: queries.resolveCanonicalWorkRevision,
    refreshCanonicalWorkRevision: queries.refreshCanonicalWorkRevision,
    blockStaleRevision: queries.blockStaleRevision,
  });

  const { ensureDraft, persistSnapshot, flushAutosave } = useComposerPersistence({
    workflowVariant,
    initialWorkId,
    activeClientProfileId,
    objectiveRef: objectiveRef,
    intentRef: intentRef,
    workIdRef: workIdRef,
    draftKeyRef: draftKeyRef,
    draftEpochRef: draftEpochRef,
    createInFlightRef: createInFlightRef,
    lastPersistedRef: lastPersistedRef,
    autosaveBlockedWorkRef: autosaveBlockedWorkRef,
    hydratedWorkRef: hydratedWorkRef,
    pendingCampaignIdRef: pendingCampaignIdRef,
    saveChainRef: saveChainRef,
    persistOnUnmountRef: persistOnUnmountRef,
    mountedRef: mountedRef,
    lifecycleRef: lifecycleRef,
    captureSnapshot: captureSnapshot,
    createMutation: queries.createMutation,
    autosaveMutation: queries.autosaveMutation,
    carouselDraft: queries.detailQuery.data?.work.settings.carouselDraft,
    mutateSource,
    linkCampaign,
    recordCanonicalEvent,
    setCanonicalWorkRevision: queries.setCanonicalWorkRevision,
    refreshCanonicalWorkRevision: queries.refreshCanonicalWorkRevision,
    resolveCanonicalWorkRevision: queries.resolveCanonicalWorkRevision,
    blockStaleRevision: queries.blockStaleRevision,
    markRevisionUnavailable: queries.markRevisionUnavailable,
    isRevisionUnavailable: queries.isRevisionUnavailable,
    exposeWorkId,
    setWorkId: setWorkId,
    setQuote: setQuote,
    setAnnouncement: setAnnouncement,
    setError: setError,
    workStatus: queries.detailQuery.data?.work.status,
    currentWorkId: queries.detailQuery.data?.work.id,
    outputCount: queries.detailQuery.data?.outputs.length ?? 0,
  });

  const { announce } = useComposerAnnouncements({
    mountedRef: mountedRef,
    composerRef: composerRef as RefObject<HTMLTextAreaElement | null>,
    focusComposer,
    didFocusComposerRef: didFocusComposerRef,
    focusFrameRef: focusFrameRef,
    setAnnouncement: setAnnouncement,
  });

  useComposerAutosave({
    workflowVariant,
    objective: objective,
    initialWorkId,
    hydratedWorkRef: hydratedWorkRef,
    workIdRef: workIdRef,
    autosaveBlockedWorkRef: autosaveBlockedWorkRef,
    activeClientProfileId,
    requestRef: requestRef,
    captureSnapshot: captureSnapshot,
    ensureDraft,
    persistSnapshot,
    setError: setError,
    directionPool: directionPool,
    fontAssetKey: fontAssetKey,
    format: format,
    formatMode: formatMode,
    intent: intent,
    request: request,
    targetFormats: targetFormats,
    textLayout: textLayout,
    currentWork: queries.detailQuery.data?.work,
  });

  const setRequest = useCallback((value: string) => {
    markPlanInputEdited();
    requestRef.current = value;
    setRequestState(value);
    setInferredBriefingContext(null);
    setBriefingEditState("idle");
  }, [markPlanInputEdited, requestRef, setBriefingEditState, setInferredBriefingContext, setRequestState]);

  const { editBriefingField } = useComposerBriefing({
    workIdRef: workIdRef,
    intentRef: intentRef,
    briefingOverridesRef: briefingOverridesRef,
    briefingVersionRef: briefingVersionRef,
    inferredBriefing: inferredBriefing,
    currentWork: queries.detailQuery.data?.work,
    editBriefingMutation: queries.editBriefingMutation,
    markPlanInputEdited: markPlanInputEdited,
    setBriefingEditState: setBriefingEditState,
    setInferredBriefingContext: setInferredBriefingContext,
    setAnnouncement: setAnnouncement,
    setError: setError,
  });

  const {
    selectIntent,
    confirmProtocolSwitch,
    cancelProtocolSwitch,
    returnToPreviousProtocol,
  } = useComposerProtocolActions({
    workflowVariant,
    activeClientProfileId,
    currentWork: queries.detailQuery.data?.work,
    sources: queries.detailQuery.data?.sources ?? [],
    bufferedFile: bufferedFile,
    isUploading: isUploading,
    actionPhase: actionPhase,
    sourceMutationPending: queries.sourceMutation.isPending,
    createMutationPending: queries.createMutation.isPending,
    pendingProtocolSwitch: pendingProtocolSwitch,
    protocolSwitchNotice: protocolSwitchNotice,
    tHome: (key) => tHome(key),
    objectiveRef: objectiveRef,
    intentRef: intentRef,
    workIdRef: workIdRef,
    requestRef: requestRef,
    formatRef: formatRef,
    targetFormatsRef: targetFormatsRef,
    textLayoutRef: textLayoutRef,
    fontAssetKeyRef: fontAssetKeyRef,
    directionPoolRef: directionPoolRef,
    draftKeyRef: draftKeyRef,
    draftEpochRef: draftEpochRef,
    createInFlightRef: createInFlightRef,
    autosaveBlockedWorkRef: autosaveBlockedWorkRef,
    hydratedWorkRef: hydratedWorkRef,
    lastPersistedRef: lastPersistedRef,
    briefingOverridesRef: briefingOverridesRef,
    briefingVersionRef: briefingVersionRef,
    directionSuggestionRequestedRef: directionSuggestionRequestedRef,
    directionTouchedRef: directionTouchedRef,
    uploadInFlightRef: uploadInFlightRef,
    pendingProtocolTransitionRef: pendingProtocolTransitionRef,
    composerRef: composerRef as RefObject<HTMLTextAreaElement | null>,
    captureSnapshot: captureSnapshot,
    ensureDraft,
    flushAutosave,
    markPlanInputEdited: markPlanInputEdited,
    exposeIntent,
    exposeWorkId,
    recordStudioEvent,
    setObjective: setObjective,
    setIntent: setIntent,
    setTargetFormats: setTargetFormats,
    setTextLayout: setTextLayout,
    setFontAssetKey: setFontAssetKey,
    setDirectionPool: setDirectionPool,
    setQuote: setQuote,
    setWorkId: setWorkId,
    setRequestState: setRequestState,
    setError: setError,
    setBrandConflict: setBrandConflict,
    setInferredBriefingContext: setInferredBriefingContext,
    setBriefingEditState: setBriefingEditState,
    setPendingDirectionSuggestions: setPendingDirectionSuggestions,
    setDirectionSuggestionState: setDirectionSuggestionState,
    setDirectionSuggestionRetryToken: setDirectionSuggestionRetryToken,
    setActionPhase: setActionPhase,
    setProtocolSwitchNotice: setProtocolSwitchNotice,
    setPendingProtocolSwitch: setPendingProtocolSwitch,
    setIsUploading: setIsUploading,
    setBufferedFile: setBufferedFile,
  });

  const {
    toggleDirection,
    setManualDirectionInstruction,
    applyDirectionSuggestions,
    requestDirectionSuggestions,
    keepCurrentDirections,
  } = useComposerDirectionSuggestions({
    intent: intent,
    workId: workId,
    workStatus: queries.detailQuery.data?.work.status,
    sources: queries.detailQuery.data?.sources ?? [],
    hasPersistedAiSuggestions: Boolean(
      queries.detailQuery.data?.work.settings.directionPool?.directions.some(
        (direction) => direction.provenance === "ai-suggestion",
      ),
    ),
    directionSuggestionRetryToken: directionSuggestionRetryToken,
    intentRef: intentRef,
    formatRef: formatRef,
    targetFormatsRef: targetFormatsRef,
    directionPoolRef: directionPoolRef,
    directionTouchedRef: directionTouchedRef,
    directionSuggestionRequestedRef: directionSuggestionRequestedRef,
    markPlanInputEdited: markPlanInputEdited,
    suggestDirections: (id) => queries.suggestDirectionMutation.mutateAsync(id),
    setDirectionPool: setDirectionPool,
    setQuote: setQuote,
    setPendingDirectionSuggestions: setPendingDirectionSuggestions,
    setDirectionSuggestionState: setDirectionSuggestionState,
    setDirectionSuggestionRetryToken: setDirectionSuggestionRetryToken,
  });

  const {
    addFiles,
    attachDraftSource,
    addInspiration,
    updateSource,
    editSource,
    retrySource,
    removeSource,
    updatePieceReference,
    replacePieceReference,
    promotePieceReference,
  } = useComposerSourceActions({
    workflowVariant,
    objectiveRef: objectiveRef,
    intentRef: intentRef,
    workIdRef: workIdRef,
    uploadInFlightRef: uploadInFlightRef,
    composerRef: composerRef as RefObject<HTMLTextAreaElement | null>,
    sources: queries.detailQuery.data?.sources,
    activeClientProfileId,
    tHome: (key, values) => tHome(key, values),
    announce,
    markPlanInputEdited: markPlanInputEdited,
    setBufferedFile: setBufferedFile,
    setIsUploading: setIsUploading,
    setError: setError,
    setAnnouncement: setAnnouncement,
    setInferredBriefingContext: () => setInferredBriefingContext(null),
    ensureDraft,
    mutateSource,
    selectIntent: async (next, immediate) => Boolean(await selectIntent(next, immediate)),
    recordStudioEvent,
  });

  const { retryInitialTemplate } = useComposerTemplateAttach({
    workflowVariant,
    objective: objective,
    initialTemplateId,
    initialWorkId,
    failedInitialTemplateId: failedInitialTemplateId,
    templateRetryToken: templateRetryToken,
    activeClientProfileId,
    isLoadingProfile,
    sources: queries.detailQuery.data?.sources,
    hydratedWorkRef: hydratedWorkRef,
    workIdRef: workIdRef,
    autoTemplateRef: autoTemplateRef,
    mountedRef: mountedRef,
    attachDraftSource,
    consumeInitialTemplateParams,
    setFailedInitialTemplateId: setFailedInitialTemplateId,
    setAnnouncement: setAnnouncement,
    setError: setError,
    setTemplateRetryToken: setTemplateRetryToken,
  });

  const submissionBlocked = useCallback(() => submitGuardRef.current
    || queries.generateMutation.isPending
    || queries.editBriefingMutation.isPending
    || briefingEditState === "saving"
    || inferredBriefing?.readiness === "blocked"
    || queries.sourceMutation.isPending
    || isUploading
    || uploadInFlightRef.current, [
    briefingEditState,
    inferredBriefing,
    isUploading,
    queries.editBriefingMutation.isPending,
    queries.generateMutation.isPending,
    queries.sourceMutation.isPending,
    submitGuardRef,
    uploadInFlightRef,
  ]);

  const { preparePlan, confirmGeneration, generateLegacy } = useComposerPlanActions({
    workIdRef: workIdRef,
    intentRef: intentRef,
    requestRef: requestRef,
    submitGuardRef: submitGuardRef,
    preparedPlanInputRef: preparedPlanInputRef,
    setPreparedPlanInput: setPreparedPlanInput,
    planInputEditEpochRef: planInputEditEpochRef,
    lastPersistedRef: lastPersistedRef,
    detailQuery: queries.detailQuery,
    invalidatedPlanRevision: invalidatedPlanRevision,
    captureSnapshot: captureSnapshot,
    flushAutosave,
    prepareMutation: queries.prepareMutation,
    generateMutation: queries.generateMutation,
    setCanonicalWorkRevision: queries.setCanonicalWorkRevision,
    setActionPhase: setActionPhase,
    setError: setError,
    setBrandConflict: setBrandConflict,
    setBrandTrainingSuggestion: setBrandTrainingSuggestion,
    setAnnouncement: setAnnouncement,
    setInferredBriefingContext: setInferredBriefingContext,
    setFormat: setFormat,
    formatRef: formatRef,
    setQuote: setQuote,
    setPreparedPlanCycle: setPreparedPlanCycle,
    recordCanonicalEvent,
    recordStudioEvent,
    tHome: (key) => tHome(key),
    studioSessionId,
    workflowVariant,
    submissionBlocked,
  });

  const { resolveBrandConflict } = useComposerBrandConflict({
    workIdRef: workIdRef,
    brandConflict: brandConflict,
    workflowVariant,
    resolvePending: queries.resolveBrandConflictMutation.isPending,
    resolveBrandConflictMutation: queries.resolveBrandConflictMutation,
    resolveCanonicalWorkRevision: queries.resolveCanonicalWorkRevision,
    setCanonicalWorkRevision: queries.setCanonicalWorkRevision,
    refreshCanonicalWorkRevision: queries.refreshCanonicalWorkRevision,
    blockStaleRevision: queries.blockStaleRevision,
    preparePlan,
    confirmGeneration,
    setBrandConflict: setBrandConflict,
    setAnnouncement: setAnnouncement,
    setError: setError,
  });

  const { retryOutput, layerizeOutput, approveOutput, reviseOutput, retryRevisionOutput } = useComposerOutputActions({
    workIdRef: workIdRef,
    revisionAttemptsRef: revisionAttemptsRef,
    retryOutputMutation: queries.retryOutputMutation,
    layerizeOutputMutation: queries.layerizeOutputMutation,
    selectOutputMutation: queries.selectOutputMutation,
    reviseOutputMutation: queries.reviseOutputMutation,
    toolKind: queries.detailQuery.data?.work.toolKind,
    tResults,
    setError: setError,
    setAnnouncement: setAnnouncement,
    setApprovalErrorOutputId: setApprovalErrorOutputId,
    recordCanonicalEvent,
    recordStudioEvent,
  });

  return {
    linkCampaign,
    setRequest,
    editBriefingField,
    selectIntent,
    confirmProtocolSwitch,
    cancelProtocolSwitch,
    returnToPreviousProtocol,
    toggleDirection,
    setManualDirectionInstruction,
    applyDirectionSuggestions,
    requestDirectionSuggestions,
    keepCurrentDirections,
    addFiles,
    addInspiration,
    updateSource,
    editSource,
    retrySource,
    removeSource,
    updatePieceReference,
    replacePieceReference,
    promotePieceReference,
    retryInitialTemplate,
    preparePlan,
    confirmGeneration,
    generateLegacy,
    resolveBrandConflict,
    retryOutput,
    layerizeOutput,
    approveOutput,
    reviseOutput,
    retryRevisionOutput,
  };
}
