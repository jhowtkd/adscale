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
  const { linkCampaign, mutateSource } = useComposerWorkMutations({
    workIdRef: session.workIdRef,
    pendingCampaignIdRef: session.pendingCampaignIdRef,
    exposeCampaignId,
    setPendingCampaignId: session.setPendingCampaignId,
    setAnnouncement: session.setAnnouncement,
    setError: session.setError,
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
    objectiveRef: session.objectiveRef,
    intentRef: session.intentRef,
    workIdRef: session.workIdRef,
    draftKeyRef: session.draftKeyRef,
    draftEpochRef: session.draftEpochRef,
    createInFlightRef: session.createInFlightRef,
    lastPersistedRef: session.lastPersistedRef,
    autosaveBlockedWorkRef: session.autosaveBlockedWorkRef,
    hydratedWorkRef: session.hydratedWorkRef,
    pendingCampaignIdRef: session.pendingCampaignIdRef,
    saveChainRef: session.saveChainRef,
    persistOnUnmountRef: session.persistOnUnmountRef,
    mountedRef: session.mountedRef,
    lifecycleRef: session.lifecycleRef,
    captureSnapshot: session.captureSnapshot,
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
    setWorkId: session.setWorkId,
    setQuote: session.setQuote,
    setAnnouncement: session.setAnnouncement,
    setError: session.setError,
    workStatus: queries.detailQuery.data?.work.status,
    currentWorkId: queries.detailQuery.data?.work.id,
    outputCount: queries.detailQuery.data?.outputs.length ?? 0,
  });

  const { announce } = useComposerAnnouncements({
    mountedRef: session.mountedRef,
    composerRef: session.composerRef as RefObject<HTMLTextAreaElement | null>,
    focusComposer,
    didFocusComposerRef: session.didFocusComposerRef,
    focusFrameRef: session.focusFrameRef,
    setAnnouncement: session.setAnnouncement,
  });

  useComposerAutosave({
    workflowVariant,
    objective: session.objective,
    initialWorkId,
    hydratedWorkRef: session.hydratedWorkRef,
    workIdRef: session.workIdRef,
    autosaveBlockedWorkRef: session.autosaveBlockedWorkRef,
    activeClientProfileId,
    requestRef: session.requestRef,
    captureSnapshot: session.captureSnapshot,
    ensureDraft,
    persistSnapshot,
    setError: session.setError,
    directionPool: session.directionPool,
    fontAssetKey: session.fontAssetKey,
    format: session.format,
    formatMode: session.formatMode,
    intent: session.intent,
    request: session.request,
    targetFormats: session.targetFormats,
    textLayout: session.textLayout,
    currentWork: queries.detailQuery.data?.work,
  });

  const setRequest = useCallback((value: string) => {
    session.markPlanInputEdited();
    session.requestRef.current = value;
    session.setRequestState(value);
    session.setInferredBriefingContext(null);
    session.setBriefingEditState("idle");
  }, [session]);

  const { editBriefingField } = useComposerBriefing({
    workIdRef: session.workIdRef,
    intentRef: session.intentRef,
    briefingOverridesRef: session.briefingOverridesRef,
    briefingVersionRef: session.briefingVersionRef,
    inferredBriefing: session.inferredBriefing,
    currentWork: queries.detailQuery.data?.work,
    editBriefingMutation: queries.editBriefingMutation,
    markPlanInputEdited: session.markPlanInputEdited,
    setBriefingEditState: session.setBriefingEditState,
    setInferredBriefingContext: session.setInferredBriefingContext,
    setAnnouncement: session.setAnnouncement,
    setError: session.setError,
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
    bufferedFile: session.bufferedFile,
    isUploading: session.isUploading,
    actionPhase: session.actionPhase,
    sourceMutationPending: queries.sourceMutation.isPending,
    createMutationPending: queries.createMutation.isPending,
    pendingProtocolSwitch: session.pendingProtocolSwitch,
    protocolSwitchNotice: session.protocolSwitchNotice,
    tHome: (key) => tHome(key),
    objectiveRef: session.objectiveRef,
    intentRef: session.intentRef,
    workIdRef: session.workIdRef,
    requestRef: session.requestRef,
    formatRef: session.formatRef,
    targetFormatsRef: session.targetFormatsRef,
    textLayoutRef: session.textLayoutRef,
    fontAssetKeyRef: session.fontAssetKeyRef,
    directionPoolRef: session.directionPoolRef,
    draftKeyRef: session.draftKeyRef,
    draftEpochRef: session.draftEpochRef,
    createInFlightRef: session.createInFlightRef,
    autosaveBlockedWorkRef: session.autosaveBlockedWorkRef,
    hydratedWorkRef: session.hydratedWorkRef,
    lastPersistedRef: session.lastPersistedRef,
    briefingOverridesRef: session.briefingOverridesRef,
    briefingVersionRef: session.briefingVersionRef,
    directionSuggestionRequestedRef: session.directionSuggestionRequestedRef,
    directionTouchedRef: session.directionTouchedRef,
    uploadInFlightRef: session.uploadInFlightRef,
    pendingProtocolTransitionRef: session.pendingProtocolTransitionRef,
    composerRef: session.composerRef as RefObject<HTMLTextAreaElement | null>,
    captureSnapshot: session.captureSnapshot,
    ensureDraft,
    flushAutosave,
    markPlanInputEdited: session.markPlanInputEdited,
    exposeIntent,
    exposeWorkId,
    recordStudioEvent,
    setObjective: session.setObjective,
    setIntent: session.setIntent,
    setTargetFormats: session.setTargetFormats,
    setTextLayout: session.setTextLayout,
    setFontAssetKey: session.setFontAssetKey,
    setDirectionPool: session.setDirectionPool,
    setQuote: session.setQuote,
    setWorkId: session.setWorkId,
    setRequestState: session.setRequestState,
    setError: session.setError,
    setBrandConflict: session.setBrandConflict,
    setInferredBriefingContext: session.setInferredBriefingContext,
    setBriefingEditState: session.setBriefingEditState,
    setPendingDirectionSuggestions: session.setPendingDirectionSuggestions,
    setDirectionSuggestionState: session.setDirectionSuggestionState,
    setDirectionSuggestionRetryToken: session.setDirectionSuggestionRetryToken,
    setActionPhase: session.setActionPhase,
    setProtocolSwitchNotice: session.setProtocolSwitchNotice,
    setPendingProtocolSwitch: session.setPendingProtocolSwitch,
    setIsUploading: session.setIsUploading,
    setBufferedFile: session.setBufferedFile,
  });

  const {
    toggleDirection,
    setManualDirectionInstruction,
    applyDirectionSuggestions,
    requestDirectionSuggestions,
    keepCurrentDirections,
  } = useComposerDirectionSuggestions({
    intent: session.intent,
    workId: session.workId,
    workStatus: queries.detailQuery.data?.work.status,
    sources: queries.detailQuery.data?.sources ?? [],
    hasPersistedAiSuggestions: Boolean(
      queries.detailQuery.data?.work.settings.directionPool?.directions.some(
        (direction) => direction.provenance === "ai-suggestion",
      ),
    ),
    directionSuggestionRetryToken: session.directionSuggestionRetryToken,
    intentRef: session.intentRef,
    formatRef: session.formatRef,
    targetFormatsRef: session.targetFormatsRef,
    directionPoolRef: session.directionPoolRef,
    directionTouchedRef: session.directionTouchedRef,
    directionSuggestionRequestedRef: session.directionSuggestionRequestedRef,
    markPlanInputEdited: session.markPlanInputEdited,
    suggestDirections: (id) => queries.suggestDirectionMutation.mutateAsync(id),
    setDirectionPool: session.setDirectionPool,
    setQuote: session.setQuote,
    setPendingDirectionSuggestions: session.setPendingDirectionSuggestions,
    setDirectionSuggestionState: session.setDirectionSuggestionState,
    setDirectionSuggestionRetryToken: session.setDirectionSuggestionRetryToken,
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
    objectiveRef: session.objectiveRef,
    intentRef: session.intentRef,
    workIdRef: session.workIdRef,
    uploadInFlightRef: session.uploadInFlightRef,
    composerRef: session.composerRef as RefObject<HTMLTextAreaElement | null>,
    sources: queries.detailQuery.data?.sources,
    activeClientProfileId,
    tHome: (key, values) => tHome(key, values),
    announce,
    markPlanInputEdited: session.markPlanInputEdited,
    setBufferedFile: session.setBufferedFile,
    setIsUploading: session.setIsUploading,
    setError: session.setError,
    setAnnouncement: session.setAnnouncement,
    setInferredBriefingContext: () => session.setInferredBriefingContext(null),
    ensureDraft,
    mutateSource,
    selectIntent: async (next, immediate) => Boolean(await selectIntent(next, immediate)),
    recordStudioEvent,
  });

  const { retryInitialTemplate } = useComposerTemplateAttach({
    workflowVariant,
    objective: session.objective,
    initialTemplateId,
    initialWorkId,
    failedInitialTemplateId: session.failedInitialTemplateId,
    templateRetryToken: session.templateRetryToken,
    activeClientProfileId,
    isLoadingProfile,
    sources: queries.detailQuery.data?.sources,
    hydratedWorkRef: session.hydratedWorkRef,
    workIdRef: session.workIdRef,
    autoTemplateRef: session.autoTemplateRef,
    mountedRef: session.mountedRef,
    attachDraftSource,
    consumeInitialTemplateParams,
    setFailedInitialTemplateId: session.setFailedInitialTemplateId,
    setAnnouncement: session.setAnnouncement,
    setError: session.setError,
    setTemplateRetryToken: session.setTemplateRetryToken,
  });

  const submissionBlocked = useCallback(() => session.submitGuardRef.current
    || queries.generateMutation.isPending
    || queries.editBriefingMutation.isPending
    || session.briefingEditState === "saving"
    || session.inferredBriefing?.readiness === "blocked"
    || queries.sourceMutation.isPending
    || session.isUploading
    || session.uploadInFlightRef.current, [queries.editBriefingMutation.isPending, queries.generateMutation.isPending, queries.sourceMutation.isPending, session]);

  const { preparePlan, confirmGeneration, generateLegacy } = useComposerPlanActions({
    workIdRef: session.workIdRef,
    intentRef: session.intentRef,
    requestRef: session.requestRef,
    submitGuardRef: session.submitGuardRef,
    preparedPlanInputRef: session.preparedPlanInputRef,
    planInputEditEpochRef: session.planInputEditEpochRef,
    lastPersistedRef: session.lastPersistedRef,
    detailQuery: queries.detailQuery,
    invalidatedPlanRevision: session.invalidatedPlanRevision,
    captureSnapshot: session.captureSnapshot,
    flushAutosave,
    prepareMutation: queries.prepareMutation,
    generateMutation: queries.generateMutation,
    setCanonicalWorkRevision: queries.setCanonicalWorkRevision,
    setActionPhase: session.setActionPhase,
    setError: session.setError,
    setBrandConflict: session.setBrandConflict,
    setBrandTrainingSuggestion: session.setBrandTrainingSuggestion,
    setAnnouncement: session.setAnnouncement,
    setInferredBriefingContext: session.setInferredBriefingContext,
    setFormat: session.setFormat,
    formatRef: session.formatRef,
    setQuote: session.setQuote,
    setPreparedPlanCycle: session.setPreparedPlanCycle,
    recordCanonicalEvent,
    recordStudioEvent,
    tHome: (key) => tHome(key),
    studioSessionId,
    workflowVariant,
    submissionBlocked,
  });

  const { resolveBrandConflict } = useComposerBrandConflict({
    workIdRef: session.workIdRef,
    brandConflict: session.brandConflict,
    workflowVariant,
    resolvePending: queries.resolveBrandConflictMutation.isPending,
    resolveBrandConflictMutation: queries.resolveBrandConflictMutation,
    resolveCanonicalWorkRevision: queries.resolveCanonicalWorkRevision,
    setCanonicalWorkRevision: queries.setCanonicalWorkRevision,
    refreshCanonicalWorkRevision: queries.refreshCanonicalWorkRevision,
    blockStaleRevision: queries.blockStaleRevision,
    preparePlan,
    confirmGeneration,
    setBrandConflict: session.setBrandConflict,
    setAnnouncement: session.setAnnouncement,
    setError: session.setError,
  });

  const { retryOutput, layerizeOutput, approveOutput, reviseOutput, retryRevisionOutput } = useComposerOutputActions({
    workIdRef: session.workIdRef,
    revisionAttemptsRef: session.revisionAttemptsRef,
    retryOutputMutation: queries.retryOutputMutation,
    layerizeOutputMutation: queries.layerizeOutputMutation,
    selectOutputMutation: queries.selectOutputMutation,
    reviseOutputMutation: queries.reviseOutputMutation,
    toolKind: queries.detailQuery.data?.work.toolKind,
    tResults,
    setError: session.setError,
    setAnnouncement: session.setAnnouncement,
    setApprovalErrorOutputId: session.setApprovalErrorOutputId,
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
