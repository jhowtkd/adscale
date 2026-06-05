"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import dynamic from "next/dynamic";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useUploadAsset, useCampaignAssets } from "@/lib/hooks/use-assets";
import type { DeliveryFormat } from "@/components/workspace/DeliveryPackageModal";

const DeliveryPackageModal = dynamic(() => import("@/components/workspace/DeliveryPackageModal"), {
  ssr: false,
  loading: () => null,
});

const PersonaSimulationModal = dynamic(() => import("@/components/workspace/PersonaSimulationModal"), {
  ssr: false,
  loading: () => null,
});

import PilotUploadPanel from "@/components/workspace/PilotUploadPanel";
import PilotBriefingForm from "@/components/workspace/PilotBriefingForm";
import GuidedBriefingPanel from "@/components/workspace/GuidedBriefingPanel";
import PilotSidebar from "@/components/workspace/PilotSidebar";
import {
  answersFromCampaign,
  isBriefWeak,
  type GuidedBriefingHints,
} from "@/server/ai/guided-briefing";
import ActionCards from "@/components/workspace/ActionCards";
import DerivationGrid from "@/components/workspace/DerivationGrid";
import DerivarModal from "@/components/workspace/DerivarModal";
import StrategyRecipePanel from "@/components/workspace/StrategyRecipePanel";
import PreviewGatePanel from "@/components/workspace/PreviewGatePanel";
import ClientApprovalPackagePanel from "@/components/workspace/ClientApprovalPackagePanel";
import ArtVariationConfigModal from "@/components/workspace/ArtVariationConfigModal";
import FormatAdaptationConfigModal from "@/components/workspace/FormatAdaptationConfigModal";
import EstilizarModal from "@/components/workspace/EstilizarModal";
import DerivationReviewModal from "@/components/workspace/DerivationReviewModal";
import RegenerateFeedbackDialog, {
  DerivationLoadErrorBanner,
} from "@/components/workspace/RegenerateFeedbackDialog";

import CampaignClientSubtitle from "@/components/campaigns/CampaignClientSubtitle";
import ContextualFeedbackButton from "@/components/feedback/ContextualFeedbackButton";
import CampaignSkeleton from "@/components/campaigns/CampaignSkeleton";
import CampaignErrorState from "@/components/campaigns/CampaignErrorState";
import CampaignNotFoundState from "@/components/campaigns/CampaignNotFoundState";

import { useCampaignWorkspace } from "@/lib/hooks/use-campaign-workspace";
import { useDerivationFlow, type DerivationIntent } from "@/lib/hooks/use-derivation-flow";
import { usePreflightScore } from "@/lib/hooks/use-preflight";
import { useBrandKit } from "@/lib/hooks/use-brand-kit";
import { useTranslations } from "next-intl";

type WorkspaceHookResult = ReturnType<typeof useCampaignWorkspace>;
type Campaign = NonNullable<WorkspaceHookResult["campaign"]>;
type WorkspaceState = WorkspaceHookResult["workspaceState"];

