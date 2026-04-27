"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Save, Trash2, Sparkles } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import type { Derivation, CreativePlan, AdPlatform, CampaignStatus } from "@/lib/mock-data";
import { useCampaign, useUpdateCampaign } from "@/lib/hooks/use-campaigns";
import { useDeleteCampaign } from "@/lib/hooks/use-campaigns";
import { usePlan, useGeneratePlan, useUpdatePlanStatus } from "@/lib/hooks/use-plan";
import { useDerivations, useCreateDerivations } from "@/lib/hooks/use-derivations";
import { useReviewDerivation } from "@/lib/hooks/use-review";
import { useRegenerateDerivation } from "@/lib/hooks/use-regenerate";
import { useExport } from "@/lib/hooks/use-export";
import StatusBadge from "@/components/ui/StatusBadge";
import StepIndicator from "@/components/workspace/StepIndicator";
import type { StepKey } from "@/components/workspace/StepIndicator";
import BriefingStep from "@/components/workspace/BriefingStep";
import type { BriefingFormData } from "@/components/workspace/BriefingStep";
import UploadStep from "@/components/workspace/UploadStep";
import PlanStep from "@/components/workspace/PlanStep";
import DerivationsStep from "@/components/workspace/DerivationsStep";
import ReviewStep from "@/components/workspace/ReviewStep";
import { Skeleton } from "@/components/ui/skeleton";

// ============================================
// Types
// ============================================

type WizardStep = 1 | 2 | 3 | 4 | 5;

// ============================================
// Step Navigation Labels
// ============================================

