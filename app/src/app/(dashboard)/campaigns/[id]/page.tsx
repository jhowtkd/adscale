"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useUploadAsset, useCampaignAssets } from "@/lib/hooks/use-assets";
import type { DeliveryFormat } from "@/components/workspace/DeliveryPackageModal";
import {
  CampaignWorkspaceBriefingV6Panel,
  CampaignWorkspaceV6Chrome,
} from "@/components/campaigns/v6/workspace/CampaignWorkspaceV6View";
import type {
  CampaignWorkspaceV6Labels,
  CampaignWorkspaceV6ViewModel,
} from "@/components/campaigns/v6/workspace/campaign-workspace-v6-types";
import { buildCampaignWorkspaceV6Labels } from "@/components/campaigns/v6/workspace/build-campaign-workspace-v6-labels";
import { mapCampaignWorkspaceToV6View } from "@/components/campaigns/v6/workspace/map-campaign-workspace-v6";

const EMPTY_WORKSPACE_VIEW: CampaignWorkspaceV6ViewModel = {
  name: "",
  status: "draft",
  statusVariant: "neutral",
  meta: "",
  currentStage: 0,
  stages: [],
  briefingSliders: [],
  briefingRules: [],
  derivations: [],
};

const DeliveryPackageModal = dynamic(() => import("@/components/workspace/DeliveryPackageModal"), {
  ssr: false,
  loading: () => null,
});

const PersonaSimulationSheet = dynamic(() => import("@/components/workspace/PersonaSimulationSheet"), {
  ssr: false,
  loading: () => null,
});

const DerivationReviewSheet = dynamic(() => import("@/components/workspace/DerivationReviewSheet"), {
  ssr: false,
  loading: () => null,
});

const EstilizarModal = dynamic(() => import("@/components/workspace/EstilizarModal"), {
  ssr: false,
  loading: () => null,
});

import PilotUploadPanel from "@/components/workspace/PilotUploadPanel";
import GuidedBriefingPanel from "@/components/workspace/GuidedBriefingPanel";
import PilotSidebar from "@/components/workspace/PilotSidebar";
import {
  answersFromCampaign,
  type GuidedBriefingHints,
} from "@/server/ai/guided-briefing";
import WorkspaceActionBar from "@/components/workspace/WorkspaceActionBar";
import DerivationGrid from "@/components/workspace/DerivationGrid";
import StrategyRecipePanel from "@/components/workspace/StrategyRecipePanel";
import ClientApprovalPackagePanel from "@/components/workspace/ClientApprovalPackagePanel";
import RegenerateFeedbackDialog, {
  DerivationLoadErrorBanner,
} from "@/components/workspace/RegenerateFeedbackDialog";
import PageSection from "@/components/layout/PageSection";

import OutputLearningRecommendationCard, {
  type OutputLearningAcceptPayload,
  type RecipePrefillPayload,
} from "@/components/campaigns/OutputLearningRecommendationCard";
import CampaignClientSubtitle from "@/components/campaigns/CampaignClientSubtitle";
import ClientProfileLinkControl from "@/components/campaigns/ClientProfileLinkControl";
import PlatformsDrawer from "@/components/campaigns/PlatformsDrawer";
import { formatCampaignPlatforms } from "@/lib/campaign-platforms";
import type { StrategyRecipePrefill } from "@/lib/hooks/use-strategy-recipe";
import ContextualFeedbackButton from "@/components/feedback/ContextualFeedbackButton";
import CampaignSkeleton from "@/components/campaigns/CampaignSkeleton";
import CampaignErrorState from "@/components/campaigns/CampaignErrorState";
import CampaignNotFoundState from "@/components/campaigns/CampaignNotFoundState";

import { CampaignAssistantPanel } from "@/components/assistant/CampaignAssistantDrawer";
import { useCampaignWorkspace } from "@/lib/hooks/use-campaign-workspace";
import type { ReviewDerivationVariables } from "@/lib/hooks/use-review";
import { useUpdateCampaign } from "@/lib/hooks/use-campaigns";
import { useDerivationFlow } from "@/lib/hooks/use-derivation-flow";
import { usePreflightScore } from "@/lib/hooks/use-preflight";
import {
  resolveBrandKitClientProfileId,
  shouldFetchBrandKit,
  useBrandKit,
} from "@/lib/hooks/use-brand-kit";
import { useClientProfiles } from "@/lib/hooks/use-client-profiles";
import { useTranslations } from "next-intl";
import {
  applyCampaignDeepLink,
  parseCampaignTabParam,
} from "@/lib/campaign/deep-link-tab";

type WorkspaceHookResult = ReturnType<typeof useCampaignWorkspace>;
type Campaign = NonNullable<WorkspaceHookResult["campaign"]>;
type WorkspaceState = WorkspaceHookResult["workspaceState"];

