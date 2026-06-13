"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useAppStore } from "@/lib/store";
import dynamic from "next/dynamic";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import PageSection from "@/components/layout/PageSection";
import Panel from "@/components/layout/Panel";
import { useUploadAsset, useCampaignAssets } from "@/lib/hooks/use-assets";
import type { DeliveryFormat } from "@/components/workspace/DeliveryPackageModal";

const DeliveryPackageModal = dynamic(() => import("@/components/workspace/DeliveryPackageModal"), {
  ssr: false,
  loading: () => null,
});

const PersonaSimulationSheet = dynamic(() => import("@/components/workspace/PersonaSimulationSheet"), {
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
import WorkspaceStageStrip from "@/components/workspace/WorkspaceStageStrip";
import DerivationGrid from "@/components/workspace/DerivationGrid";
import StrategyRecipePanel from "@/components/workspace/StrategyRecipePanel";
import ClientApprovalPackagePanel from "@/components/workspace/ClientApprovalPackagePanel";
import PerformanceImportPanel from "@/components/campaigns/PerformanceImportPanel";
import HypothesesPanel from "@/components/campaigns/HypothesesPanel";
import LearningsPanel from "@/components/campaigns/LearningsPanel";
import NextExperimentRecommendationCard, {
  type RecipePrefillPayload,
} from "@/components/campaigns/NextExperimentRecommendationCard";
import EstilizarModal from "@/components/workspace/EstilizarModal";
import DerivationReviewSheet from "@/components/workspace/DerivationReviewSheet";
import RegenerateFeedbackDialog, {
  DerivationLoadErrorBanner,
} from "@/components/workspace/RegenerateFeedbackDialog";

import CampaignClientSubtitle from "@/components/campaigns/CampaignClientSubtitle";
import ContextualFeedbackButton from "@/components/feedback/ContextualFeedbackButton";
import CampaignSkeleton from "@/components/campaigns/CampaignSkeleton";
import CampaignErrorState from "@/components/campaigns/CampaignErrorState";
import CampaignNotFoundState from "@/components/campaigns/CampaignNotFoundState";

import { useCampaignWorkspace } from "@/lib/hooks/use-campaign-workspace";
import { useBillingStatus } from "@/lib/hooks/use-billing";
import { resolveConversionGateFromBilling } from "@/lib/billing/conversion-client";
import { useDerivationFlow } from "@/lib/hooks/use-derivation-flow";
import { usePreflightScore } from "@/lib/hooks/use-preflight";
import { useBrandKit } from "@/lib/hooks/use-brand-kit";
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
  const addToast = useAppStore((s) => s.addToast);
  const uploadAsset = useUploadAsset(campaignId);

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
  const {
    isDerivePanelOpen,
    derivePanelSession,
    recipePrefill,
    openDerivePanel,
    closeFlow,
  } = useDerivationFlow();

  const {
    campaign,
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
    savingReferenceId,
    deliveryModalOpen,
    selectedDeliverySource,
    handleDeliveryModalOpenChange,
    goToPilot,
    goToActions,
    goToDerivation,
    goToStyling,
    goToGenerating,
    savePilot,
    handleGenerateDerivations,
    configureAndGenerate,
    handleRestyle,
    handleGenerateLandingPage,
    handleSaveAsReference,
    hasActivePreview,
    previewDerivation,
    showPreviewGate,
    batchCreditEstimate,
    batchCreditBreakdown,
    approvePreviewToBatch,
    handlePreview,
    handleDownloadDerivation,
    handleRegenerateDerivation,
    handleApproveDerivation,
    handleRejectDerivation,
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
    planData,
    generatePlanPending,
    updatePlanStatusPending,
  } = useCampaignWorkspace(campaignId, isNew);

  const openRecommendationFlow = (prefill: RecipePrefillPayload) => {
    openDerivePanel({
      recipeId: prefill.recipeId,
      config: prefill.config,
    });
    goToDerivation();
  };

  const { data: billingStatus } = useBillingStatus();

  const { data: campaignAssets } = useCampaignAssets(campaignId);
  const { data: brandKit } = useBrandKit();
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
      goToPilot,
      goToActions,
      hasDerivations: allDerivations.length > 0,
      openStrategyRecipe: openDerivePanel,
    });
  }, [
    allDerivations.length,
    campaign,
    campaignId,
    goToActions,
    goToPilot,
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

  const previewConversionPayload = useMemo(() => {
    if (!showPreviewGate) return null;
    const requiredCredits = batchCreditBreakdown?.totalCredits ?? batchCreditEstimate ?? 0;
    if (requiredCredits <= 0) return null;
    return resolveConversionGateFromBilling({
      billing: billingStatus,
      requiredCredits,
      returnPath: `/campaigns/${campaignId}?tab=generate&mode=preview`,
      operation: "batch",
    });
  }, [
    showPreviewGate,
    batchCreditBreakdown,
    batchCreditEstimate,
    billingStatus,
    campaignId,
  ]);

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
          ? "Muitas requisições em sequência. Aguarde alguns segundos e tente novamente."
          : "Não foi possível salvar o briefing. Tente novamente.";
      addToast("error", message);
    }
  };

  const handleCloseDerivationFlow = () => {
    closeFlow();
    goToActions();
  };

  const handleDerivePreview = async (patch: {
    generationMode: "art_variation" | "format_adaptation";
    creativeLevel?: "conservative" | "balanced" | "bold" | "extreme";
    ctaVariants?: string[];
    targetFormats?: string[];
  }) => {
    closeFlow();
    goToGenerating();
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
        addToast("error", "Erro ao fazer upload das referências de estilo");
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

  return (
    <PageFrame
      width="workspace"
      className="min-w-0 workspace-scroll-padding shell-offset-bottom-mobile"
    >
      <CampaignWorkspaceHeader
        campaignId={campaignId}
        campaignName={campaign?.name ?? ""}
        isDraft={isDraft}
        isNew={isNew}
        backLabel={tc("backToCampaigns")}
        deleteLabel={tc("deleteDraft")}
        onDelete={handleDeleteClick}
      />

      <WorkspaceStageStrip workspaceState={workspaceState} className="mb-4 border-b border-[var(--border-dim)] pb-4" />

      {campaign && <CampaignClientSubtitle platformsText="" />}

      <CampaignWorkspaceCard
        campaignId={campaignId}
        campaign={campaign}
        workspaceState={workspaceState}
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
        batchCreditEstimate={batchCreditEstimate}
        batchCreditBreakdown={batchCreditBreakdown}
        creditBalance={billingStatus?.creditBalance}
        previewConversionPayload={previewConversionPayload}
        onApprovePreviewBatch={approvePreviewToBatch}
        onReviseStrategyRecipe={() => {
          openDerivePanel();
          goToDerivation();
        }}
        createDerivationsPending={createDerivationsPending}
        onOpenDerivar={() => {
          openDerivePanel();
          goToDerivation();
        }}
        onOpenEstilizar={() => {
          setShowEstilizarModal(true);
          goToStyling();
        }}
        isDerivationsError={isDerivationsError}
        derivationsErrorKind={derivationsErrorKind}
        onRetryDerivations={() => void refetchDerivations()}
        readinessBlocking={readinessBlocking}
        onReadinessOverride={() => setReadinessOverrideActive(true)}
        onRecommendationAccept={openRecommendationFlow}
        onRecommendationEdit={openRecommendationFlow}
      />

      <DerivationReviewSheet
        open={Boolean(reviewDerivationId && reviewDerivation)}
        derivation={reviewDerivation}
        baseAsset={baseAsset}
        styleAsset={styleAsset}
        isRegenerating={regeneratePending}
        isApproving={reviewPending && reviewVariables?.status === "approved"}
        isRejecting={reviewPending && reviewVariables?.status === "rejected"}
        onOpenChange={(open) => {
          if (!open) handleCloseReview();
        }}
        onRegenerateWithFixes={() => {
          if (reviewDerivationId) {
            handleRequestRegenerate(reviewDerivationId);
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
          goToActions();
        }}
        onEstilizarSubmit={handleEstilizarSubmit}
        onDeleteDialogOpenChange={setShowDeleteDialog}
        onConfirmDelete={handleDelete}
      />
    </PageFrame>
  );
}

interface CampaignWorkspaceHeaderProps {
  campaignId: string;
  campaignName: string;
  isDraft: boolean;
  isNew: boolean;
  backLabel: string;
  deleteLabel: string;
  onDelete: () => void;
}

function CampaignWorkspaceHeader({
  campaignId,
  campaignName,
  isDraft,
  isNew,
  backLabel,
  deleteLabel,
  onDelete,
}: CampaignWorkspaceHeaderProps) {
  return (
    <PageHeader
      className="mb-2"
      description={
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          ← {backLabel}
        </Link>
      }
      title={campaignName}
      meta={
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] leading-tight"
          style={{
            backgroundColor: "rgba(0,179,74,0.15)",
            color: "var(--accent-green)",
          }}
        >
          <span
            className="inline-block size-1.5 rounded-full"
            style={{ backgroundColor: "var(--accent-green)" }}
          />
          Piloto
        </span>
      }
      actions={
        <>
          {!isNew ? (
            <ContextualFeedbackButton
              contextKind="campaign"
              campaignId={campaignId}
            />
          ) : null}
          {isDraft && !isNew ? (
            <button
              type="button"
              onClick={onDelete}
              className="min-h-10 shrink-0 rounded-md p-2 text-[var(--accent-rose)] transition-colors hover:bg-[rgba(244,63,94,0.08)]"
              title={deleteLabel}
              aria-label={deleteLabel}
            >
              <Trash2 size={16} />
            </button>
          ) : null}
        </>
      }
    />
  );
}