const stepNavLabels: Record<WizardStep, { prev: string; next: string }> = {
  1: { prev: "", next: "Continue to Upload \u2192" },
  2: { prev: "\u2190 Back to Brief", next: "Generate Plan \u2192" },
  3: { prev: "\u2190 Back to Upload", next: "Start Generation \u2192" },
  4: { prev: "\u2190 Back to Plan", next: "Review All \u2192" },
  5: { prev: "\u2190 Back to Gallery", next: "Export Selected" },
};

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

  // Real data hooks
  const { campaign: realCampaign, isLoading, isError } = useCampaign(campaignId);
  const updateCampaign = useUpdateCampaign(campaignId);
  const deleteCampaign = useDeleteCampaign();

  // Plan hooks
  const { data: planData, isLoading: planLoading } = usePlan(campaignId);
  const generatePlan = useGeneratePlan(campaignId);
  const updatePlanStatus = useUpdatePlanStatus(campaignId);

  // Derivation hooks
  const { data: derivationsData } = useDerivations(campaignId);
  const createDerivations = useCreateDerivations(campaignId);

  // Review / regenerate / export hooks
  const reviewMutation = useReviewDerivation();
  const regenerateMutation = useRegenerateDerivation();
  const exportMutation = useExport();

  // Store actions
  const setCurrentPageTitle = useAppStore((s) => s.setCurrentPageTitle);
  const addToast = useAppStore((s) => s.addToast);

  // Combine real campaign with mock fallback for new campaigns
  const campaign = realCampaign
    ? {
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
        status: realCampaign.status,
        variations: realCampaign.variations,
        creditsUsed: realCampaign.creditsUsed,
        lastModified: realCampaign.lastModified,
        createdAt: realCampaign.createdAt,
      }
    : isNew
      ? {
          id: "new",
          name: "New Campaign",
          platforms: [] as AdPlatform[],
          status: "draft" as const,
          variations: 0,
          creditsUsed: 0,
          lastModified: new Date(),
          createdAt: new Date(),
        }
      : null;

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [direction, setDirection] = useState(1);
  const [planApproved, setPlanApproved] = useState(false);
  const [hasSetInitialStep, setHasSetInitialStep] = useState(false);

  // Auto-set initial step based on campaign progress
  useEffect(() => {
    if (hasSetInitialStep || isLoading || isNew) return;
    if (derivationsData && derivationsData.length > 0) {
      setCurrentStep(4);
      setHasSetInitialStep(true);
    } else if (planData) {
      setCurrentStep(3);
      setHasSetInitialStep(true);
    }
  }, [hasSetInitialStep, isLoading, isNew, derivationsData, planData]);

  // Auto-generate plan when entering step 3 if no plan exists
  useEffect(() => {
    if (
      currentStep === 3 &&
      !planData &&
      !isNew &&
      !planLoading &&
      !generatePlan.isPending
    ) {
      generatePlan.mutate();
    }
  }, [currentStep, planData, isNew, planLoading, generatePlan]);

  // Map DB plan to UI CreativePlan type
  const creativePlan: CreativePlan | null = useMemo(() => {
    if (!planData) return null;
    const statusMap: Record<string, CampaignStatus> = {
      draft: "draft",
      approved: "completed",
      rejected: "failed",
    };
    return {
      id: planData.id,
      campaignId: planData.campaignId,
      strategy: planData.strategy ?? "",
      angles: (planData.angles ?? []).map((a, i) => ({
        number: i + 1,
        title: a,
        description: a,
      })),
      hooks: planData.hooks ?? [],
      ctas: planData.ctas ?? [],
      status: statusMap[planData.status] ?? "draft",
      createdAt: planData.createdAt,
    };
  }, [planData]);

  // Map DB derivations to UI Derivation type
  const campaignPlatforms = campaign?.platforms?.length
    ? campaign.platforms
    : (["Meta"] as AdPlatform[]);

  const allDerivations: Derivation[] = useMemo(() => {
    const items = derivationsData ?? [];
    return items.map((d, i) => {
      const status: CampaignStatus =
        d.status === "queued" || d.status === "processing"
          ? "generating"
          : (d.status as CampaignStatus) ?? "draft";
      const platform = campaignPlatforms[i % campaignPlatforms.length] ?? "Meta";
      const name = d.prompt
        ? d.prompt.slice(0, 40) + (d.prompt.length > 40 ? "..." : "")
        : `Variation ${i + 1}`;
      return {
        id: d.id,
        campaignId: d.campaignId,
        name,
        status,
        platform,
        prompt: d.prompt ?? "",
        creditCost: d.cost ? d.cost / 100 : 2.4,
        imageUrl: d.imageUrl ?? undefined,
        createdAt: d.createdAt,
        completedAt: d.status === "completed" ? d.updatedAt : undefined,
      };
    });
  }, [derivationsData, campaignPlatforms]);

  // Set page title
  useEffect(() => {
    setCurrentPageTitle(campaign?.name || "Campaign Workspace");
  }, [setCurrentPageTitle, campaign?.name]);

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
    if (currentStep < 5) {
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
        });
      }
      addToast("success", "Briefing saved");
      handleNext();
    },
    [campaign, isNew, updateCampaign, addToast, handleNext]
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
        });
      }
      addToast("info", "Draft saved");
    },
    [campaign, isNew, updateCampaign, addToast]
  );

  // ============================================
  // Step 2: Upload Handlers
  // ============================================

  const handleUploadContinue = useCallback(() => {
    addToast("success", "Creative uploaded successfully");
    handleNext();
  }, [addToast, handleNext]);

  // ============================================
  // Step 3: Plan Handlers
  // ============================================

  const handleApprovePlan = useCallback(() => {
    setPlanApproved(true);
    updatePlanStatus.mutate("approved", {
      onSuccess: () => {
        addToast("success", "Creative plan approved!");
      },
      onError: () => {
        addToast("error", "Failed to approve plan");
      },
    });
  }, [updatePlanStatus, addToast]);

  const handleGenerateDerivations = useCallback(() => {
    if (createDerivations.isPending) return;
    createDerivations.mutate(undefined, {
      onSuccess: () => {
        addToast("success", "Derivations queued for generation");
        handleNext();
        if (campaign && !isNew) {
          updateCampaign.mutate({ status: "generating" });
        }
      },
      onError: () => {
        addToast("error", "Failed to queue derivations");
      },
    });
  }, [createDerivations, createDerivations.isPending, handleNext, campaign, isNew, updateCampaign, addToast]);

  // ============================================
  // Step 4: Derivations Handlers
  // ============================================

  const handlePreview = useCallback(
    (id: string) => {
      setCurrentStep(5);
      addToast("info", "Opening comparison view...");
    },
    [addToast]
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
    (id: string) => {
      regenerateMutation.mutate({ id });
    },
    [regenerateMutation]
  );

  const handleReviewAll = useCallback(() => {
    goToStep(5);
  }, [goToStep]);

  // ============================================
  // Step 5: Review Handlers
  // ============================================

  const handleApproveDerivation = useCallback(
    (id: string) => {
      reviewMutation.mutate({ id, status: "approved" });
    },
    [reviewMutation]
  );

  const handleRejectDerivation = useCallback(
    (id: string, _reason: string) => {
      reviewMutation.mutate({ id, status: "rejected" });
    },
    [reviewMutation]
  );

  const handleRegenerateWithFeedback = useCallback(
    (id: string, feedback: string) => {
      regenerateMutation.mutate({ id, feedback });
    },
    [regenerateMutation]
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

  const handleExportAll = useCallback(
    (format: string) => {
      exportMutation.mutate({
        type: "batch",
        campaignId,
        format: format as "png" | "jpeg" | "webp",
      });
    },
    [exportMutation, campaignId]
  );

  // ============================================
  // Render Step Content
  // ============================================

  const isPlanGenerating = generatePlan.isPending;

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
        return <UploadStep onContinue={handleUploadContinue} />;
      case 3:
        return (
          <PlanStep
            key={creativePlan?.id ?? "no-plan"}
            plan={creativePlan}
            onApprove={handleApprovePlan}
            onGenerateDerivations={handleGenerateDerivations}
            approved={planApproved || planData?.status === "approved"}
            isGenerating={createDerivations.isPending}
          />
        );
      case 4:
        return (
          <DerivationsStep
            derivations={allDerivations}
            campaignId={campaignId}
            onPreview={handlePreview}
            onDownload={handleDownloadDerivation}
            onRegenerate={handleRegenerateDerivation}
            onGenerateMore={handleGenerateDerivations}
            onReviewAll={handleReviewAll}
            isGeneratingMore={createDerivations.isPending}
          />
        );
      case 5:
        return (
          <ReviewStep
            derivations={allDerivations}
            onApprove={handleApproveDerivation}
            onReject={handleRejectDerivation}
            onRegenerate={handleRegenerateWithFeedback}
            onDownload={handleExportDerivation}
            onExportAll={handleExportAll}
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
            regeneratingId={
              regenerateMutation.isPending ? regenerateMutation.variables?.id ?? null : null
            }
            downloadingId={
              exportMutation.isPending && exportMutation.variables?.type === "individual"
                ? exportMutation.variables.derivationId ?? null
                : null
            }
            isExporting={exportMutation.isPending && exportMutation.variables?.type === "batch"}
          />
        );
      default:
        return null;
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
          Error loading campaign
        </h2>
        <Link
          href="/campaigns"
          className="text-sm text-[var(--accent-blue)] hover:underline"
        >
          Back to campaigns
        </Link>
      </div>
    );
  }

  if (!campaign && !isNew) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
          Campaign not found
        </h2>
        <Link
          href="/campaigns"
          className="text-sm text-[var(--accent-blue)] hover:underline"
        >
          Back to campaigns
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
            Campaigns
          </Link>

          {/* Campaign title + status */}
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">
              {campaign?.name || "New Campaign"}
            </h1>
            {campaign?.status && <StatusBadge status={campaign.status} />}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              addToast("info", "Draft saved");
            }}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] hover:border-[var(--border-medium)] active:scale-[0.98]"
          >
            <Save size={14} />
            Save Draft
          </button>
          {campaign?.status === "draft" && !isNew && (
            <button
              onClick={() => {
                if (confirm("Delete this draft campaign?")) {
                  deleteCampaign.mutate(campaignId, {
                    onSuccess: () => {
                      addToast("success", "Draft deleted");
                      router.push("/campaigns");
                    },
                    onError: () => {
                      addToast("error", "Failed to delete draft");
                    },
                  });
                }
              }}
              className="p-2 rounded-md text-[var(--accent-rose)] hover:bg-[rgba(244,63,94,0.08)] transition-colors"
              title="Delete draft"
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
          {campaign.platforms?.join(", ") || "No platforms set"}
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
          currentStep === 3 && "p-0 overflow-hidden",
          currentStep === 4 && "p-6",
          currentStep === 5 && "p-6"
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

      {/* ---- Loading overlay for plan generation ---- */}
      {isPlanGenerating && currentStep === 3 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        >
          <div className="bg-[var(--surface-base)] rounded-xl border border-[var(--border-dim)] px-8 py-6 flex flex-col items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            >
              <Sparkles size={28} className="text-[var(--accent-purple)]" />
            </motion.div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Generating creative plan...
            </p>
          </div>
        </motion.div>
      )}

      {/* ---- Navigation Footer ---- */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex items-center justify-between mt-6 max-w-[960px] mx-auto px-4"
      >
        <button
          onClick={handlePrev}
          disabled={currentStep === 1}
          className={cn(
            "inline-flex items-center rounded-md px-5 py-2.5 text-sm font-medium transition-all duration-200",
            currentStep === 1
              ? "text-[var(--text-muted)] cursor-not-allowed"
              : "bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] hover:border-[var(--border-medium)] active:scale-[0.98]"
          )}
        >
          {currentStep > 1 ? stepNavLabels[currentStep].prev : ""}
        </button>

        <button
          onClick={handleNext}
          disabled={currentStep === 5}
          className={cn(
            "inline-flex items-center rounded-md px-6 py-2.5 text-sm font-medium transition-all duration-200",
            currentStep === 5
              ? "bg-[var(--surface-raised)] text-[var(--text-muted)] border border-[var(--border-dim)] cursor-default"
              : "bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)] hover:-translate-y-px active:scale-[0.98]"
          )}
        >
          {stepNavLabels[currentStep].next}
        </button>
      </motion.div>
    </div>
  );
}
