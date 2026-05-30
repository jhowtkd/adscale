"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import dynamic from "next/dynamic";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

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
import EstilizarModal from "@/components/workspace/EstilizarModal";

import CampaignClientSubtitle from "@/components/campaigns/CampaignClientSubtitle";
import CampaignSkeleton from "@/components/campaigns/CampaignSkeleton";
import CampaignErrorState from "@/components/campaigns/CampaignErrorState";
import CampaignNotFoundState from "@/components/campaigns/CampaignNotFoundState";

import { useCampaignWorkspace } from "@/lib/hooks/use-campaign-workspace";
import { useTranslations } from "next-intl";

export default function CampaignWorkspacePage() {
  const params = useParams();
  const campaignId = params.id as string;
  const isNew = campaignId === "new";
  const tc = useTranslations("common");
  const addToast = useAppStore((s) => s.addToast);

  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [selectedSimulationId, setSelectedSimulationId] = useState<string | null>(null);

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
  const [pilotAssetId, setPilotAssetId] = useState<string | null>(null);
  const [showDerivarModal, setShowDerivarModal] = useState(false);
  const [showEstilizarModal, setShowEstilizarModal] = useState(false);

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
    setSelectedSimulationId(derivationId);
    setPersonaModalOpen(true);
  };

  const handleClosePersonaModal = () => {
    setPersonaModalOpen(false);
    setSelectedSimulationId(null);
  };

  const handleAssetUploaded = (assetId: string) => setPilotAssetId(assetId);
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
    if (pilotAssetId) {
      savePilot(pilotAssetId, briefing);
    }
  };

  const handleSkipBriefing = () => {
    if (pilotAssetId) {
      savePilot(pilotAssetId, {});
    } else {
      goToActions();
    }
  };

  if (isLoading && !isNew) return <CampaignSkeleton />;
  if (isError && !isNew) return <CampaignErrorState />;
  if (!campaign && !isNew) return <CampaignNotFoundState />;

  const isDraft = campaign?.status === "draft";

  return (
    <div className="max-w-[1100px] min-w-0 mx-auto pb-20">
      {/* Simplified Header */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            ← {tc("backToCampaigns")}
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="min-w-0 truncate text-lg font-semibold text-[var(--text-primary)]">
              {campaign?.name || ""}
            </h1>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-[0.2em] leading-tight"
              style={{
                backgroundColor: "rgba(0,179,74,0.15)",
                color: "var(--accent-green)",
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "var(--accent-green)" }}
              />
              Piloto
            </span>
          </div>
        </div>
        {isDraft && !isNew && (
          <button
            onClick={handleDeleteClick}
            className="min-h-10 shrink-0 rounded-md p-2 text-[var(--accent-rose)] hover:bg-[rgba(244,63,94,0.08)] transition-colors"
            title={tc("deleteDraft")}
            aria-label={tc("deleteDraft")}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {campaign && <CampaignClientSubtitle platformsText="" />}

      <div
        className={cn(
          "glass-card rounded-xl min-h-[400px]",
          workspaceState === "piloto" && "p-6 md:p-8"
        )}
      >
        {workspaceState === "piloto" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <PilotUploadPanel
              onAssetUploaded={handleAssetUploaded}
              onAnalysisComplete={handleAnalysisComplete}
            />
            <PilotBriefingForm
              analysis={analysis}
              onSubmit={handleBriefingSubmit}
              onSkip={handleSkipBriefing}
            />
          </div>
        )}

        {(workspaceState === "acoes" || workspaceState === "derivando" || workspaceState === "estilizando") && (
          <div className="flex gap-6">
            <PilotSidebar
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
                onDerivar={() => {
                  setShowDerivarModal(true);
                  goToDerivation();
                }}
                onEstilizar={() => {
                  setShowEstilizarModal(true);
                  goToStyling();
                }}
              />
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                  Derivações
                </h2>
                <DerivationGrid
                  derivations={allDerivations}
                  onAddNew={() => setShowDerivarModal(true)}
                />
              </div>
            </div>
          </div>
        )}

        {workspaceState === "gerando" && (
          <div className="flex items-center justify-center h-[400px]">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <p className="text-sm text-[var(--text-secondary)]">Gerando derivações...</p>
            </div>
          </div>
        )}
      </div>

      {selectedDeliverySource && (
        <DeliveryPackageModal
          open={deliveryModalOpen}
          sourceFormat={selectedDeliverySource.format ?? null}
          isDownloading={exportPending}
          isSubmitting={deliveryPackagePending}
          onOpenChange={handleDeliveryModalOpenChange}
          onDownloadCurrent={handleDownloadDeliverySource}
          onConfirm={handleConfirmDeliveryPackage}
        />
      )}

      {selectedSimulationId && (
        <PersonaSimulationModal
          isOpen={personaModalOpen}
          onClose={handleClosePersonaModal}
          sourceType="derivation"
          sourceId={selectedSimulationId}
          campaignName={campaign?.name}
        />
      )}

      <DerivarModal
        open={showDerivarModal}
        onClose={() => {
          setShowDerivarModal(false);
          goToActions();
        }}
        onSelect={(mode, config) => {
          setShowDerivarModal(false);
          handleGenerateDerivations();
        }}
      />

      <EstilizarModal
        open={showEstilizarModal}
        onClose={() => {
          setShowEstilizarModal(false);
          goToActions();
        }}
        onSubmit={(data) => {
          setShowEstilizarModal(false);
          handleGenerateDerivations();
        }}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Excluir campanha"
        description="Tem certeza que deseja excluir esta campanha? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