export default function CampaignWorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const campaignId = params.id as string;
  const isNew = campaignId === "new";
  const appliedDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    if (isNew) {
      window.location.replace("/campaigns/new");
    }
  }, [isNew]);

  const tc = useTranslations("common");
  const tCampaign = useTranslations("campaign");
  const tWorkspaceMobile = useTranslations("campaign.workspace");
  const addToast = useAppStore((s) => s.addToast);
  const uploadAsset = useUploadAsset(campaignId);
  const updateCampaign = useUpdateCampaign(campaignId);

  const [personaSimulation, setPersonaSimulation] = useState<{
    isOpen: boolean;
    selectedId: string | null;
  }>({ isOpen: false, selectedId: null });

  const [analysis, setAnalysis] = useState({
    detectedConcept: "",
    tone: "",
    elements: "",
    format: "",
    suggestedObjective: "",
    suggestedAudience: "",
    suggestedTone: "",
    suggestedPlatforms: "",
    suggestedCta: "",
  });
  const pilotAssetIdRef = useRef<string | null>(null);
  const [showEstilizarModal, setShowEstilizarModal] = useState(false);
  const [platformsDrawerOpen, setPlatformsDrawerOpen] = useState(false);
  // Mobile (< lg) toggles between the workspace grid and the chat panel.
  const [mobileView, setMobileView] = useState<"grid" | "chat">("grid");
  const {
    isDerivePanelOpen,
    derivePanelSession,
    recipePrefill,
    pendingOutputLearningApplication,
    setPendingOutputLearningApplication,
    openDerivePanel,
    closeFlow,
  } = useDerivationFlow();

  const {
    campaign,
    workspaceId,
    isLoading,
    isError,
    loadErrorKind,
    refetchCampaign,
    isDerivationsError,
    derivationsErrorKind,
    refetchDerivations,
    allDerivations,
    reviewDerivationId,
    regenerateDialog,
    handleCloseReview,
    handleConfirmRegenerate,
    handleCloseRegenerateDialog,
    handleRequestRegenerate,
    approvedDerivation,
    workspaceState,
    isGenerating,
    savingReferenceId,
    deliveryModalOpen,
    selectedDeliverySource,
    handleDeliveryModalOpenChange,
    goToSetup,
    goToTrabalho,
    savePilot,
    handleGenerateDerivations,
    configureAndGenerate,
    handleRestyle,
    handleGenerateLandingPage,
    handleSaveAsReference,
    hasActivePreview,
    previewDerivation,
    showPreviewGate,
    approvePreviewToBatch,
    handlePreview,
    handleDownloadDerivation,
    handleRegenerateDerivation,
    handleApproveDerivation,
    handleRejectDerivation,
    handleReviewDecision,
    handleRunQa,
    handleCreateDeliveryPackage,
    handleConfirmDeliveryPackage,
    handleDownloadDeliverySource,
    handleExportDerivation,
    handleDelete,
    handleDeleteClick,
    showDeleteDialog,
    setShowDeleteDialog,
    creativeQaPending,
    creativeQaVariables,
    reviewPending,
    reviewVariables,
    regeneratePending,
    regenerateVariables,
    landingPagePending,
    landingPageVariables,
    createDerivationsPending,
    exportPending,
    deliveryPackagePending,
    generatePlanPending,
    updatePlanStatusPending,
  } = useCampaignWorkspace(campaignId, isNew, {
    pendingOutputLearningApplication,
  });

  const { data: campaignAssets } = useCampaignAssets(campaignId);
  const { data: clientProfiles, isSuccess: clientProfilesLoaded } = useClientProfiles();
  const brandKitClientProfileId = useMemo(
    () =>
      resolveBrandKitClientProfileId({
        clientProfileId: campaign?.clientProfileId,
        clientProfiles,
      }),
    [campaign?.clientProfileId, clientProfiles]
  );
  const brandKitQueryEnabled = useMemo(
    () =>
      Boolean(campaign) &&
      shouldFetchBrandKit({
        clientProfileId: campaign?.clientProfileId,
        clientProfiles,
        profilesLoaded: clientProfilesLoaded,
      }),
    [campaign, clientProfiles, clientProfilesLoaded]
  );
  const { data: brandKit } = useBrandKit(brandKitClientProfileId, {
    enabled: brandKitQueryEnabled,
  });
  const reviewDerivation = useMemo(
    () => allDerivations.find((item) => item.id === reviewDerivationId) ?? null,
    [allDerivations, reviewDerivationId]
  );
  const baseAsset = useMemo(
    () => campaignAssets?.find((asset) => asset.role === "base") ?? campaignAssets?.[0] ?? null,
    [campaignAssets]
  );
  const styleAsset = useMemo(() => {
    if (!reviewDerivation?.styleAssetId || !campaignAssets) return null;
    return campaignAssets.find((asset) => asset.id === reviewDerivation.styleAssetId) ?? null;
  }, [reviewDerivation, campaignAssets]);
  const { data: preflightData } = usePreflightScore({
    campaignId,
    assetId: baseAsset?.id ?? null,
  });
  const [readinessOverrideActive, setReadinessOverrideActive] = useState(false);
  const readinessBlocking = useMemo(() => {
    if (readinessOverrideActive) return null;
    const issues = preflightData?.readiness?.blockingIssues ?? [];
    if (issues.length === 0) return null;
    return {
      blockingCount: issues.length,
      topIssue: issues[0],
    };
  }, [preflightData?.readiness?.blockingIssues, readinessOverrideActive]);

  const workspaceLabels = useMemo(
    () => buildCampaignWorkspaceV6Labels(tCampaign, tc),
    [tCampaign, tc],
  );

  const workspaceView = useMemo(
    () =>
      campaign
        ? mapCampaignWorkspaceToV6View({
            campaign,
            derivations: allDerivations,
            workspaceState,
            isGenerating,
            tStatus: (key) => tCampaign(`status.${key}`),
            tWorkspace: (key, values) => tCampaign(`v6.${key}`, values),
            formatDate: (date) =>
              date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }),
          })
        : EMPTY_WORKSPACE_VIEW,
    [campaign, allDerivations, workspaceState, isGenerating, tCampaign],
  );

  useEffect(() => {
    if (isLoading || isNew || !campaign) return;

    const parsed = parseCampaignTabParam(
      searchParams.get("tab"),
      searchParams.get("mode")
    );
    if (!parsed) return;

    const deepLinkKey = `${parsed.tab}:${parsed.mode ?? ""}`;
    if (appliedDeepLinkRef.current === deepLinkKey) return;
    appliedDeepLinkRef.current = deepLinkKey;

    applyCampaignDeepLink(parsed.tab, parsed.mode, {
      goToSetup,
      goToTrabalho,
      hasDerivations: allDerivations.length > 0,
      openStrategyRecipe: openDerivePanel,
    });
  }, [
    allDerivations.length,
    campaign,
    campaignId,
    goToTrabalho,
    goToSetup,
    isLoading,
    isNew,
    openDerivePanel,
    searchParams,
  ]);

  const handleSimulatePersonas = (derivationId: string) => {
    setPersonaSimulation({ isOpen: true, selectedId: derivationId });
  };

  const handleClosePersonaModal = () => {
    setPersonaSimulation({ isOpen: false, selectedId: null });
  };

  const handleAssetUploaded = (assetId: string) => {
    pilotAssetIdRef.current = assetId;
  };
  const handleAnalysisComplete = (analysisData: {
    detectedConcept: string;
    tone: string;
    elements: string;
    format: string;
    suggestedObjective?: string;
    suggestedAudience?: string;
    suggestedTone?: string;
    suggestedPlatforms?: string;
    suggestedCta?: string;
  }) =>
    setAnalysis({
      detectedConcept: analysisData.detectedConcept,
      tone: analysisData.tone,
      elements: analysisData.elements,
      format: analysisData.format,
      suggestedObjective: analysisData.suggestedObjective ?? "",
      suggestedAudience: analysisData.suggestedAudience ?? "",
      suggestedTone: analysisData.suggestedTone ?? "",
      suggestedPlatforms: analysisData.suggestedPlatforms ?? "",
      suggestedCta: analysisData.suggestedCta ?? "",
    });
  const guidedBriefingHints: GuidedBriefingHints = {
    suggestedObjective: analysis.suggestedObjective,
    suggestedAudience: analysis.suggestedAudience,
    suggestedPlatforms: analysis.suggestedPlatforms,
    suggestedCta: analysis.suggestedCta,
    suggestedTone: analysis.suggestedTone,
    detectedConcept: analysis.detectedConcept,
    client: campaign?.client ?? undefined,
  };

  const handleGuidedBriefingComplete = async (briefing: {
    objective?: string;
    audience?: string;
    tone?: string;
    platforms?: string;
    ctaText?: string;
    constraints?: string;
    product?: string;
    offer?: string;
  }) => {
    if (!pilotAssetIdRef.current) return;
    try {
      await savePilot(pilotAssetIdRef.current, {
        ...briefing,
        tone: briefing.tone ?? analysis.suggestedTone,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message === "rateLimitExceeded"
          ? tCampaign("briefingSaveRateLimit")
          : tCampaign("briefingSaveFailed");
      addToast("error", message);
    }
  };

  const handleCloseDerivationFlow = () => {
    closeFlow();
    goToTrabalho();
  };

  const handleOpenDerivar = (prefill?: StrategyRecipePrefill | null) => {
    openDerivePanel(prefill);
    goToTrabalho();
  };

  const handleOutputLearningAccept = (payload: OutputLearningAcceptPayload) => {
    setPendingOutputLearningApplication(payload.applicationSnapshot);
    openDerivePanel({
      recipeId: payload.prefill.recipeId,
      ...payload.prefill.config,
    });
    goToTrabalho();
  };

  const handleOutputLearningEdit = (prefill: RecipePrefillPayload) => {
    openDerivePanel({
      recipeId: prefill.recipeId,
      ...prefill.config,
    });
    goToTrabalho();
  };

  const handleDerivePreview = async (patch: {
    generationMode: "art_variation" | "format_adaptation";
    creativeLevel?: "conservative" | "balanced" | "bold" | "extreme";
    ctaVariants?: string[];
    targetFormats?: string[];
  }) => {
    closeFlow();
    goToTrabalho();
    await configureAndGenerate(patch, { preview: true });
  };

  const handleEstilizarSubmit = async (data: {
    styleReferenceFiles: File[];
    intensity: string;
  }) => {
    const styleAssetIds: string[] = [];
    if (data.styleReferenceFiles.length > 0) {
      try {
        for (const file of data.styleReferenceFiles) {
          const asset = await uploadAsset.mutateAsync({
            file,
            role: "style_reference",
          });
          styleAssetIds.push(asset.id);
        }
      } catch {
        addToast("error", tCampaign("styleReferenceUploadFailed"));
        return;
      }
    }

    setShowEstilizarModal(false);
    void handleRestyle({
      styleAssetIds: styleAssetIds.length > 0 ? styleAssetIds : undefined,
      styleIntensity: data.intensity as "soft" | "medium" | "strong",
    });
  };

  if (isNew) return <CampaignSkeleton />;
  if (isLoading) return <CampaignSkeleton />;
  if (isError) {
    return (
      <CampaignErrorState
        kind={loadErrorKind ?? "unknown"}
        onRetry={() => void refetchCampaign()}
      />
    );
  }
  if (!campaign) {
    return loadErrorKind === "not_found" ? <CampaignNotFoundState /> : <CampaignErrorState kind="unknown" />;
  }

  const isDraft = campaign?.status === "draft";
  const platformsText = formatCampaignPlatforms(campaign?.platforms);

  const handleSavePlatforms = async (platforms: string[]) => {
    try {
      await updateCampaign.mutateAsync({ platforms });
      addToast("success", tc("platformsSaved"));
      setPlatformsDrawerOpen(false);
    } catch {
      addToast("error", tc("failedSavePlatforms"));
    }
  };

  return (
    <div className="min-w-0 pb-10 workspace-scroll-padding shell-offset-bottom-mobile">
      <div className="workspace-split lg:grid lg:grid-cols-[1fr_380px] lg:items-start">
        {/* Main workspace column. Always visible on desktop; toggled on mobile. */}
        <div
          className={cn(
            "workspace-main min-w-0 space-y-4 lg:block",
            mobileView === "grid" ? "block" : "hidden lg:block"
          )}
        >
          <CampaignWorkspaceV6Chrome
            view={workspaceView}
            labels={workspaceLabels}
            campaignId={campaignId}
            isDraft={isDraft}
            onDelete={handleDeleteClick}
          />

          {campaign && (
            <CampaignClientSubtitle
              platformsText={platformsText}
              onAddPlatform={() => setPlatformsDrawerOpen(true)}
            />
          )}

          {campaign && !campaign.clientProfileId ? (
            <ClientProfileLinkControl
              campaignId={campaignId}
              clientName={campaign.client}
              clientProfileId={campaign.clientProfileId}
              variant="banner"
            />
          ) : null}

          <PlatformsDrawer
            open={platformsDrawerOpen}
            onOpenChange={setPlatformsDrawerOpen}
            selectedPlatforms={campaign?.platforms ?? []}
            isSaving={updateCampaign.isPending}
            onSave={handleSavePlatforms}
          />
          <CampaignWorkspaceCard
            campaignId={campaignId}
            campaign={campaign}
            workspaceState={workspaceState}
            isGenerating={isGenerating}
            workspaceView={workspaceView}
            workspaceLabels={workspaceLabels}
            analysis={analysis}
            allDerivations={allDerivations}
            onPreview={handlePreview}
            onDownload={handleDownloadDerivation}
            onRegenerate={handleRegenerateDerivation}
            onApprove={handleApproveDerivation}
            onReject={handleRejectDerivation}
            onCreateDeliveryPackage={handleCreateDeliveryPackage}
            onRunQa={handleRunQa}
            onSaveAsReference={handleSaveAsReference}
            onGenerateLandingPage={handleGenerateLandingPage}
            onSimulatePersonas={handleSimulatePersonas}
            qaAnalyzingId={
              creativeQaPending && creativeQaVariables?.derivationId
                ? creativeQaVariables.derivationId
                : null
            }
            regeneratingId={
              regeneratePending && regenerateVariables?.id ? regenerateVariables.id : null
            }
            landingPageGeneratingId={
              landingPagePending && landingPageVariables?.derivationId
                ? landingPageVariables.derivationId
                : null
            }
            simulatingPersonasId={personaSimulation.selectedId}
            savingReferenceId={savingReferenceId}
            reviewPending={reviewPending}
            reviewVariables={reviewVariables ?? null}
            onAssetUploaded={handleAssetUploaded}
            onAnalysisComplete={handleAnalysisComplete}
            onGuidedBriefingComplete={handleGuidedBriefingComplete}
            guidedBriefingHints={guidedBriefingHints}
            showPreviewGate={showPreviewGate}
            previewDerivation={previewDerivation}
            onApprovePreviewBatch={approvePreviewToBatch}
            createDerivationsPending={createDerivationsPending}
            onOpenDerivar={handleOpenDerivar}
            onOutputLearningAccept={handleOutputLearningAccept}
            onOutputLearningEdit={handleOutputLearningEdit}
            onOpenEstilizar={() => {
              setShowEstilizarModal(true);
              goToTrabalho();
            }}
            isDerivationsError={isDerivationsError}
            derivationsErrorKind={derivationsErrorKind}
            onRetryDerivations={() => void refetchDerivations()}
            readinessBlocking={readinessBlocking}
            onReadinessOverride={() => setReadinessOverrideActive(true)}
          />
        </div>

        {/* Permanent assistant panel. Fixed column on desktop; toggled on mobile. */}
        <aside
          aria-label={tWorkspaceMobile("assistantLabel")}
          className={cn(
            "workspace-chat border-l border-[var(--border-subtle)] lg:block",
            mobileView === "chat"
              ? "block min-h-[60vh]"
              : "hidden lg:block"
          )}
        >
          <div className="flex h-full min-h-0 flex-col lg:sticky lg:top-[calc(var(--shell-topbar-desktop)+var(--shell-sticky-gap))] lg:h-[calc(100vh-var(--shell-topbar-desktop)-var(--shell-sticky-gap)-1rem)]">
            <CampaignAssistantPanel
              campaignId={campaignId}
              clientProfileId={campaign?.clientProfileId ?? ""}
            />
          </div>
        </aside>
      </div>

      {/* Mobile-only Grid/Chat tab toggle (hidden on >= lg). */}
      <div
        role="tablist"
        aria-label={tWorkspaceMobile("viewToggleLabel")}
        className="workspace-mobile-tabs mt-4 grid grid-cols-2 gap-2 lg:hidden"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === "grid"}
          onClick={() => setMobileView("grid")}
          className={cn(
            "rounded-[var(--radius-control)] border px-3 py-2 text-sm font-medium",
            mobileView === "grid"
              ? "border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] text-[var(--accent-primary-text)]"
              : "border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-secondary)]"
          )}
        >
          {tWorkspaceMobile("gridTab")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === "chat"}
          onClick={() => setMobileView("chat")}
          className={cn(
            "rounded-[var(--radius-control)] border px-3 py-2 text-sm font-medium",
            mobileView === "chat"
              ? "border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] text-[var(--accent-primary-text)]"
              : "border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-secondary)]"
          )}
        >
          {tWorkspaceMobile("chatTab")}
        </button>
      </div>

      <DerivationReviewSheet
        open={Boolean(reviewDerivationId && reviewDerivation)}
        derivation={reviewDerivation}
        workspaceId={workspaceId ?? campaign?.workspaceId}
        campaignId={campaignId}
        clientProfileId={campaign?.clientProfileId}
        campaignClient={campaign?.client}
        baseAsset={baseAsset}
        styleAsset={styleAsset}
        isRegenerating={regeneratePending}
        isApproving={
          reviewPending &&
          (reviewVariables?.decision === "entra" || reviewVariables?.status === "approved")
        }
        isRejecting={
          reviewPending &&
          (reviewVariables?.decision === "nao_entra" ||
            reviewVariables?.decision === "quase_regenerar" ||
            reviewVariables?.status === "rejected")
        }
        onOpenChange={(open) => {
          if (!open) handleCloseReview();
        }}
        onRegenerateWithFixes={() => {
          if (reviewDerivationId) {
            handleRequestRegenerate(reviewDerivationId);
          }
        }}
        onSubmitDecision={(input) => {
          if (reviewDerivationId) {
            handleReviewDecision(reviewDerivationId, input);
          }
        }}
        onApprove={
          reviewDerivationId
            ? () => handleApproveDerivation(reviewDerivationId)
            : undefined
        }
        onReject={
          reviewDerivationId
            ? () => handleRejectDerivation(reviewDerivationId)
            : undefined
        }
      />

      <RegenerateFeedbackDialog
        open={Boolean(regenerateDialog)}
        initialFeedback={regenerateDialog?.feedback ?? ""}
        primaryReason={regenerateDialog?.primaryReason}
        issueBreakdown={regenerateDialog?.issueBreakdown}
        isSubmitting={regeneratePending}
        onOpenChange={handleCloseRegenerateDialog}
        onConfirm={handleConfirmRegenerate}
      />

      <CampaignWorkspaceModals
        campaign={campaign}
        selectedDeliverySource={selectedDeliverySource}
        visibility={{
          delivery: deliveryModalOpen,
          derivePanel: isDerivePanelOpen,
          estilizar: showEstilizarModal,
          delete: showDeleteDialog,
        }}
        readiness={preflightData?.readiness}
        brandKit={brandKit}
        campaignRecipeContext={{
          ctaVariants: campaign?.ctaVariants,
          targetFormats: campaign?.targetFormats,
          platforms: campaign?.platforms,
          generationMode: campaign?.generationMode,
          creativeLevel: campaign?.creativeLevel,
          suggestedCta: analysis.suggestedCta,
        }}
        onDerivePreview={handleDerivePreview}
        derivePanelSession={derivePanelSession}
        recipePrefill={recipePrefill}
        pending={{
          export: exportPending,
          deliveryPackage: deliveryPackagePending,
          derivation: createDerivationsPending,
        }}
        personaSimulation={personaSimulation}
        onDeliveryModalOpenChange={handleDeliveryModalOpenChange}
        onDownloadDeliverySource={handleDownloadDeliverySource}
        onConfirmDeliveryPackage={handleConfirmDeliveryPackage}
        onClosePersonaModal={handleClosePersonaModal}
        onCloseDerivationFlow={handleCloseDerivationFlow}
        campaignId={campaignId}
        campaignCreativeLevel={campaign?.creativeLevel}
        suggestedCta={analysis.suggestedCta}
        onCloseEstilizar={() => {
          setShowEstilizarModal(false);
          goToTrabalho();
        }}
        onEstilizarSubmit={handleEstilizarSubmit}
        onDeleteDialogOpenChange={setShowDeleteDialog}
        onConfirmDelete={handleDelete}
      />
    </div>
  );
}

