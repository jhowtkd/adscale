"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import dynamic from "next/dynamic";

const DeliveryPackageModal = dynamic(() => import("@/components/workspace/DeliveryPackageModal"), {
  ssr: false,
  loading: () => null,
});

const PersonaSimulationModal = dynamic(() => import("@/components/workspace/PersonaSimulationModal"), {
  ssr: false,
  loading: () => null,
});

import StepIndicator from "@/components/workspace/StepIndicator";
import BriefingStep from "@/components/workspace/BriefingStep";
import UploadStep from "@/components/workspace/UploadStep";
import PlanStep from "@/components/workspace/PlanStep";
import DerivationsStep from "@/components/workspace/DerivationsStep";

import CampaignWorkspaceHeader from "@/components/campaigns/CampaignWorkspaceHeader";
import CampaignClientSubtitle from "@/components/campaigns/CampaignClientSubtitle";
import WizardNavigationFooter from "@/components/campaigns/WizardNavigationFooter";
import CampaignSkeleton from "@/components/campaigns/CampaignSkeleton";
import CampaignErrorState from "@/components/campaigns/CampaignErrorState";
import CampaignNotFoundState from "@/components/campaigns/CampaignNotFoundState";

import { useCampaignWorkspace } from "@/lib/hooks/use-campaign-workspace";
import { useTranslations } from "next-intl";

const stepVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 20 : -20, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -20 : 20, opacity: 0 }),
};

export default function CampaignWorkspacePage() {
  const params = useParams();
  const campaignId = params.id as string;
  const isNew = campaignId === "new";
  const tc = useTranslations("common");
  const addToast = useAppStore((s) => s.addToast);

  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [selectedSimulationId, setSelectedSimulationId] = useState<string | null>(null);

  const {
    campaign,
    isLoading,
    isError,
    allDerivations,
    approvedDerivation,
    currentStep,
    direction,
    savingReferenceId,
    deliveryModalOpen,
    selectedDeliverySource,
    handleDeliveryModalOpenChange,
    handlePrev,
    handleStepClick,
    handleBriefingContinue,
    handleSaveDraft,
    handleGenerateDerivations,
    handleContinueToPlan,
    handleSkipPlan,
    handleGeneratePreview,
    handleApprovePlanAndGenerate,
    handleGenerateLandingPage,
    handleSaveAsReference,
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
    getStepNavLabel,
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
  } = useCampaignWorkspace(campaignId, isNew);

  const handleSimulatePersonas = (derivationId: string) => {
    setSelectedSimulationId(derivationId);
    setPersonaModalOpen(true);
  };

  const handleClosePersonaModal = () => {
    setPersonaModalOpen(false);
    setSelectedSimulationId(null);
  };

  if (isLoading && !isNew) return <CampaignSkeleton />;
  if (isError && !isNew) return <CampaignErrorState />;
  if (!campaign && !isNew) return <CampaignNotFoundState />;

  return (
    <div className="max-w-[1100px] min-w-0 mx-auto pb-20">
      <CampaignWorkspaceHeader
        campaignName={campaign?.name || ""}
        status={campaign?.status}
        isNew={isNew}
        isDraft={campaign?.status === "draft"}
        onSaveDraft={() => addToast("info", tc("draftSaved"))}
        onDelete={handleDelete}
      />

      {campaign && (
        <CampaignClientSubtitle platformsText={campaign.platforms?.join(", ")} />
      )}

      <StepIndicator currentStep={currentStep} onStepClick={handleStepClick} />

      <div
        className={cn(
          "bg-[var(--surface-base)] rounded-xl border border-[var(--border-dim)] min-h-[400px]",
          currentStep === 1 && "p-6 md:p-8",
          currentStep === 2 && "p-6 md:p-8",
          currentStep === 3 && "p-6",
          currentStep === 4 && "p-6"
        )}
      >
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "tween", duration: 0.2, ease: [0.4, 0, 0.2, 1] as const },
              opacity: { duration: 0.2 },
            }}
          >
            {currentStep === 1 && campaign && (
              <BriefingStep
                key={campaign.id}
                campaign={campaign}
                onContinue={handleBriefingContinue}
                onSaveDraft={handleSaveDraft}
              />
            )}
            {currentStep === 2 && (
              <UploadStep
                campaignId={campaignId}
                onContinueToPlan={handleContinueToPlan}
                onSkipPlan={handleSkipPlan}
                onGeneratePreview={handleGeneratePreview}
              />
            )}
            {currentStep === 3 && (
              <PlanStep
                campaignId={campaignId}
                onApproveAndGenerate={handleApprovePlanAndGenerate}
                onSkipPlan={handleSkipPlan}
                onBack={handlePrev}
              />
            )}
            {currentStep === 4 && (
              <DerivationsStep
                derivations={allDerivations}
                campaignId={campaignId}
                generationMode={campaign?.generationMode}
                onPreview={handlePreview}
                onDownload={handleDownloadDerivation}
                onRegenerate={handleRegenerateDerivation}
                onGenerateMore={handleGenerateDerivations}
                onApprove={handleApproveDerivation}
                onReject={handleRejectDerivation}
                onCreateDeliveryPackage={handleCreateDeliveryPackage}
                onRunQa={handleRunQa}
                onSaveAsReference={campaign?.clientProfileId ? handleSaveAsReference : undefined}
                onGenerateLandingPage={handleGenerateLandingPage}
                onSimulatePersonas={handleSimulatePersonas}
                qaAnalyzingId={creativeQaPending ? creativeQaVariables?.derivationId ?? null : null}
                savingReferenceId={savingReferenceId}
                approvingId={reviewPending && reviewVariables?.status === "approved" ? reviewVariables.id : null}
                rejectingId={reviewPending && reviewVariables?.status === "rejected" ? reviewVariables.id : null}
                regeneratingId={regeneratePending ? regenerateVariables?.id ?? null : null}
                landingPageGeneratingId={landingPagePending ? landingPageVariables?.derivationId ?? null : null}
                isGeneratingMore={createDerivationsPending}
              />
            )}
          </motion.div>
        </AnimatePresence>
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

      <WizardNavigationFooter
        currentStep={currentStep}
        approvedDerivation={approvedDerivation}
        exportMutationPending={exportPending}
        onPrev={handlePrev}
        onExport={handleExportDerivation}
        getStepNavLabel={getStepNavLabel}
      />
    </div>
  );
}