export default function CampaignWorkspacePage() {
  const params = useParams();
  const campaignId = params.id as string;
  const isNew = campaignId === "new";

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
  const [briefingView, setBriefingView] = useState<"guided" | "full">("guided");
  const [showEstilizarModal, setShowEstilizarModal] = useState(false);
  const {
    isStrategyRecipeOpen,
    isChooserOpen,
    isArtConfigOpen,
    isFormatConfigOpen,
    artConfigIntent,
    formatConfigIntent,
    openChooser,
    openLegacyChooser,
    selectIntent,
    backToChooser,
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
  const { data: preflightData } = usePreflightScore(
    campaignId,
    baseAsset?.id ?? null
  );

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

  const handleBriefingSubmit = (briefing: {
    objective: string;
    audience: string;
    tone: string;
    platforms: string;
    ctaText: string;
    constraints: string;
    product?: string;
    offer?: string;
  }) => {
    if (pilotAssetIdRef.current) {
      savePilot(pilotAssetIdRef.current, briefing);
    }
  };

  const handleGuidedBriefingComplete = (briefing: {
    objective?: string;
    audience?: string;
    tone?: string;
    platforms?: string;
    ctaText?: string;
    constraints?: string;
    product?: string;
    offer?: string;
  }) => {
    if (pilotAssetIdRef.current) {
      savePilot(pilotAssetIdRef.current, {
        ...briefing,
        tone: briefing.tone ?? analysis.suggestedTone,
      });
    }
  };

  const handleSkipBriefing = () => {
    if (pilotAssetIdRef.current) {
      savePilot(pilotAssetIdRef.current, {});
    } else {
      goToActions();
    }
  };

  const handleCloseDerivationFlow = () => {
    closeFlow();
    goToActions();
  };

  const handleArtVariationConfirm = async (config: {
    creativeLevel: "conservative" | "balanced" | "bold" | "extreme";
    ctaVariants: string[];
  }) => {
    closeFlow();
    await configureAndGenerate({
      generationMode: "art_variation",
      creativeLevel: config.creativeLevel,
      ctaVariants: config.ctaVariants,
    });
  };

  const handleFormatAdaptationConfirm = async (config: {
    targetFormats: string[];
  }) => {
    closeFlow();
    await configureAndGenerate({
      generationMode: "format_adaptation",
      targetFormats: config.targetFormats,
    });
  };

  const handleStrategyRecipePreview = async (patch: {
    generationMode: "art_variation" | "format_adaptation";
    creativeLevel: "conservative" | "balanced" | "bold" | "extreme";
    ctaVariants: string[];
    targetFormats?: string[];
  }) => {
    closeFlow();
    goToGenerating();
    await configureAndGenerate(patch, { preview: true });
  };

  const handleOpenLegacyDerivationChooser = () => {
    openLegacyChooser();
  };

  const handleEstilizarSubmit = async (data: {
    styleReferenceFiles: File[];
    intensity: string;
  }) => {
    setShowEstilizarModal(false);

    // Upload style reference files as assets with role="style_reference"
    const styleAssetIds: string[] = [];
    if (data.styleReferenceFiles.length > 0) {
      try {
        const assets = await Promise.all(
          data.styleReferenceFiles.map((file) =>
            uploadAsset.mutateAsync({
            file,
            role: "style_reference",
            })
          )
        );
        styleAssetIds.push(...assets.map((asset) => asset.id));
      } catch {
        addToast("error", "Erro ao fazer upload das referências de estilo");
        return;
      }
    }

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
    <div className="max-w-[1100px] min-w-0 mx-auto pb-20">
      <CampaignWorkspaceHeader
        campaignId={campaignId}
        campaignName={campaign?.name ?? ""}
        isDraft={isDraft}
        isNew={isNew}
        backLabel={tc("backToCampaigns")}
        deleteLabel={tc("deleteDraft")}
        onDelete={handleDeleteClick}
      />

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
        onBriefingSubmit={handleBriefingSubmit}
        onGuidedBriefingComplete={handleGuidedBriefingComplete}
        briefingView={briefingView}
        onBriefingViewChange={setBriefingView}
        guidedBriefingHints={guidedBriefingHints}
        onSkipBriefing={handleSkipBriefing}
        showPreviewGate={showPreviewGate}
        previewDerivation={previewDerivation}
        batchCreditEstimate={batchCreditEstimate}
        onApprovePreviewBatch={approvePreviewToBatch}
        onReviseStrategyRecipe={() => {
          openChooser();
          goToDerivation();
        }}
        createDerivationsPending={createDerivationsPending}
        onOpenDerivar={() => {
          openChooser();
          goToDerivation();
        }}
        onOpenEstilizar={() => {
          setShowEstilizarModal(true);
          goToStyling();
        }}
        isDerivationsError={isDerivationsError}
        derivationsErrorKind={derivationsErrorKind}
        onRetryDerivations={() => void refetchDerivations()}
      />

      <DerivationReviewModal
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
          strategyRecipe: isStrategyRecipeOpen,
          derivationChooser: isChooserOpen,
          artConfig: isArtConfigOpen,
          formatConfig: isFormatConfigOpen,
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
        onStrategyRecipePreview={handleStrategyRecipePreview}
        onOpenLegacyDerivationChooser={handleOpenLegacyDerivationChooser}
        pending={{
          export: exportPending,
          deliveryPackage: deliveryPackagePending,
          derivation: createDerivationsPending,
        }}
        personaSimulation={personaSimulation}
        artConfigIntent={artConfigIntent}
        formatConfigIntent={formatConfigIntent}
        onDeliveryModalOpenChange={handleDeliveryModalOpenChange}
        onDownloadDeliverySource={handleDownloadDeliverySource}
        onConfirmDeliveryPackage={handleConfirmDeliveryPackage}
        onClosePersonaModal={handleClosePersonaModal}
        onCloseDerivationFlow={handleCloseDerivationFlow}
        onSelectDerivationIntent={selectIntent}
        onBackToDerivationChooser={backToChooser}
        onArtVariationConfirm={handleArtVariationConfirm}
        onFormatAdaptationConfirm={handleFormatAdaptationConfirm}
        campaignId={campaignId}
        campaignCreativeLevel={campaign?.creativeLevel}
        campaignCtaVariants={campaign?.ctaVariants}
        suggestedCta={analysis.suggestedCta}
        onCloseEstilizar={() => {
          setShowEstilizarModal(false);
          goToActions();
        }}
        onEstilizarSubmit={handleEstilizarSubmit}
        onDeleteDialogOpenChange={setShowDeleteDialog}
        onConfirmDelete={handleDelete}
      />
    </div>
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
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          ← {backLabel}
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="min-w-0 truncate text-lg font-semibold text-[var(--text-primary)]">
            {campaignName}
          </h1>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-[0.2em] leading-tight"
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
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!isNew && (
          <ContextualFeedbackButton
            contextKind="campaign"
            campaignId={campaignId}
          />
        )}
        {isDraft && !isNew && (
          <button
            type="button"
            onClick={onDelete}
            className="min-h-10 shrink-0 rounded-md p-2 text-[var(--accent-rose)] hover:bg-[rgba(244,63,94,0.08)] transition-colors"
            title={deleteLabel}
            aria-label={deleteLabel}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
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
  onBriefingSubmit: (briefing: {
    objective: string;
    audience: string;
    tone: string;
    platforms: string;
    ctaText: string;
    constraints: string;
    product?: string;
    offer?: string;
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
  briefingView: "guided" | "full";
  onBriefingViewChange: (view: "guided" | "full") => void;
  guidedBriefingHints: GuidedBriefingHints;
  onSkipBriefing: () => void;
  onOpenDerivar: () => void;
  onOpenEstilizar: () => void;
  showPreviewGate?: boolean;
  previewDerivation?: WorkspaceHookResult["previewDerivation"];
  batchCreditEstimate?: number;
  onApprovePreviewBatch?: () => void;
  onReviseStrategyRecipe?: () => void;
  createDerivationsPending?: boolean;
  isDerivationsError?: boolean;
  derivationsErrorKind?: string | null;
  onRetryDerivations?: () => void;
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
  onBriefingSubmit,
  onGuidedBriefingComplete,
  briefingView,
  onBriefingViewChange,
  guidedBriefingHints,
  onSkipBriefing,
  onOpenDerivar,
  onOpenEstilizar,
  showPreviewGate,
  previewDerivation,
  batchCreditEstimate,
  onApprovePreviewBatch,
  onReviseStrategyRecipe,
  createDerivationsPending,
  isDerivationsError,
  derivationsErrorKind,
  onRetryDerivations,
}: CampaignWorkspaceCardProps) {
  return (
    <div
      className={cn(
        "glass-card rounded-xl min-h-[400px]",
        workspaceState === "piloto" && "p-6 md:p-8"
      )}
    >
      {workspaceState === "piloto" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <PilotUploadPanel
            campaignId={campaignId}
            onAssetUploaded={onAssetUploaded}
            onAnalysisComplete={onAnalysisComplete}
          />
          {campaign &&
          isBriefWeak({
            product: campaign.product,
            offer: campaign.offer,
            audience: campaign.audience,
            objective: campaign.objective,
          }) &&
          briefingView === "guided" ? (
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
              onOpenFullForm={() => onBriefingViewChange("full")}
            />
          ) : (
            <PilotBriefingForm
              key={[
                analysis.detectedConcept,
                analysis.suggestedObjective,
                analysis.suggestedAudience,
                analysis.suggestedTone,
                analysis.suggestedPlatforms,
                analysis.suggestedCta,
              ].join("|")}
              analysis={analysis}
              onSubmit={onBriefingSubmit}
              onSkip={onSkipBriefing}
            />
          )}
        </div>
      )}

      {(workspaceState === "acoes" ||
        workspaceState === "derivando" ||
        workspaceState === "estilizando" ||
        workspaceState === "gerando") && (
        <div className="flex gap-6">
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
          />
          <div className="flex-1 min-w-0 space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                Ações disponíveis
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Escolha uma ação para gerar novas variações do criativo.
              </p>
            </div>
            <ActionCards
              onDerivar={onOpenDerivar}
              onEstilizar={onOpenEstilizar}
            />
            <ClientApprovalPackagePanel campaignId={campaignId} />
            {showPreviewGate && previewDerivation && onApprovePreviewBatch && onReviseStrategyRecipe && (
              <PreviewGatePanel
                preview={{
                  id: previewDerivation.id,
                  name: previewDerivation.name,
                  imageUrl: previewDerivation.imageUrl,
                  status: previewDerivation.status,
                  qualityScore: previewDerivation.qualityScore,
                  qualityVerdict: previewDerivation.qualityVerdict,
                  creditCost: previewDerivation.creditCost,
                }}
                previewCreditsSpent={5}
                batchCredits={batchCreditEstimate ?? 0}
                isApproving={createDerivationsPending}
                onReviseRecipe={onReviseStrategyRecipe}
                onApproveBatch={onApprovePreviewBatch}
              />
            )}
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                Derivações
              </h2>
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
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CampaignWorkspaceModalVisibility {
  delivery: boolean;
  strategyRecipe: boolean;
  derivationChooser: boolean;
  artConfig: boolean;
  formatConfig: boolean;
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
  artConfigIntent: "manual_art" | "auto_art" | null;
  formatConfigIntent: "single_format" | "batch_format" | null;
  onDeliveryModalOpenChange: (open: boolean) => void;
  onDownloadDeliverySource: () => void;
  onConfirmDeliveryPackage: (formats: DeliveryFormat[]) => void;
  onClosePersonaModal: () => void;
  onCloseDerivationFlow: () => void;
  onSelectDerivationIntent: (intent: DerivationIntent) => void;
  onBackToDerivationChooser: () => void;
  onArtVariationConfirm: (config: {
    creativeLevel: "conservative" | "balanced" | "bold" | "extreme";
    ctaVariants: string[];
  }) => void | Promise<void>;
  onFormatAdaptationConfirm: (config: { targetFormats: string[] }) => void | Promise<void>;
  campaignId: string;
  campaignCreativeLevel?: string | null;
  campaignCtaVariants?: string[] | null;
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
  onStrategyRecipePreview: (patch: {
    generationMode: "art_variation" | "format_adaptation";
    creativeLevel: "conservative" | "balanced" | "bold" | "extreme";
    ctaVariants: string[];
    targetFormats?: string[];
  }) => void | Promise<void>;
  onOpenLegacyDerivationChooser: () => void;
}

function CampaignWorkspaceModals({
  campaign,
  selectedDeliverySource,
  visibility,
  pending,
  personaSimulation,
  artConfigIntent,
  formatConfigIntent,
  onDeliveryModalOpenChange,
  onDownloadDeliverySource,
  onConfirmDeliveryPackage,
  onClosePersonaModal,
  onCloseDerivationFlow,
  onSelectDerivationIntent,
  onBackToDerivationChooser,
  onArtVariationConfirm,
  onFormatAdaptationConfirm,
  campaignId,
  campaignCreativeLevel,
  campaignCtaVariants,
  suggestedCta,
  onCloseEstilizar,
  onEstilizarSubmit,
  onDeleteDialogOpenChange,
  onConfirmDelete,
  readiness,
  brandKit,
  campaignRecipeContext,
  onStrategyRecipePreview,
  onOpenLegacyDerivationChooser,
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
        <PersonaSimulationModal
          isOpen={personaSimulation.isOpen}
          onClose={onClosePersonaModal}
          sourceType="derivation"
          sourceId={personaSimulation.selectedId}
          campaignName={campaign?.name}
        />
      )}

      <StrategyRecipePanel
        open={visibility.strategyRecipe}
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
        isSubmitting={pending.derivation}
        onClose={onCloseDerivationFlow}
        onOpenAdvanced={onOpenLegacyDerivationChooser}
        onGeneratePreview={onStrategyRecipePreview}
      />

      <DerivarModal
        open={visibility.derivationChooser}
        onClose={onCloseDerivationFlow}
        onSelect={onSelectDerivationIntent}
      />

      {artConfigIntent && (
        <ArtVariationConfigModal
          open={visibility.artConfig}
          intent={artConfigIntent}
          campaignId={campaignId}
          campaignCreativeLevel={campaignCreativeLevel}
          campaignCtaVariants={campaignCtaVariants}
          suggestedCta={suggestedCta}
          isSubmitting={pending.derivation}
          onBack={onBackToDerivationChooser}
          onClose={onCloseDerivationFlow}
          onConfirm={onArtVariationConfirm}
        />
      )}

      {formatConfigIntent && (
        <FormatAdaptationConfigModal
          open={visibility.formatConfig}
          intent={formatConfigIntent}
          isSubmitting={pending.derivation}
          onBack={onBackToDerivationChooser}
          onClose={onCloseDerivationFlow}
          onConfirm={onFormatAdaptationConfirm}
        />
      )}

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
