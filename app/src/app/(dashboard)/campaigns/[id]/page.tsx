"use client";

import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import dynamic from "next/dynamic";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useUploadAsset } from "@/lib/hooks/use-assets";
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
import PilotSidebar from "@/components/workspace/PilotSidebar";
import ActionCards from "@/components/workspace/ActionCards";
import DerivationGrid from "@/components/workspace/DerivationGrid";
import DerivarModal from "@/components/workspace/DerivarModal";
import ArtVariationConfigModal from "@/components/workspace/ArtVariationConfigModal";
import FormatAdaptationConfigModal from "@/components/workspace/FormatAdaptationConfigModal";
import EstilizarModal from "@/components/workspace/EstilizarModal";

import CampaignClientSubtitle from "@/components/campaigns/CampaignClientSubtitle";
import CampaignSkeleton from "@/components/campaigns/CampaignSkeleton";
import CampaignErrorState from "@/components/campaigns/CampaignErrorState";
import CampaignNotFoundState from "@/components/campaigns/CampaignNotFoundState";

import { useCampaignWorkspace } from "@/lib/hooks/use-campaign-workspace";
import { useDerivationFlow, type DerivationIntent } from "@/lib/hooks/use-derivation-flow";
import { useBootstrapNewCampaign } from "@/lib/hooks/use-bootstrap-new-campaign";
import { useTranslations } from "next-intl";

type WorkspaceHookResult = ReturnType<typeof useCampaignWorkspace>;
type Campaign = NonNullable<WorkspaceHookResult["campaign"]>;
type WorkspaceState = WorkspaceHookResult["workspaceState"];