interface CampaignWorkspaceCardProps {
  campaignId: string;
  campaign: WorkspaceHookResult["campaign"];
  workspaceState: WorkspaceState;
  isGenerating: boolean;
  workspaceView: CampaignWorkspaceV6ViewModel;
  workspaceLabels: CampaignWorkspaceV6Labels;
  analysis: {
    detectedConcept: string;
    tone: string;
    elements: string;
    format: string;
    suggestedObjective: string;
    suggestedAudience: string;
    suggestedTone: string;
    suggestedPlatforms: string;
    suggestedCta: string;
  };
  allDerivations: WorkspaceHookResult["allDerivations"];
  onPreview: (id: string) => void;
  onDownload: (id: string) => void;
  onRegenerate: (id: string, feedback?: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onCreateDeliveryPackage: (id: string) => void;
  onRunQa: (id: string) => void;
  onSaveAsReference: (id: string) => void;
  onGenerateLandingPage: (id: string) => void;
  onSimulatePersonas: (id: string) => void;
  qaAnalyzingId: string | null;
  regeneratingId: string | null;
  landingPageGeneratingId: string | null;
  simulatingPersonasId: string | null;
  savingReferenceId: string | null;
  reviewPending: boolean;
  reviewVariables: ReviewDerivationVariables | null;
  onAssetUploaded: (assetId: string) => void;
  onAnalysisComplete: (analysis: {
    detectedConcept: string;
    tone: string;
    elements: string;
    format: string;
    suggestedObjective?: string;
    suggestedAudience?: string;
    suggestedTone?: string;
    suggestedPlatforms?: string;
    suggestedCta?: string;
  }) => void;
  onGuidedBriefingComplete: (briefing: {
    objective?: string;
    audience?: string;
    tone?: string;
    platforms?: string;
    ctaText?: string;
    constraints?: string;
    product?: string;
    offer?: string;
  }) => void;
  guidedBriefingHints: GuidedBriefingHints;
  onOpenDerivar: (prefill?: StrategyRecipePrefill | null) => void;
  onOutputLearningAccept: (payload: OutputLearningAcceptPayload) => void;
  onOutputLearningEdit: (prefill: RecipePrefillPayload) => void;
  onOpenEstilizar: () => void;
  showPreviewGate?: boolean;
  previewDerivation?: WorkspaceHookResult["previewDerivation"];
  onApprovePreviewBatch?: () => void;
  createDerivationsPending?: boolean;
  isDerivationsError?: boolean;
  derivationsErrorKind?: string | null;
  onRetryDerivations?: () => void;
  readinessBlocking?: { blockingCount: number; topIssue?: string } | null;
  onReadinessOverride?: () => void;
}

function CampaignWorkspaceCard({
  campaignId,
  campaign,
  workspaceState,
  isGenerating,
  workspaceView,
  workspaceLabels,
  analysis,
  allDerivations,
  onPreview,
  onDownload,
  onRegenerate,
  onApprove,
  onReject,
  onCreateDeliveryPackage,
  onRunQa,
  onSaveAsReference,
  onGenerateLandingPage,
  onSimulatePersonas,
  qaAnalyzingId,
  regeneratingId,
  landingPageGeneratingId,
  simulatingPersonasId,
  savingReferenceId,
  reviewPending,
  reviewVariables,
  onAssetUploaded,
  onAnalysisComplete,
  onGuidedBriefingComplete,
  guidedBriefingHints,
  onOpenDerivar,
  onOutputLearningAccept,
  onOutputLearningEdit,
  onOpenEstilizar,
  showPreviewGate,
  previewDerivation,
  onApprovePreviewBatch,
  createDerivationsPending,
  isDerivationsError,
  derivationsErrorKind,
  onRetryDerivations,
  readinessBlocking,
  onReadinessOverride,
}: CampaignWorkspaceCardProps) {
  const tApproval = useTranslations("clientApprovalPackage");
  const tCampaign = useTranslations("campaign");

  return (
    <section className="min-h-[400px] rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5 sm:p-8">
      {workspaceState === "setup" && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div id="mission-assets">
            <PilotUploadPanel
              campaignId={campaignId}
              onAssetUploaded={onAssetUploaded}
              onAnalysisComplete={onAnalysisComplete}
              onReadinessOverride={onReadinessOverride}
            />
          </div>
          <div id="mission-briefing">
            {campaign ? (
              <GuidedBriefingPanel
                campaignId={campaignId}
                initialAnswers={answersFromCampaign({
                  product: campaign.product,
                  offer: campaign.offer,
                  audience: campaign.audience,
                  objective: campaign.objective,
                  constraints: campaign.constraints,
                  platforms: campaign.platforms ?? null,
                  ctaVariants: campaign.ctaVariants ?? null,
                })}
                hints={guidedBriefingHints}
                onComplete={onGuidedBriefingComplete}
              />
            ) : null}
          </div>
        </div>
      )}

      {workspaceState === "trabalho" && (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <details className="group lg:hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
                {tCampaign("pilotSidebar.briefingReadinessSummary")}
              </summary>
              <div className="border-t border-[var(--border-subtle)] p-4">
                <PilotSidebar
                  campaignId={campaignId}
                  campaign={{
                    name: campaign?.name || "",
                    client: campaign?.client,
                    clientProfileId: campaign?.clientProfileId,
                  }}
                  briefing={{
                    objective: analysis.suggestedObjective,
                    audience: analysis.suggestedAudience,
                    tone: analysis.suggestedTone,
                    platforms: analysis.suggestedPlatforms,
                    ctaText: analysis.suggestedCta,
                  }}
                  onReadinessOverride={onReadinessOverride}
                />
              </div>
            </details>
            <div className="hidden lg:block">
              <CampaignWorkspaceBriefingV6Panel view={workspaceView} labels={workspaceLabels} />
            </div>
          </div>
          <div className="min-w-0 space-y-6">
            <div id="mission-output-learnings">
              <OutputLearningRecommendationCard
                campaignId={campaignId}
                onAccept={onOutputLearningAccept}
                onEdit={onOutputLearningEdit}
              />
            </div>
            <WorkspaceActionBar
              onDerivar={() => onOpenDerivar()}
              onEstilizar={onOpenEstilizar}
              readinessBlocking={readinessBlocking}
              disabled={isGenerating}
            />
            <PageSection id="mission-share" title={tApproval("title")}>
              <ClientApprovalPackagePanel campaignId={campaignId} />
            </PageSection>
            <div id="mission-review">
            <PageSection id="mission-export" title={tCampaign("derivationsSectionTitle")}>
              {isDerivationsError && derivationsErrorKind ? (
                <div className="mb-3">
                  <DerivationLoadErrorBanner
                    kind={derivationsErrorKind}
                    onRetry={onRetryDerivations}
                  />
                </div>
              ) : null}
              {isGenerating && (
                <p className="text-xs text-[var(--text-secondary)] mb-3 flex items-center gap-2">
                  <span className="inline-block size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  {tCampaign("generatingDerivations")}
                </p>
              )}
              <DerivationGrid
                derivations={allDerivations}
                onAddNew={onOpenDerivar}
                onPreview={onPreview}
                onDownload={onDownload}
                onRegenerate={onRegenerate}
                onApprove={onApprove}
                onReject={onReject}
                onCreateDeliveryPackage={onCreateDeliveryPackage}
                onRunQa={onRunQa}
                onSaveAsReference={onSaveAsReference}
                onGenerateLandingPage={onGenerateLandingPage}
                onSimulatePersonas={onSimulatePersonas}
                qaAnalyzingId={qaAnalyzingId}
                regeneratingId={regeneratingId}
                landingPageGeneratingId={landingPageGeneratingId}
                simulatingPersonasId={simulatingPersonasId}
                savingReferenceId={savingReferenceId}
                reviewPending={reviewPending}
                reviewVariables={reviewVariables}
                previewGate={
                  showPreviewGate &&
                  previewDerivation &&
                  onApprovePreviewBatch
                    ? {
                        campaignId,
                        previewId: previewDerivation.id,
                        isApproving: createDerivationsPending,
                        onApproveBatch: onApprovePreviewBatch,
                      }
                    : undefined
                }
              />
            </PageSection>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface CampaignWorkspaceModalVisibility {
  delivery: boolean;
  derivePanel: boolean;
  estilizar: boolean;
  delete: boolean;
}

interface CampaignWorkspaceModalPending {
  export: boolean;
  deliveryPackage: boolean;
  derivation: boolean;
}

interface CampaignWorkspaceModalsProps {
  campaign: WorkspaceHookResult["campaign"];
  selectedDeliverySource: WorkspaceHookResult["selectedDeliverySource"];
  visibility: CampaignWorkspaceModalVisibility;
  pending: CampaignWorkspaceModalPending;
  personaSimulation: { isOpen: boolean; selectedId: string | null };
  onDeliveryModalOpenChange: (open: boolean) => void;
  onDownloadDeliverySource: () => void;
  onConfirmDeliveryPackage: (formats: DeliveryFormat[]) => void;
  onClosePersonaModal: () => void;
  onCloseDerivationFlow: () => void;
  campaignId: string;
  campaignCreativeLevel?: string | null;
  suggestedCta?: string;
  onCloseEstilizar: () => void;
  onEstilizarSubmit: (data: {
    styleReferenceFiles: File[];
    intensity: string;
  }) => void;
  onDeleteDialogOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  readiness?: import("@/server/ai/creative-readiness").CreativeReadinessResult | null;
  brandKit?: import("@/lib/hooks/use-brand-kit").BrandKitWithUrl | null;
  campaignRecipeContext?: import("@/server/ai/strategy-recipes").CampaignRecipeContext;
  onDerivePreview: (patch: {
    generationMode: "art_variation" | "format_adaptation";
    creativeLevel?: "conservative" | "balanced" | "bold" | "extreme";
    ctaVariants?: string[];
    targetFormats?: string[];
  }) => void | Promise<void>;
  derivePanelSession: number;
  recipePrefill?: import("@/lib/hooks/use-strategy-recipe").StrategyRecipePrefill | null;
}

function CampaignWorkspaceModals({
  campaign,
  selectedDeliverySource,
  visibility,
  pending,
  personaSimulation,
  onDeliveryModalOpenChange,
  onDownloadDeliverySource,
  onConfirmDeliveryPackage,
  onClosePersonaModal,
  onCloseDerivationFlow,
  campaignId,
  campaignCreativeLevel,
  suggestedCta,
  onCloseEstilizar,
  onEstilizarSubmit,
  onDeleteDialogOpenChange,
  onConfirmDelete,
  readiness,
  brandKit,
  campaignRecipeContext,
  onDerivePreview,
  derivePanelSession,
  recipePrefill,
}: CampaignWorkspaceModalsProps) {
  const tCampaign = useTranslations("campaign");
  return (
    <>
      {selectedDeliverySource && (
        <DeliveryPackageModal
          open={visibility.delivery}
          sourceFormat={selectedDeliverySource.format ?? null}
          isDownloading={pending.export}
          isSubmitting={pending.deliveryPackage}
          onOpenChange={onDeliveryModalOpenChange}
          onDownloadCurrent={onDownloadDeliverySource}
          onConfirm={onConfirmDeliveryPackage}
        />
      )}

      {personaSimulation.selectedId && (
        <PersonaSimulationSheet
          isOpen={personaSimulation.isOpen}
          onClose={onClosePersonaModal}
          sourceType="derivation"
          sourceId={personaSimulation.selectedId}
          campaignName={campaign?.name}
        />
      )}

      <StrategyRecipePanel
        campaignId={campaignId}
        open={visibility.derivePanel}
        recipeSessionKey={derivePanelSession}
        readiness={readiness}
        brandKit={
          brandKit
            ? {
                constraints: brandKit.constraints,
                toneOfVoice: brandKit.toneOfVoice,
                prohibitedElements: brandKit.prohibitedElements,
              }
            : null
        }
        campaign={campaignRecipeContext}
        campaignCreativeLevel={campaignCreativeLevel}
        suggestedCta={suggestedCta}
        initialPrefill={recipePrefill}
        isSubmitting={pending.derivation}
        onClose={onCloseDerivationFlow}
        onGeneratePreview={onDerivePreview}
      />

      <EstilizarModal
        open={visibility.estilizar}
        onClose={onCloseEstilizar}
        onSubmit={onEstilizarSubmit}
      />

      <ConfirmDialog
        open={visibility.delete}
        onOpenChange={onDeleteDialogOpenChange}
        title={tCampaign("deleteDialog.title")}
        description={tCampaign("deleteDialog.description")}
        confirmLabel={tCampaign("deleteDialog.confirmLabel")}
        variant="destructive"
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
