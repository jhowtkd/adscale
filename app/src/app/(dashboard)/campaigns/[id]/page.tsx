"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Download, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import type { Derivation, AdPlatform, CampaignStatus } from "@/lib/mock-data";
import { useCampaign, useUpdateCampaign } from "@/lib/hooks/use-campaigns";
import { useDeleteCampaign } from "@/lib/hooks/use-campaigns";
import { useDerivations, useCreateDerivations } from "@/lib/hooks/use-derivations";
import { useRegenerateDerivation } from "@/lib/hooks/use-regenerate";
import { useExport } from "@/lib/hooks/use-export";
import { useReviewDerivation } from "@/lib/hooks/use-review";
import { useCreateDeliveryPackage } from "@/lib/hooks/use-delivery-package";
import DeliveryPackageModal from "@/components/workspace/DeliveryPackageModal";
import type { DeliveryFormat } from "@/components/workspace/DeliveryPackageModal";
import StatusBadge from "@/components/ui/StatusBadge";
import StepIndicator from "@/components/workspace/StepIndicator";
import type { StepKey } from "@/components/workspace/StepIndicator";
import BriefingStep from "@/components/workspace/BriefingStep";
import type { BriefingFormData } from "@/components/workspace/BriefingStep";
import UploadStep from "@/components/workspace/UploadStep";
import DerivationsStep from "@/components/workspace/DerivationsStep";

import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "next-intl";

// ============================================
// Types
// ============================================

type WizardStep = 1 | 2 | 3;

// ============================================
// Step Navigation Labels
// ============================================

// ============================================
// Step transition variants
// ============================================

const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 20 : -20,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -20 : 20,
    opacity: 0,
  }),
};

// ============================================
// Loading State
// ============================================