export default function CampaignWorkspacePage() {
  const params = useParams();
  const campaignId = params.id as string;
  const isNew = campaignId === "new";
  const { isBootstrapping, bootstrapError } = useBootstrapNewCampaign(campaignId);
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
    isChooserOpen,
    isArtConfigOpen,
    isFormatConfigOpen,
    artConfigIntent,
    formatConfigIntent,
    openChooser,
    selectIntent,
    backToChooser,
    closeFlow,
  } = useDerivationFlow();

  const {
    campaign,
    isLoading,
    isError,
    allDerivations,
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
  const handleBriefingSubmit = (briefing: {
    objective: string;
    audience: string;
    tone: string;
    platforms: string;
    ctaText: string;
    constraints: string;
  }) => {
    if (pilotAssetIdRef.current) {
      savePilot(pilotAssetIdRef.current, briefing);
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

  if (isBootstrapping) return <CampaignSkeleton />;
  if (bootstrapError) return <CampaignErrorState />;
  if (isLoading && !isNew) return <CampaignSkeleton />;
  if (isError && !isNew) return <CampaignErrorState />;
  if (!campaign && !isNew) return <CampaignNotFoundState />;

  const isDraft = campaign?.status === "draft";

  return (
    <div className="max-w-[1100px] min-w-0 mx-auto pb-20">
      <CampaignWorkspaceHeader
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
        onSkipBriefing={handleSkipBriefing}
        onOpenDerivar={() => {
          openChooser();
          goToDerivation();
        }}
        onOpenEstilizar={() => {
          setShowEstilizarModal(true);
          goToStyling();
        }}
      />

      <CampaignWorkspaceModals
        campaign={campaign}
        selectedDeliverySource={selectedDeliverySource}
        deliveryModalOpen={deliveryModalOpen}
        exportPending={exportPending}
        deliveryPackagePending={deliveryPackagePending}
        personaSimulation={personaSimulation}
        isChooserOpen={isChooserOpen}
        isArtConfigOpen={isArtConfigOpen}
        isFormatConfigOpen={isFormatConfigOpen}
        artConfigIntent={artConfigIntent}
        formatConfigIntent={formatConfigIntent}
        showEstilizarModal={showEstilizarModal}
        showDeleteDialog={showDeleteDialog}
        onDeliveryModalOpenChange={handleDeliveryModalOpenChange}
        onDownloadDeliverySource={handleDownloadDeliverySource}
        onConfirmDeliveryPackage={handleConfirmDeliveryPackage}
        onClosePersonaModal={handleClosePersonaModal}
        onCloseDerivationFlow={handleCloseDerivationFlow}
        onSelectDerivationIntent={selectIntent}
        onBackToDerivationChooser={backToChooser}
        onArtVariationConfirm={handleArtVariationConfirm}
        onFormatAdaptationConfirm={handleFormatAdaptationConfirm}
        derivationSubmitting={createDerivationsPending}
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
  campaignName: string;
  isDraft: boolean;
  isNew: boolean;
  backLabel: string;
  deleteLabel: string;
  onDelete: () => void;
}

function CampaignWorkspaceHeader({
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
  }) => void;
  onSkipBriefing: () => void;
  onOpenDerivar: () => void;
  onOpenEstilizar: () => void;
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
  onSkipBriefing,
  onOpenDerivar,
  onOpenEstilizar,
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
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                Derivações
              </h2>
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

interface CampaignWorkspaceModalsProps {
  campaign: WorkspaceHookResult["campaign"];
  selectedDeliverySource: WorkspaceHookResult["selectedDeliverySource"];
  deliveryModalOpen: boolean;
  exportPending: boolean;
  deliveryPackagePending: boolean;
  personaSimulation: { isOpen: boolean; selectedId: string | null };
  isChooserOpen: boolean;
  isArtConfigOpen: boolean;
  isFormatConfigOpen: boolean;
  artConfigIntent: "manual_art" | "auto_art" | null;
  formatConfigIntent: "single_format" | "batch_format" | null;
  showEstilizarModal: boolean;
  showDeleteDialog: boolean;
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
  derivationSubmitting: boolean;
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
}

function CampaignWorkspaceModals({
  campaign,
  selectedDeliverySource,
  deliveryModalOpen,
  exportPending,
  deliveryPackagePending,
  personaSimulation,
  isChooserOpen,
  isArtConfigOpen,
  isFormatConfigOpen,
  artConfigIntent,
  formatConfigIntent,
  showEstilizarModal,
  showDeleteDialog,
  onDeliveryModalOpenChange,
  onDownloadDeliverySource,
  onConfirmDeliveryPackage,
  onClosePersonaModal,
  onCloseDerivationFlow,
  onSelectDerivationIntent,
  onBackToDerivationChooser,
  onArtVariationConfirm,
  onFormatAdaptationConfirm,
  derivationSubmitting,
  campaignId,
  campaignCreativeLevel,
  campaignCtaVariants,
  suggestedCta,
  onCloseEstilizar,
  onEstilizarSubmit,
  onDeleteDialogOpenChange,
  onConfirmDelete,
}: CampaignWorkspaceModalsProps) {
  return (
    <>
      {selectedDeliverySource && (
        <DeliveryPackageModal
          open={deliveryModalOpen}
          sourceFormat={selectedDeliverySource.format ?? null}
          isDownloading={exportPending}
          isSubmitting={deliveryPackagePending}
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

      <DerivarModal
        open={isChooserOpen}
        onClose={onCloseDerivationFlow}
        onSelect={onSelectDerivationIntent}
      />

      {artConfigIntent && (
        <ArtVariationConfigModal
          open={isArtConfigOpen}
          intent={artConfigIntent}
          campaignId={campaignId}
          campaignCreativeLevel={campaignCreativeLevel}
          campaignCtaVariants={campaignCtaVariants}
          suggestedCta={suggestedCta}
          isSubmitting={derivationSubmitting}
          onBack={onBackToDerivationChooser}
          onClose={onCloseDerivationFlow}
          onConfirm={onArtVariationConfirm}
        />
      )}

      {formatConfigIntent && (
        <FormatAdaptationConfigModal
          open={isFormatConfigOpen}
          intent={formatConfigIntent}
          isSubmitting={derivationSubmitting}
          onBack={onBackToDerivationChooser}
          onClose={onCloseDerivationFlow}
          onConfirm={onFormatAdaptationConfirm}
        />
      )}

      <EstilizarModal
        open={showEstilizarModal}
        onClose={onCloseEstilizar}
        onSubmit={onEstilizarSubmit}
      />

      <ConfirmDialog
        open={showDeleteDialog}
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