interface CampaignWorkspaceCardProps {
  campaignId: string;
  campaign: WorkspaceHookResult["campaign"];
  workspaceState: WorkspaceState;
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
  reviewVariables: { id?: string; status: string } | null;
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
  onOpenDerivar: () => void;
  onOpenEstilizar: () => void;
  showPreviewGate?: boolean;
  previewDerivation?: WorkspaceHookResult["previewDerivation"];
  batchCreditEstimate?: number;
  batchCreditBreakdown?: WorkspaceHookResult["batchCreditBreakdown"];
  creditBalance?: number;
  previewConversionPayload?: ReturnType<typeof resolveConversionGateFromBilling>;
  onApprovePreviewBatch?: () => void;
  onReviseStrategyRecipe?: () => void;
  createDerivationsPending?: boolean;
  isDerivationsError?: boolean;
  derivationsErrorKind?: string | null;
  onRetryDerivations?: () => void;
  readinessBlocking?: { blockingCount: number; topIssue?: string } | null;
  onReadinessOverride?: () => void;
  onRecommendationAccept?: (prefill: RecipePrefillPayload) => void;
  onRecommendationEdit?: (prefill: RecipePrefillPayload) => void;
}

function CampaignWorkspaceCard({
  campaignId,
  campaign,
  workspaceState,
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
  onOpenEstilizar,
  showPreviewGate,
  previewDerivation,
  batchCreditEstimate,
  batchCreditBreakdown,
  creditBalance,
  previewConversionPayload,
  onApprovePreviewBatch,
  onReviseStrategyRecipe,
  createDerivationsPending,
  isDerivationsError,
  derivationsErrorKind,
  onRetryDerivations,
  readinessBlocking,
  onReadinessOverride,
  onRecommendationAccept,
  onRecommendationEdit,
}: CampaignWorkspaceCardProps) {
  const tApproval = useTranslations("clientApprovalPackage");

  return (
    <Panel
      className="min-h-[400px]"
      padding={workspaceState === "piloto" ? "md" : "none"}
    >
      {workspaceState === "piloto" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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

      {(workspaceState === "acoes" ||
        workspaceState === "derivando" ||
        workspaceState === "estilizando" ||
        workspaceState === "gerando") && (
        <div className="flex flex-col gap-6 p-4 sm:p-6 lg:flex-row">
          <details className="group lg:hidden rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)]">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
              Briefing e readiness
            </summary>
            <div className="border-t border-[var(--border-dim)] p-4">
              <PilotSidebar
                campaignId={campaignId}
                campaign={{ name: campaign?.name || "", client: campaign?.client }}
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
          <div className="hidden shrink-0 lg:block lg:w-[280px]">
            <PilotSidebar
              campaignId={campaignId}
              campaign={{ name: campaign?.name || "", client: campaign?.client }}
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
          <div className="flex-1 min-w-0 space-y-6">
            <WorkspaceActionBar
              onDerivar={onOpenDerivar}
              onEstilizar={onOpenEstilizar}
              readinessBlocking={readinessBlocking}
              disabled={workspaceState === "gerando"}
            />
            {allDerivations.length > 0 ? (
              <PageSection id="mission-performance" title="Resultados de mídia">
                <PerformanceImportPanel
                  campaignId={campaignId}
                  derivations={allDerivations.map((d, index) => ({
                    id: d.id,
                    label:
                      d.format && d.variantIndex != null
                        ? `${d.format} #${d.variantIndex + 1}`
                        : `Derivação ${index + 1}`,
                  }))}
                />
              </PageSection>
            ) : null}
            {allDerivations.length > 0 ? (
              <PageSection id="mission-hypotheses" title="Hipóteses e comparação">
                <HypothesesPanel
                  campaignId={campaignId}
                  derivations={allDerivations.map((d, index) => ({
                    id: d.id,
                    label:
                      d.format && d.variantIndex != null
                        ? `${d.format} #${d.variantIndex + 1}`
                        : `Derivação ${index + 1}`,
                  }))}
                />
              </PageSection>
            ) : null}
            {allDerivations.length > 0 ? (
              <PageSection id="mission-learnings" title="Memória de performance" className="space-y-4">
                {onRecommendationAccept && onRecommendationEdit ? (
                  <NextExperimentRecommendationCard
                    campaignId={campaignId}
                    onAccept={onRecommendationAccept}
                    onEdit={onRecommendationEdit}
                  />
                ) : null}
                <LearningsPanel campaignId={campaignId} />
              </PageSection>
            ) : null}
            <PageSection id="mission-share" title={tApproval("title")}>
              <ClientApprovalPackagePanel campaignId={campaignId} />
            </PageSection>
            <div id="mission-review">
            <PageSection id="mission-export" title="Derivações">
              {isDerivationsError && derivationsErrorKind ? (
                <div className="mb-3">
                  <DerivationLoadErrorBanner
                    kind={derivationsErrorKind}
                    onRetry={onRetryDerivations}
                  />
                </div>
              ) : null}
              {workspaceState === "gerando" && (
                <p className="text-xs text-[var(--text-secondary)] mb-3 flex items-center gap-2">
                  <span className="inline-block size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Gerando derivações…
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
                  onApprovePreviewBatch &&
                  onReviseStrategyRecipe
                    ? {
                        campaignId,
                        previewId: previewDerivation.id,
                        previewCreditsSpent: previewDerivation.creditCost ?? 5,
                        batchBreakdown:
                          batchCreditBreakdown ?? {
                            jobCount: 0,
                            unitCost: 5,
                            totalCredits: batchCreditEstimate ?? 0,
                            generationMode: "art_variation",
                          },
                        creditBalance,
                        conversionPayload: previewConversionPayload,
                        isApproving: createDerivationsPending,
                        onReviseRecipe: onReviseStrategyRecipe,
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
    </Panel>
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
        title="Excluir campanha"
        description="Tem certeza que deseja excluir esta campanha? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