function CampaignSkeleton() {
  return (
    <div className="max-w-[1100px] mx-auto pb-20 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-[400px] w-full rounded-xl" />
      <div className="flex justify-between">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}

// ============================================
// Main Page Component
// ============================================

export default function CampaignWorkspacePage() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;
  const isNew = campaignId === "new";

  const t = useTranslations("campaign");
  const td = useTranslations("derivation");
  const ts = useTranslations("steps");
  const tc = useTranslations("common");

  // Real data hooks
  const { campaign: realCampaign, isLoading, isError } = useCampaign(campaignId);
  const updateCampaign = useUpdateCampaign(campaignId);
  const deleteCampaign = useDeleteCampaign();

  // Derivation hooks
  const { data: derivationsData } = useDerivations(campaignId);
  const createDerivations = useCreateDerivations(campaignId);

  // Regenerate / export hooks
  const regenerateMutation = useRegenerateDerivation();
  const exportMutation = useExport();
  const reviewMutation = useReviewDerivation();
  const createDeliveryPackage = useCreateDeliveryPackage();

  // Store actions
  const setCurrentPageTitle = useAppStore((s) => s.setCurrentPageTitle);
  const addToast = useAppStore((s) => s.addToast);

  // Combine real campaign with mock fallback for new campaigns
  const campaign = useMemo(() => {
    if (realCampaign) {
      return {
        id: realCampaign.id,
        name: realCampaign.name,
        client: realCampaign.client,
        objective: realCampaign.objective,
        audience: realCampaign.audience,
        platforms: realCampaign.platforms as AdPlatform[],
        tone: realCampaign.tone,
        offer: realCampaign.offer,
        constraints: realCampaign.constraints,
        notes: realCampaign.notes,
        generationMode: realCampaign.generationMode,
        creativeLevel: realCampaign.creativeLevel,
        ctaVariants: realCampaign.ctaVariants,
        targetFormats: realCampaign.targetFormats,
        creativeDiagnosisStatus: realCampaign.creativeDiagnosisStatus,
        creativeDiagnosis: realCampaign.creativeDiagnosis,
        creativeDiagnosisSource: realCampaign.creativeDiagnosisSource,
        status: realCampaign.status,
        variations: realCampaign.variations,
        creditsUsed: realCampaign.creditsUsed,
        lastModified: realCampaign.lastModified,
        createdAt: realCampaign.createdAt,
      };
    }
    if (isNew) {
      return {
        id: "new",
        name: t("new"),
        platforms: [] as AdPlatform[],
        status: "draft" as const,
        variations: 0,
        creditsUsed: 0,
        lastModified: new Date(),
        createdAt: new Date(),
      };
    }
    return null;
  }, [realCampaign, isNew, t]);

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [direction, setDirection] = useState(1);
  const [hasSetInitialStep, setHasSetInitialStep] = useState(false);

  // Auto-set initial step based on campaign progress
  useEffect(() => {
    if (hasSetInitialStep || isLoading || isNew) return;
    if (derivationsData && derivationsData.length > 0) {
      queueMicrotask(() => {
        setCurrentStep(3);
        setHasSetInitialStep(true);
      });
    }
  }, [hasSetInitialStep, isLoading, isNew, derivationsData]);

  // Map DB derivations to UI Derivation type
  const allDerivations: Derivation[] = useMemo(() => {
    const items = derivationsData ?? [];
    const campaignPlatforms = campaign?.platforms?.length
      ? campaign.platforms
      : (["Meta"] as AdPlatform[]);
    return items.map((d, i) => {
      const status: CampaignStatus =
        d.status === "queued" || d.status === "processing"
          ? "generating"
          : (d.status as CampaignStatus) ?? "draft";
      const platform = campaignPlatforms[i % campaignPlatforms.length] ?? "Meta";
      const generationMode = (d.generationMode as "art_variation" | "format_adaptation" | "restyling" | undefined) ?? campaign?.generationMode;
      const variantIndex = d.variantIndex ?? i;
      const format = d.format;
      const ctaText = d.ctaText;
      const name = generationMode === "format_adaptation" && format
        ? `${td("format")} ${format}`
        : `${td("piece")} ${variantIndex + 1}`;
      return {
        id: d.id,
        campaignId: d.campaignId,
        name,
        status,
        platform,
        prompt: d.prompt ?? "",
        creditCost: d.cost ? d.cost / 100 : 2.4,
        imageUrl: d.imageUrl ?? undefined,
        generationMode,
        variantIndex,
        ctaText: ctaText ?? undefined,
        format: format ?? undefined,
        qualityScore: d.qualityScore ?? undefined,
        scoreStatus: d.scoreStatus ?? undefined,
        scoreBreakdown: d.scoreBreakdown ?? undefined,
        scoreIssues: d.scoreIssues ?? undefined,
        regenerationSuggestion: d.regenerationSuggestion ?? undefined,
        scoredAt: d.scoredAt ?? undefined,
        createdAt: d.createdAt,
        completedAt: d.status === "completed" ? d.updatedAt : undefined,
      };
    });
  }, [derivationsData, campaign, td]);

  const approvedDerivation = useMemo(
    () => allDerivations.find((derivation) => derivation.status === "approved"),
    [allDerivations]
  );

  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [selectedDeliverySource, setSelectedDeliverySource] = useState<Derivation | null>(null);

  const handleDeliveryModalOpenChange = useCallback((open: boolean) => {
    setDeliveryModalOpen(open);
    if (!open) {
      setSelectedDeliverySource(null);
    }
  }, []);

  // Set page title
  useEffect(() => {
    setCurrentPageTitle(campaign?.name || tc("campaign"));
  }, [setCurrentPageTitle, campaign?.name, tc]);

  // ============================================
  // Navigation Handlers
  // ============================================

  const goToStep = useCallback(
    (step: WizardStep) => {
      setDirection(step > currentStep ? 1 : -1);
      setCurrentStep(step);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [currentStep]
  );

  const handleNext = useCallback(() => {
    if (currentStep < 3) {
      goToStep((currentStep + 1) as WizardStep);
    }
  }, [currentStep, goToStep]);

  const handlePrev = useCallback(() => {
    if (currentStep > 1) {
      goToStep((currentStep - 1) as WizardStep);
    }
  }, [currentStep, goToStep]);

  const handleStepClick = useCallback(
    (step: StepKey) => {
      if (step < currentStep) {
        goToStep(step as WizardStep);
      }
    },
    [currentStep, goToStep]
  );

  // ============================================
  // Step 1: Briefing Handlers
  // ============================================

  const handleBriefingContinue = useCallback(
    (data: BriefingFormData) => {
      if (campaign && !isNew) {
        updateCampaign.mutate({
          name: data.name,
          client: data.client,
          objective: data.objective,
          audience: data.audience,
          platforms: data.platforms,
          tone: data.tone,
          offer: data.offer,
          constraints: data.constraints,
          notes: data.notes,
          generationMode: data.generationMode,
          ctaVariants: data.ctaVariants.filter((v) => v.trim().length > 0).length > 0
            ? data.ctaVariants
            : undefined,
          targetFormats: data.targetFormat
            ? [data.targetFormat]
            : undefined,
          creativeLevel: data.creativeLevel,
        });
      }
      addToast("success", tc("briefingSaved"));
      handleNext();
    },
    [campaign, isNew, updateCampaign, addToast, tc, handleNext]
  );

  const handleSaveDraft = useCallback(
    (data: BriefingFormData) => {
      if (campaign && !isNew) {
        updateCampaign.mutate({
          name: data.name,
          client: data.client,
          objective: data.objective,
          audience: data.audience,
          platforms: data.platforms,
          tone: data.tone,
          offer: data.offer,
          constraints: data.constraints,
          notes: data.notes,
          status: "draft",
          generationMode: data.generationMode,
          ctaVariants: data.ctaVariants.filter((v) => v.trim().length > 0).length > 0
            ? data.ctaVariants
            : undefined,
          targetFormats: data.targetFormat
            ? [data.targetFormat]
            : undefined,
          creativeLevel: data.creativeLevel,
        });
      }
      addToast("info", tc("draftSaved"));
    },
    [campaign, isNew, updateCampaign, addToast, tc]
  );

  const handleGenerateDerivations = useCallback((options?: { preview?: boolean }) => {
    if (createDerivations.isPending) return;
    createDerivations.mutate(options, {
      onSuccess: () => {
        addToast("success", options?.preview ? tc("previewQueued") : tc("derivationsQueued"));
        if (!options?.preview) {
          goToStep(3);
        }
        if (campaign && !isNew) {
          updateCampaign.mutate({ status: "generating" });
        }
      },
      onError: () => {
        addToast("error", options?.preview ? tc("failedQueuePreview") : tc("failedQueueDerivations"));
      },
    });
  }, [createDerivations, goToStep, campaign, isNew, updateCampaign, addToast, tc]);

  // ============================================
  // Step 2: Upload Handlers
  // ============================================

  const handleUploadContinue = useCallback(() => {
    handleGenerateDerivations();
  }, [handleGenerateDerivations]);

  const handleGeneratePreview = useCallback(() => {
    handleGenerateDerivations({ preview: true });
  }, [handleGenerateDerivations]);

  const hasActivePreview = useMemo(() => {
    return allDerivations.some((d) => d.isPreview && ["queued", "processing", "generating", "completed"].includes(d.status));
  }, [allDerivations]);

  // ============================================
  // Step 3: Derivations Handlers
  // ============================================

  const handlePreview = useCallback(
    () => {
      addToast("info", tc("openingComparison"));
    },
    [addToast, tc]
  );

  const handleDownloadDerivation = useCallback(
    (id: string) => {
      exportMutation.mutate({
        type: "individual",
        derivationId: id,
        format: "png",
      });
    },
    [exportMutation]
  );

  const handleRegenerateDerivation = useCallback(
    (id: string, feedback?: string) => {
      regenerateMutation.mutate({ id, feedback });
    },
    [regenerateMutation]
  );


  // ============================================
  // Step 3: Gallery Review Handlers (inline in DerivationsStep)
  // ============================================

  const handleApproveDerivation = useCallback(
    (id: string) => {
      reviewMutation.mutate({ id, status: "approved" });
    },
    [reviewMutation]
  );

  const handleRejectDerivation = useCallback(
    (id: string) => {
      reviewMutation.mutate({ id, status: "rejected" });
    },
    [reviewMutation]
  );

  const handleCreateDeliveryPackage = useCallback(
    (id: string) => {
      const derivation = allDerivations.find((d) => d.id === id);
      if (derivation) {
        setSelectedDeliverySource(derivation);
        setDeliveryModalOpen(true);
      }
    },
    [allDerivations]
  );

  const handleConfirmDeliveryPackage = useCallback(
    (formats: DeliveryFormat[]) => {
      if (!selectedDeliverySource) return;
      createDeliveryPackage.mutate(
        { derivationId: selectedDeliverySource.id, formats },
        {
          onSuccess: () => {
            addToast("success", tc("packageQueued"));
            handleDeliveryModalOpenChange(false);
          },
          onError: () => {
            addToast("error", tc("packageFailed"));
          },
        }
      );
    },
    [selectedDeliverySource, createDeliveryPackage, addToast, tc, handleDeliveryModalOpenChange]
  );

  const handleExportDerivation = useCallback(
    (id: string, format: string) => {
      exportMutation.mutate({
        type: "individual",
        derivationId: id,
        format: format as "png" | "jpeg" | "webp",
      });
    },
    [exportMutation]
  );

  // ============================================
  // Render Step Content
  // ============================================

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <BriefingStep
            key={campaign?.id ?? "new"}
            campaign={campaign}
            onContinue={handleBriefingContinue}
            onSaveDraft={handleSaveDraft}
          />
        );
      case 2:
        return (
          <UploadStep
            campaignId={campaignId}
            onContinue={handleUploadContinue}
            onGeneratePreview={handleGeneratePreview}
            hasPreview={hasActivePreview}
          />
        );
      case 3:
        return (
          <DerivationsStep
            derivations={allDerivations}
            generationMode={campaign?.generationMode}
            onPreview={handlePreview}
            onDownload={handleDownloadDerivation}
            onRegenerate={handleRegenerateDerivation}
            onGenerateMore={handleGenerateDerivations}
            onApprove={handleApproveDerivation}
            onReject={handleRejectDerivation}
            onCreateDeliveryPackage={handleCreateDeliveryPackage}
            approvingId={
              reviewMutation.isPending && reviewMutation.variables?.status === "approved"
                ? reviewMutation.variables.id
                : null
            }
            rejectingId={
              reviewMutation.isPending && reviewMutation.variables?.status === "rejected"
                ? reviewMutation.variables.id
                : null
            }
            regeneratingId={regenerateMutation.isPending ? regenerateMutation.variables?.id ?? null : null}
            isGeneratingMore={createDerivations.isPending}
          />
        );
      default:
        return null;
    }
  };

  // ============================================
  // Step Navigation Labels
  // ============================================

  const getStepNavLabel = (step: WizardStep, direction: "prev" | "next") => {
    switch (step) {
      case 1:
        return direction === "prev" ? "" : ts("continueToUpload");
      case 2:
        return direction === "prev" ? ts("backToBrief") : ts("startGeneration");
      case 3:
        return direction === "prev" ? ts("backToUpload") : "";
      default:
        return "";
    }
  };

  // ============================================
  // Render
  // ============================================

  if (isLoading && !isNew) {
    return <CampaignSkeleton />;
  }

  if (isError && !isNew) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
          {tc("errorLoadingCampaign")}
        </h2>
        <Link
          href="/campaigns"
          className="text-sm text-[var(--accent-mint)] hover:underline"
        >
          {tc("backToCampaigns")}
        </Link>
      </div>
    );
  }

  if (!campaign && !isNew) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
          {tc("campaignNotFound")}
        </h2>
        <Link
          href="/campaigns"
          className="text-sm text-[var(--accent-blue)] hover:underline"
        >
          {tc("backToCampaigns")}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto pb-20">
      {/* ---- Page Header ---- */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between mb-2"
      >
        <div className="flex items-center gap-4">
          {/* Back button */}
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronLeft size={16} />
            {tc("backToCampaigns")}
          </Link>

          {/* Campaign title + status */}
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">
              {campaign?.name || t("new")}
            </h1>
            {campaign?.status && <StatusBadge status={campaign.status} />}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              addToast("info", tc("draftSaved"));
            }}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] hover:border-[var(--border-medium)] active:scale-[0.98]"
          >
            <Save size={14} />
            {tc("saveDraft")}
          </button>
          {campaign?.status === "draft" && !isNew && (
            <button
              onClick={() => {
                if (confirm(tc("confirmDeleteDraft"))) {
                  deleteCampaign.mutate(campaignId, {
                    onSuccess: () => {
                      addToast("success", tc("draftDeleted"));
                      router.push("/campaigns");
                    },
                    onError: () => {
                      addToast("error", tc("failedDeleteDraft"));
                    },
                  });
                }
              }}
              className="p-2 rounded-md text-[var(--accent-rose)] hover:bg-[rgba(244,63,94,0.08)] transition-colors"
              title={tc("deleteDraft")}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </motion.div>

      {/* Client name if available */}
      {campaign && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-sm text-[var(--text-muted)] ml-[120px] mb-4"
        >
          {campaign.platforms?.join(", ") || tc("noPlatformsSet")}
        </motion.p>
      )}

      {/* ---- Step Indicator ---- */}
      <StepIndicator currentStep={currentStep} onStepClick={handleStepClick} />

      {/* ---- Step Content ---- */}
      <div
        className={cn(
          "bg-[var(--surface-base)] rounded-xl border border-[var(--border-dim)] min-h-[400px]",
          currentStep === 1 && "p-6 md:p-8",
          currentStep === 2 && "p-6 md:p-8",
          currentStep === 3 && "p-6"
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
            {renderStepContent()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ---- Delivery Package Modal ---- */}
      {selectedDeliverySource && (
        <DeliveryPackageModal
          open={deliveryModalOpen}
          sourceFormat={selectedDeliverySource.format ?? null}
          isSubmitting={createDeliveryPackage.isPending}
          onOpenChange={handleDeliveryModalOpenChange}
          onConfirm={handleConfirmDeliveryPackage}
        />
      )}

      {/* ---- Navigation Footer ---- */}
      {currentStep !== 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center justify-between mt-6 max-w-[960px] mx-auto px-4"
        >
          <button
            onClick={handlePrev}
            className={cn(
              "inline-flex items-center rounded-md px-5 py-2.5 text-sm font-medium transition-all duration-200",
              "bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] hover:border-[var(--border-medium)] active:scale-[0.98]"
            )}
          >
            {currentStep > 1 ? getStepNavLabel(currentStep, "prev") : ""}
          </button>

          {currentStep === 3 && approvedDerivation ? (
            <button
              onClick={() => handleExportDerivation(approvedDerivation.id, "png")}
              disabled={exportMutation.isPending}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-semibold transition-all duration-200 shadow-sm",
                exportMutation.isPending
                  ? "bg-[var(--surface-raised)] text-[var(--text-muted)] border border-[var(--border-dim)] cursor-default"
                  : "bg-[var(--accent-mint)] text-white hover:bg-[var(--accent-mint-light)] hover:-translate-y-px active:scale-[0.98]"
              )}
            >
              <Download size={14} />
              {exportMutation.isPending ? tc("loading") : "Baixar arte aprovada"}
            </button>
          ) : (
            <button
              onClick={currentStep === 2 ? () => handleGenerateDerivations() : handleNext}
              disabled={currentStep === 2 || currentStep === 3 || createDerivations.isPending}
              className={cn(
                "inline-flex items-center rounded-md px-6 py-2.5 text-sm font-medium transition-all duration-200",
                currentStep === 2 || currentStep === 3 || createDerivations.isPending
                  ? "bg-[var(--surface-raised)] text-[var(--text-muted)] border border-[var(--border-dim)] cursor-default"
                  : "bg-[var(--accent-mint)] text-white hover:bg-[var(--accent-mint-light)] hover:-translate-y-px active:scale-[0.98]"
              )}
            >
              {createDerivations.isPending ? tc("loading") : getStepNavLabel(currentStep, "next")}
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
}
