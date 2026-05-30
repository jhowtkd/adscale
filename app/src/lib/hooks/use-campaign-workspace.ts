"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Derivation, AdPlatform, CampaignStatus } from "@/lib/mock-data";
import { useAppStore } from "@/lib/store";
import { useCampaign, useUpdateCampaign, useCreateCampaign } from "@/lib/hooks/use-campaigns";
import { useDeleteCampaign } from "@/lib/hooks/use-campaigns";
import { useDerivations, useCreateDerivations } from "@/lib/hooks/use-derivations";
import { useRegenerateDerivation } from "@/lib/hooks/use-regenerate";
import { useExport } from "@/lib/hooks/use-export";
import { useReviewDerivation } from "@/lib/hooks/use-review";
import { useCreateDeliveryPackage } from "@/lib/hooks/use-delivery-package";
import { useCreativeQa } from "@/lib/hooks/use-creative-qa";
import { usePlan, useGeneratePlan, useUpdatePlanStatus } from "./use-plan";
import { useSaveDerivationAsReference } from "@/lib/hooks/use-client-profiles";
import { useGenerateLandingPage } from "@/lib/hooks/use-landing-page";
import type { BriefingFormData } from "@/components/workspace/BriefingStep";
import type { GenerationConfig } from "@/components/workspace/GenerationStep";
import type { StepKey } from "@/components/workspace/StepIndicator";
import type { DeliveryFormat } from "@/components/workspace/DeliveryPackageModal";
import { useTranslations } from "next-intl";

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export function useCampaignWorkspace(campaignId: string, isNew: boolean) {
  const router = useRouter();
  const t = useTranslations("campaign");
  const td = useTranslations("derivation");
  const ts = useTranslations("steps");
  const tc = useTranslations("common");

  const setCurrentPageTitle = useAppStore((s) => s.setCurrentPageTitle);
  const addToast = useAppStore((s) => s.addToast);

  const { campaign: realCampaign, isLoading, isError } = useCampaign(campaignId);
  const updateCampaign = useUpdateCampaign(campaignId);
  const createCampaign = useCreateCampaign();
  const deleteCampaign = useDeleteCampaign();

  // Disable derivations polling when real-time subscriptions are active
  const [enableDerivationsPolling, setEnableDerivationsPolling] = useState(true);
  const { data: derivationsData } = useDerivations(campaignId, {
    enablePolling: enableDerivationsPolling,
  });
  const createDerivations = useCreateDerivations(campaignId);

  useEffect(() => {
    const hasActive = derivationsData?.some(
      (d) => d.status === "queued" || d.status === "processing"
    );
    const nextEnablePolling = !hasActive;
    queueMicrotask(() => {
      setEnableDerivationsPolling((current) =>
        current === nextEnablePolling ? current : nextEnablePolling
      );
    });
  }, [derivationsData]);
  const regenerateMutation = useRegenerateDerivation();
  const exportMutation = useExport();
  const reviewMutation = useReviewDerivation();
  const createDeliveryPackage = useCreateDeliveryPackage();
  const saveDerivationAsReference = useSaveDerivationAsReference();
  const generateLandingPage = useGenerateLandingPage();
  const creativeQa = useCreativeQa();
  const { data: planData } = usePlan(campaignId);
  const generatePlanMutation = useGeneratePlan(campaignId);
  const updatePlanStatusMutation = useUpdatePlanStatus(campaignId);

  const campaign = useMemo(() => {
    if (realCampaign) {
      return {
        id: realCampaign.id,
        name: realCampaign.name,
        client: realCampaign.client,
        objective: realCampaign.objective,
        audience: realCampaign.audience,
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
        status: "draft" as const,
        variations: 0,
        creditsUsed: 0,
        lastModified: new Date(),
        createdAt: new Date(),
      };
    }
    return null;
  }, [realCampaign, isNew, t]);

  useEffect(() => {
    setCurrentPageTitle(campaign?.name || tc("campaign"));
  }, [setCurrentPageTitle, campaign?.name, tc]);

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [direction, setDirection] = useState(1);
  const [hasSetInitialStep, setHasSetInitialStep] = useState(false);

  useEffect(() => {
    if (hasSetInitialStep || isLoading || isNew) return;
    if (derivationsData && derivationsData.length > 0) {
      queueMicrotask(() => {
        setCurrentStep(5);
        setHasSetInitialStep(true);
      });
    }
  }, [hasSetInitialStep, isLoading, isNew, derivationsData]);

  const allDerivations = useMemo(() => {
    const items = derivationsData ?? [];
    return items.map((d, i) => {
      const status: CampaignStatus =
        d.status === "queued" || d.status === "processing"
          ? "generating"
          : (d.status as CampaignStatus) ?? "draft";
      const platform: AdPlatform = "Meta";
      const generationMode = (d.generationMode as "art_variation" | "format_adaptation" | "restyling" | undefined) ?? campaign?.generationMode;
      const variantIndex = d.variantIndex ?? i;
      const format = d.format ?? undefined;
      const ctaText = d.ctaText ?? undefined;
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
        format,
        ctaText,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };
    });
  }, [derivationsData, campaign, td]);

  const approvedDerivation = useMemo(
    () => allDerivations.find((derivation) => derivation.status === "approved"),
    [allDerivations]
  );

  const [savingReferenceId, setSavingReferenceId] = useState<string | null>(null);
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [selectedDeliverySource, setSelectedDeliverySource] = useState<Derivation | null>(null);

  const handleDeliveryModalOpenChange = useCallback((open: boolean) => {
    setDeliveryModalOpen(open);
    if (!open) setSelectedDeliverySource(null);
  }, []);

  // Navigation
  const goToStep = useCallback(
    (step: WizardStep) => {
      setDirection(step > currentStep ? 1 : -1);
      setCurrentStep(step);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [currentStep]
  );

  const handleNext = useCallback(() => {
    if (currentStep < 5) goToStep((currentStep + 1) as WizardStep);
  }, [currentStep, goToStep]);

  const handlePrev = useCallback(() => {
    if (currentStep > 1) goToStep((currentStep - 1) as WizardStep);
  }, [currentStep, goToStep]);

  const handleStepClick = useCallback(
    (step: StepKey) => {
      if (step < currentStep) goToStep(step as WizardStep);
    },
    [currentStep, goToStep]
  );

  // Generation config state
  const [generationConfig, setGenerationConfig] = useState<GenerationConfig | null>(null);

  // Step 1 handlers
  const handleBriefingContinue = useCallback(
    async (data: BriefingFormData) => {
      if (isNew) {
        try {
          const newCampaign = await createCampaign.mutateAsync({
            name: data.name,
            client: data.client,
            objective: data.objective,
            audience: data.audience,
            constraints: data.constraints,
            notes: data.notes,
          });
          addToast("success", tc("campaignCreated", { name: data.name }));
          router.push(`/campaigns/${newCampaign.id}`);
          return;
        } catch {
          addToast("error", tc("failedCreateCampaign"));
          return;
        }
      }
      if (campaign && !isNew) {
        updateCampaign.mutate({
          name: data.name,
          client: data.client,
          objective: data.objective,
          audience: data.audience,
          constraints: data.constraints,
          notes: data.notes,
        });
      }
      addToast("success", tc("briefingSaved"));
      handleNext();
    },
    [campaign, isNew, createCampaign, updateCampaign, addToast, tc, handleNext, router]
  );

  const handleSaveDraft = useCallback(
    async (data: BriefingFormData) => {
      if (isNew) {
        try {
          const newCampaign = await createCampaign.mutateAsync({
            name: data.name,
            client: data.client,
            objective: data.objective,
            audience: data.audience,
            constraints: data.constraints,
            notes: data.notes,
          });
          addToast("success", tc("campaignCreated", { name: data.name }));
          router.push(`/campaigns/${newCampaign.id}`);
          return;
        } catch {
          addToast("error", tc("failedCreateCampaign"));
          return;
        }
      }
      if (campaign && !isNew) {
        updateCampaign.mutate({
          name: data.name,
          client: data.client,
          objective: data.objective,
          audience: data.audience,
          constraints: data.constraints,
          notes: data.notes,
          status: "draft",
        });
      }
      addToast("info", tc("draftSaved"));
    },
    [campaign, isNew, createCampaign, updateCampaign, addToast, tc, router]
  );

  // Step 3 handler (Generation)
  const handleGenerationContinue = useCallback(
    (config: GenerationConfig) => {
      setGenerationConfig(config);
      if (campaign && !isNew) {
        updateCampaign.mutate({
          generationMode: config.generationMode,
          creativeLevel: config.creativeLevel,
          targetFormats: config.targetFormats,
          ctaVariants: config.ctaVariants.filter((v) => v.trim().length > 0).length > 0
            ? config.ctaVariants
            : undefined,
        });
      }
      addToast("success", tc("generationConfigSaved"));
      handleNext();
    },
    [campaign, isNew, updateCampaign, addToast, tc, handleNext]
  );

  const handleGenerateDerivations = useCallback(
    (options?: { preview?: boolean }) => {
      if (createDerivations.isPending) return;
      createDerivations.mutate(options, {
        onSuccess: () => {
          addToast("success", options?.preview ? tc("previewQueued") : tc("derivationsQueued"));
          if (!options?.preview) goToStep(5);
          if (campaign && !isNew) updateCampaign.mutate({ status: "generating" });
        },
        onError: () => {
          addToast("error", options?.preview ? tc("failedQueuePreview") : tc("failedQueueDerivations"));
        },
      });
    },
    [createDerivations, goToStep, campaign, isNew, updateCampaign, addToast, tc]
  );

  const handleContinueToPlan = useCallback(() => {
    goToStep(3);
  }, [goToStep]);

  const handleGeneratePreview = useCallback(() => {
    handleGenerateDerivations({ preview: true });
  }, [handleGenerateDerivations]);

  const handleSkipPlan = useCallback(() => {
    handleGenerateDerivations();
  }, [handleGenerateDerivations]);

  const handleApprovePlanAndGenerate = useCallback(() => {
    if (!planData) {
      handleGenerateDerivations();
      return;
    }
    updatePlanStatusMutation.mutate("approved", {
      onSuccess: () => {
        handleGenerateDerivations();
      },
    });
  }, [planData, updatePlanStatusMutation, handleGenerateDerivations]);

  const handleGenerateLandingPage = useCallback(
    (id: string) => generateLandingPage.mutate({ derivationId: id }),
    [generateLandingPage]
  );

  const handleSaveAsReference = useCallback(
    (id: string) => {
      addToast("info", "Feature unavailable");
    },
    [addToast]
  );

  const hasActivePreview = useMemo(() => {
    return false;
  }, [allDerivations]);

  // Step 3 handlers
  const handlePreview = useCallback(() => addToast("info", tc("openingComparison")), [addToast, tc]);

  const handleDownloadDerivation = useCallback(
    (id: string) => exportMutation.mutate({ type: "individual", derivationId: id, format: "png" }),
    [exportMutation]
  );

  const handleRegenerateDerivation = useCallback(
    (id: string, feedback?: string) => regenerateMutation.mutate({ id, feedback }),
    [regenerateMutation]
  );

  const handleApproveDerivation = useCallback(
    (id: string) => reviewMutation.mutate({ id, status: "approved" }),
    [reviewMutation]
  );

  const handleRejectDerivation = useCallback(
    (id: string) => reviewMutation.mutate({ id, status: "rejected" }),
    [reviewMutation]
  );

  const handleRunQa = useCallback(
    (id: string) => {
      creativeQa.mutate(
        { derivationId: id },
        {
          onSuccess: () => addToast("success", tc("creativeQaComplete")),
          onError: () => addToast("error", tc("creativeQaFailed")),
        }
      );
    },
    [creativeQa, addToast, tc]
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
          onError: () => addToast("error", tc("packageFailed")),
        }
      );
    },
    [selectedDeliverySource, createDeliveryPackage, addToast, tc, handleDeliveryModalOpenChange]
  );

  const handleExportDerivation = useCallback(
    (id: string, format: string) => {
      exportMutation.mutate({ type: "individual", derivationId: id, format: format as "png" | "jpeg" | "webp" });
    },
    [exportMutation]
  );

  const handleDownloadDeliverySource = useCallback(() => {
    if (!selectedDeliverySource) return;
    handleExportDerivation(selectedDeliverySource.id, "png");
  }, [selectedDeliverySource, handleExportDerivation]);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDeleteClick = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  const handleDelete = useCallback(() => {
    deleteCampaign.mutate(campaignId, {
      onSuccess: () => {
        addToast("success", tc("draftDeleted"));
        setShowDeleteDialog(false);
        router.push("/campaigns");
      },
      onError: () => {
        addToast("error", tc("failedDeleteDraft"));
      },
    });
  }, [campaignId, deleteCampaign, addToast, tc, router]);

  const getStepNavLabel = useCallback(
    (step: WizardStep, direction: "prev" | "next") => {
      switch (step) {
        case 1:
          return direction === "prev" ? "" : ts("continueToUpload");
        case 2:
          return direction === "prev" ? ts("backToBrief") : ts("continueToGeneration");
        case 3:
          return direction === "prev" ? ts("backToUpload") : ts("continueToPlan");
        case 4:
          return direction === "prev" ? ts("backToGeneration") : ts("generateDerivations");
        case 5:
          return direction === "prev" ? ts("backToPlan") : "";
        default:
          return "";
      }
    },
    [ts]
  );

  return {
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
    goToStep,
    handleNext,
    handlePrev,
    handleStepClick,
    handleBriefingContinue,
    handleSaveDraft,
    handleGenerationContinue,
    generationConfig,
    handleGenerateDerivations,
    handleContinueToPlan,
    handleGeneratePreview,
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
    getStepNavLabel,
    // Mutation pending states for UI
    creativeQaPending: creativeQa.isPending,
    creativeQaVariables: creativeQa.variables,
    reviewPending: reviewMutation.isPending,
    reviewVariables: reviewMutation.variables,
    regeneratePending: regenerateMutation.isPending,
    regenerateVariables: regenerateMutation.variables,
    landingPagePending: generateLandingPage.isPending,
    landingPageVariables: generateLandingPage.variables,
    createDerivationsPending: createDerivations.isPending,
    exportPending: exportMutation.isPending,
    deliveryPackagePending: createDeliveryPackage.isPending,
    planData,
    generatePlanPending: generatePlanMutation.isPending,
    updatePlanStatusPending: updatePlanStatusMutation.isPending,
    handleSkipPlan,
    handleApprovePlanAndGenerate,
  };
}
