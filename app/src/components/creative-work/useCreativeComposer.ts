"use client";

import { useEffect, useMemo, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import type { CreativeWorkItem } from "@/lib/hooks/use-creative-work";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";
import {
  projectComposerBusyState,
  projectComposerGenerateGate,
  projectComposerStage,
  projectVisibleComposerStage,
  projectVisiblePreparedPlan,
  readStoredDraft,
  signature,
  type ComposerActionPhase,
  type ComposerIntent,
  type ComposerStage,
  type ComposerState,
} from "./composer-state";
import { useComposerHydration } from "./useComposerHydration";
import { useComposerLocation } from "./useComposerLocation";
import { useComposerFormatControls } from "./useComposerFormatControls";
import { useComposerFieldRefs } from "./useComposerFieldRefs";
import { useComposerPlanSync } from "./useComposerPlanSync";
import { useComposerTelemetry } from "./useComposerTelemetry";
import { useComposerSessionState } from "./useComposerSessionState";
import { useComposerQueries } from "./useComposerQueries";
import { useComposerActions } from "./useComposerActions";
import {
  composerAnalyzingOrFailedSources,
  composerHasMeaningfulInput,
  composerSinglePieceReferenceBlocked,
  isRevisingOutputBusy,
  persistedBrandTrainingSuggestion as projectPersistedBrandTrainingSuggestion,
  projectComposerBrandIdentity,
} from "./composer-view";
import {
  useCarouselComposer,
  type CarouselComposerInput,
} from "./useCarouselComposer";
import { offeredStudioFormats } from "@/lib/studio/three-four-capability";

export type { ComposerActionPhase, ComposerIntent, ComposerStage, ComposerState };
export { projectComposerStage };

type Format = CreativeWorkItem["format"];

export function useCreativeComposer({
  initialWorkId,
  initialIntent,
  workspaceId,
  workflowVariant = "control",
  studioSessionId,
  focusComposer = false,
  initialTemplateId,
  initialCampaignId,
  freshEntry = false,
  threeFourCreationEnabled = false,
  onGenerationAccepted,
}: {
  initialWorkId?: string;
  initialIntent?: ComposerIntent;
  workspaceId?: string;
  workflowVariant?: StudioRolloutVariant;
  studioSessionId?: string;
  focusComposer?: boolean;
  initialTemplateId?: string;
  initialCampaignId?: string;
  /** A canonical Studio entry that intentionally starts without draft resume. */
  freshEntry?: boolean;
  /** Server-derived 3:4 creation switch (ICE-04B); the protocol map applies on top. */
  threeFourCreationEnabled?: boolean;
  onGenerationAccepted?: () => void;
} = {}) {
  const tHome = useTranslations("dashboard.home");
  const tResults = useTranslations("dashboard.home.composer.results");
  const active = useActiveClientProfile();
  const internalInitialIntent: ComposerIntent = initialIntent ?? "variations";
  const progressivePlainEntry = workflowVariant === "progressive" && !initialWorkId && !initialIntent;
  const progressiveResume = workflowVariant === "progressive" && Boolean(initialWorkId) && !initialIntent;
  const initialObjective = progressivePlainEntry || progressiveResume ? null : internalInitialIntent;
  const initialTargetFormats: Format[] = internalInitialIntent === "format_adaptation"
    ? ["1:1", "9:16"]
    : [];

  const session = useComposerSessionState({
    initialWorkId,
    initialCampaignId,
    internalInitialIntent,
    initialObjective,
    initialTargetFormats,
  });
  const {
    workId, setWorkId, pendingCampaignId, setPendingCampaignId, request, setRequestState,
    invalidatedPlanRevision, setInvalidatedPlanRevision, intent, setIntent, objective, setObjective,
    bufferedFile, setBufferedFile, format, setFormat, formatMode, setFormatMode,
    targetFormats, setTargetFormats, textLayout, setTextLayout, fontAssetKey, setFontAssetKey,
    directionPool, setDirectionPool, quote, setQuote, setInferredBriefingContext,
    inferredBriefing, briefingFactPack, briefingEditState, setBriefingEditState,
    directionSuggestionState, setDirectionSuggestionState, pendingDirectionSuggestions, setPendingDirectionSuggestions,
    directionSuggestionRetryToken, setDirectionSuggestionRetryToken, isUploading, setIsUploading,
    uploadInFlightRef, actionPhase, setActionPhase, preparedPlanCycle, setPreparedPlanCycle,
    error, setError, approvalErrorOutputId, setApprovalErrorOutputId, brandConflict, setBrandConflict,
    announcement, setAnnouncement, pendingProtocolSwitch, setPendingProtocolSwitch,
    protocolSwitchNotice, setProtocolSwitchNotice, brandTrainingSuggestion, setBrandTrainingSuggestion,
    failedInitialTemplateId, setFailedInitialTemplateId, templateRetryToken, setTemplateRetryToken,
    composerRef, draftKeyRef, workIdRef, pendingCampaignIdRef, requestRef, intentRef, objectiveRef,
    formatRef, targetFormatsRef, textLayoutRef, fontAssetKeyRef, directionPoolRef, formatModeRef,
    briefingOverridesRef, briefingVersionRef, hydratedWorkRef, lastPersistedRef, createInFlightRef,
    draftEpochRef, saveChainRef, directionSuggestionRequestedRef, directionTouchedRef,
    autosaveBlockedWorkRef, didFocusComposerRef, focusFrameRef, autoTemplateRef, mountedRef,
    restoredProfileRef, lifecycleRef, persistOnUnmountRef, revisionAttemptsRef,
    pendingProtocolTransitionRef, planInputEditEpochRef, preparedPlanInputRef, preparedPlanInput,
    setPreparedPlanInput, hydratingPreparedPlanRevisionRef, shownPreparedRevisionRef,
    markPlanInputEdited, captureSnapshot,
  } = session;

  const { exposeWorkId, exposeIntent, exposeCampaignId, consumeInitialTemplateParams } = useComposerLocation({
    initialTemplateId,
    workIdRef,
  });

  const {
    setFormat: setFormatManual,
    setFormatAuto,
    toggleTargetFormat,
    setTextLayout: setTextLayoutValue,
    setFontAssetKey: setFontAssetKeyValue,
  } = useComposerFormatControls({
    intentRef,
    formatRef,
    formatModeRef,
    targetFormatsRef,
    textLayoutRef,
    fontAssetKeyRef,
    directionPoolRef,
    markPlanInputEdited,
    setFormat,
    setFormatMode,
    setTargetFormats,
    setTextLayout,
    setFontAssetKey,
    setQuote,
  });

  const queries = useComposerQueries({
    workId,
    intent,
    activeClientProfileId: active.activeClientProfileId ?? null,
  });
  const {
    detailQuery,
    setCanonicalWorkRevision,
    brandKnowledgeQuery,
    fontOptions,
    createMutation,
    autosaveMutation,
    prepareMutation,
    editBriefingMutation,
    sourceMutation,
    generateMutation,
    retryOutputMutation,
    layerizeOutputMutation,
    reviseOutputMutation,
    selectOutputMutation,
    resolveBrandConflictMutation,
    downloadOutputUrl,
    campaignQuery,
    visualRecipesQuery,
    commercialOffersQuery,
  } = queries;

  useComposerFieldRefs({
    workId,
    pendingCampaignId,
    request,
    intent,
    objective,
    format,
    targetFormats,
    textLayout,
    fontAssetKey,
    workIdRef,
    pendingCampaignIdRef,
    requestRef,
    intentRef,
    objectiveRef,
    formatRef,
    targetFormatsRef,
    textLayoutRef,
    fontAssetKeyRef,
  });

  const { recordStudioEvent, recordCanonicalEvent } = useComposerTelemetry({
    workspaceId,
    studioSessionId,
    workflowVariant,
    initialWorkId,
    initialObjective,
    detail: detailQuery.data,
  });

  useComposerHydration({
    detail: detailQuery.data,
    initialWorkId,
    workflowVariant,
    hydratedWorkRef,
    workIdRef,
    requestRef,
    intentRef,
    objectiveRef,
    formatRef,
    targetFormatsRef,
    textLayoutRef,
    fontAssetKeyRef,
    directionPoolRef,
    directionTouchedRef,
    formatModeRef,
    briefingOverridesRef,
    briefingVersionRef,
    lastPersistedRef,
    preparedPlanInputRef,
    setPreparedPlanInput,
    hydratingPreparedPlanRevisionRef,
    setCanonicalWorkRevision,
    setWorkId,
    setRequestState,
    setInferredBriefingContext,
    setBriefingEditState,
    setIntent,
    setObjective,
    setFormat,
    setFormatMode,
    setTargetFormats,
    setTextLayout,
    setFontAssetKey,
    setDirectionPool,
    setDirectionSuggestionState,
    setQuote,
  });

  useEffect(() => {
    const profileId = active.activeClientProfileId;
    if (freshEntry || initialWorkId || progressivePlainEntry || workIdRef.current || !profileId || restoredProfileRef.current === profileId) return;
    restoredProfileRef.current = profileId;
    const storedWorkId = readStoredDraft(profileId, intentRef.current);
    if (!storedWorkId) return;
    workIdRef.current = storedWorkId;
    setWorkId(storedWorkId);
    exposeWorkId(storedWorkId);
  }, [active.activeClientProfileId, exposeWorkId, freshEntry, initialWorkId, intentRef, progressivePlainEntry, restoredProfileRef, setWorkId, workIdRef]);

  const {
    flushAutosave,
    resolveCanonicalWorkRevision,
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
    instantiateRecipe,
    instantiateOffer,
    saveCommercialOffer,
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
  } = useComposerActions({
    session,
    queries,
    workflowVariant,
    initialWorkId,
    initialTemplateId,
    focusComposer,
    studioSessionId,
    activeClientProfileId: active.activeClientProfileId ?? null,
    isLoadingProfile: active.isLoading,
    exposeWorkId,
    exposeIntent,
    exposeCampaignId,
    consumeInitialTemplateParams,
    recordStudioEvent,
    recordCanonicalEvent,
    tHome: (key, values) => tHome(key, values),
    tResults: (key) => tResults(key),
    onGenerationAccepted,
  });

  const detail = detailQuery.data;
  const objectiveSelected = objective !== null;
  const preparedPlan = detail?.preparedPlan ?? null;
  const stage = projectComposerStage({ objectiveSelected, detail: detail ?? null });
  const planInputSignature = signature(captureSnapshot());
  useComposerPlanSync({
    preparedPlan,
    hydratingPreparedPlanRevisionRef,
    preparedPlanInputRef,
    setPreparedPlanInput,
    planInputSignature,
    invalidatedPlanRevision,
    setInvalidatedPlanRevision,
    recordStudioEvent,
    workflowVariant,
    stage,
    shownPreparedRevisionRef,
  });
  const state = useMemo<ComposerState>(() => projectComposerBusyState({
    generatePending: generateMutation.isPending,
    workStatus: detail?.work.status,
    hasOutputs: Boolean(detail && detail.outputs.length > 0),
    isUploading,
    createPending: createMutation.isPending,
    autosavePending: autosaveMutation.isPending,
    sourceMutationPending: sourceMutation.isPending,
    preparePending: prepareMutation.isPending,
    analyzingSources: Boolean(detail?.sources.some((source) => source.status === "uploaded" || source.status === "analyzing")),
    hasWorkId: Boolean(workId),
    hasRequest: Boolean(request.trim()),
    hasSources: Boolean(detail?.sources.length),
  }), [autosaveMutation.isPending, createMutation.isPending, detail, generateMutation.isPending, isUploading, prepareMutation.isPending, request, sourceMutation.isPending, workId]);

  const storedProfileId = detail?.work.clientProfileId;
  const isRestoringWork = Boolean(initialWorkId && !detail);
  const clientProfileId = isRestoringWork ? null : storedProfileId ?? active.activeClientProfileId;
  const brandName = active.profiles.find((profile) => profile.id === storedProfileId)?.name
    ?? (isRestoringWork ? null : active.activeProfile?.name)
    ?? null;
  const sources = detail?.sources ?? [];
  const readySources = sources.filter((source) => source.status === "ready");
  const hasMeaningfulInput = composerHasMeaningfulInput({ intent, request, readySources });
  const canGenerate = projectComposerGenerateGate({
    clientProfileId,
    hasMeaningfulInput,
    workStatus: detail?.work.status,
    outputCount: detail?.outputs.length ?? 0,
    analyzingOrFailedSources: composerAnalyzingOrFailedSources(intent, sources),
    singlePieceReferenceBlocked: composerSinglePieceReferenceBlocked(intent, sources),
    formatAdaptationNeedsFormats: intent === "format_adaptation" && targetFormats.length === 0,
    singleNeedsFont: intent === "single" && fontOptions.length > 1 && !fontAssetKey,
    isUploading,
    actionPhase,
    generatePending: generateMutation.isPending,
    sourceMutationPending: sourceMutation.isPending,
    briefingBusy: editBriefingMutation.isPending || briefingEditState === "saving",
    briefingBlocked: inferredBriefing?.readiness === "blocked",
    brandConflictPending: resolveBrandConflictMutation.isPending,
  });
  const hasEntry = Boolean(request.trim() || bufferedFile || initialTemplateId || detail?.sources.length);
  const canContinue = objectiveSelected && canGenerate;
  const { visiblePreparedPlan } = projectVisiblePreparedPlan({
    preparedPlan,
    preparedInput: preparedPlanInput,
    planInputSignature,
    invalidatedPlanRevision,
  });
  const visibleStage = projectVisibleComposerStage(stage, Boolean(visiblePreparedPlan));
  const canConfirm = Boolean(visiblePreparedPlan)
    && actionPhase === "idle"
    && !generateMutation.isPending;
  const campaigns = (campaignQuery.data ?? []).filter((campaign) =>
    !campaign.clientProfileId || campaign.clientProfileId === storedProfileId,
  );
  const persistedBrandTrainingSuggestion = projectPersistedBrandTrainingSuggestion({
    status: detail?.work.status,
    assets: detail?.work.identitySnapshot?.assets,
  });
  const brandIdentity = projectComposerBrandIdentity({
    intent,
    frozenKnowledge: detail?.work.identitySnapshot?.brandKnowledge,
    snapshotAssets: detail?.work.identitySnapshot?.assets,
    reasons: detail?.work.identitySnapshot?.referenceSelection?.reasons,
    livePublished: Boolean(brandKnowledgeQuery.data?.activeVersion),
    liveVersionNumber: brandKnowledgeQuery.data?.activeVersion?.versionNumber ?? null,
  });
  const carousel = useCarouselComposer({
    workId: workId ?? "",
    workIdRef,
    draftEpochRef,
    flushAutosave,
    resolveCanonicalWorkRevision,
    setCanonicalWorkRevision,
    blockStaleRevision: queries.blockStaleRevision,
    setError,
    preparedPlan: preparedPlan ?? null,
    preparePlan,
    confirmGeneration,
    recordCanonicalEvent: (event, properties) => {
      recordCanonicalEvent(event, properties.creativeWorkId, {
        protocol: properties.protocol,
        outputCount: properties.outputCount,
      });
    },
  } satisfies CarouselComposerInput);

  // 3:4 appears only with the creation switch on and a validated protocol —
  // the same capability the server gates enforce (ICE-04B).
  const offeredFormats = useMemo(
    () =>
      offeredStudioFormats({
        creationSwitch: threeFourCreationEnabled ? "true" : "false",
        intent,
      }),
    [threeFourCreationEnabled, intent],
  );

  return {
    composerRef: composerRef as RefObject<HTMLTextAreaElement | null>, request, setRequest,
    intent, selectIntent, format, formatMode, setFormat: setFormatManual,
    offeredFormats,
    threeFourCreationEnabled,
    setFormatAuto,
    targetFormats, toggleTargetFormat,
    textLayout,
    setTextLayout: setTextLayoutValue,
    fontAssetKey,
    setFontAssetKey: setFontAssetKeyValue,
    fontOptions,
    directionPool, toggleDirection, setManualDirectionInstruction,
    directionSuggestionState, pendingDirectionSuggestions, applyDirectionSuggestions, requestDirectionSuggestions, keepCurrentDirections,
    state, stage: visibleStage, objective, objectiveSelected, bufferedFile, hasEntry, canContinue, canConfirm, preparedPlan: visiblePreparedPlan, preparedPlanCycle, actionPhase, workId, clientProfileId, brandName, workTitle: detail?.work.title ?? null,
    pendingProtocolSwitch, confirmProtocolSwitch, cancelProtocolSwitch,
    protocolSwitchNotice, returnToPreviousProtocol,
    sources: detail?.sources ?? [], outputs: detail?.outputs ?? [], quote, canGenerate, isUploading,
    artRefinement: detail?.work.artRefinementState ?? null,
    revisionCreditCost: detail?.revisionCreditCost ?? null,
    sourceMutationPending: sourceMutation.isPending,
    settingsLocked: Boolean(detail?.work && detail.work.status !== "draft"),
    inferredBriefing, briefingFactPack, brandIdentity,
    briefingOverrides: detail?.work.settings.briefingOverrides ?? {},
    editBriefingField, briefingEditState,
    campaignId: detail?.work.campaignId ?? pendingCampaignId, campaigns,
    error, announcement, approvalErrorOutputId, brandTrainingSuggestion: brandTrainingSuggestion ?? persistedBrandTrainingSuggestion,
    brandConflict, resolveBrandConflict,
    isResolvingBrandConflict: resolveBrandConflictMutation.isPending,
    requiresBrandSelection: active.requiresSelection,
    retryInitialTemplate: failedInitialTemplateId
      && !detail?.sources.some((source) => source.templateId === failedInitialTemplateId)
      ? retryInitialTemplate
      : null,
    workError: Boolean(workId && detailQuery.isError),
    addFiles, clearBufferedFile: () => setBufferedFile(null), addInspiration, instantiateRecipe, instantiateOffer, saveCommercialOffer, visualRecipes: visualRecipesQuery.data, commercialOffers: commercialOffersQuery.data, updateSource, editSource, retrySource, removeSource, updatePieceReference, replacePieceReference, promotePieceReference, preparePlan, confirmGeneration, generateLegacy,
    retryOutput, retryRevisionOutput, approveOutput, reviseOutput, linkCampaign,
    canLayerize: detail?.canLayerize ?? false,
    layerEditorAccess: detail?.layerEditorAccess,
    layerizeOutput,
    downloadLayerizedOutput: (outputId: string, format: "psd" | "zip") => {
      if (!workIdRef.current) return;
      window.open(downloadOutputUrl(workIdRef.current, outputId, format), "_blank", "noopener,noreferrer");
    },
    downloadOutput: (outputId: string) => {
      if (!workIdRef.current) return;
      window.open(downloadOutputUrl(workIdRef.current, outputId), "_blank", "noopener,noreferrer");
    },
    isRetryingOutput: (outputId: string) => retryOutputMutation.isPending && retryOutputMutation.variables?.outputId === outputId,
    isLayerizingOutput: (outputId: string) => layerizeOutputMutation.isPending && layerizeOutputMutation.variables?.outputId === outputId,
    isApprovingOutput: (outputId: string) => selectOutputMutation.isPending && selectOutputMutation.variables?.outputId === outputId,
    isRevisingOutput: (outputId: string) => isRevisingOutputBusy({
      pending: reviseOutputMutation.isPending,
      variables: reviseOutputMutation.variables,
      outputId,
      outputs: detail?.outputs ?? [],
    }),
    refreshOutputs: async () => { await detailQuery.refetch(); },
    carousel,
    recordStudioEvent,
  };
}

export type CreativeComposerModel = ReturnType<typeof useCreativeComposer>;
export type CreativeComposerViewModel = Omit<CreativeComposerModel, "composerRef">;
