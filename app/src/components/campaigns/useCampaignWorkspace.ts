"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import type { Derivation, AdPlatform, CampaignStatus } from "@/lib/mock-data";
import { useCampaign, useUpdateCampaign } from "@/lib/hooks/use-campaigns";
import { useDeleteCampaign } from "@/lib/hooks/use-campaigns";
import { useDerivations, useCreateDerivations } from "@/lib/hooks/use-derivations";
import { useRegenerateDerivation } from "@/lib/hooks/use-regenerate";
import { useExport } from "@/lib/hooks/use-export";
import { useReviewDerivation } from "@/lib/hooks/use-review";
import { useCreateDeliveryPackage } from "@/lib/hooks/use-delivery-package";
import { useCreativeQa } from "@/lib/hooks/use-creative-qa";
import { useSaveDerivationAsReference } from "@/lib/hooks/use-client-profiles";
import { useGenerateLandingPage } from "@/lib/hooks/use-landing-page";
import type { DeliveryFormat } from "@/components/workspace/DeliveryPackageModal";
import type { BriefingFormData } from "@/components/workspace/BriefingStep";
import type { StepKey } from "@/components/workspace/StepIndicator";
import { useTranslations } from "next-intl";

export type WizardStep = 1 | 2 | 3;

export function useCampaignWorkspace() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;
  const isNew = campaignId === "new";

  const t = useTranslations("campaign");
  const td = useTranslations("derivation");
  const ts = useTranslations("steps");
  const tc = useTranslations("common");

  const { campaign: realCampaign, isLoading, isError } = useCampaign(campaignId);
  const updateCampaign = useUpdateCampaign(campaignId);
  const deleteCampaign = useDeleteCampaign();

  const { data: derivationsData } = useDerivations(campaignId);
  const createDerivations = useCreateDerivations(campaignId);

  const regenerateMutation = useRegenerateDerivation();
  const exportMutation = useExport();
  const reviewMutation = useReviewDerivation();
  const createDeliveryPackage = useCreateDeliveryPackage();
  const saveDerivationAsReference = useSaveDerivationAsReference();
  const generateLandingPage = useGenerateLandingPage();

  const setCurrentPageTitle = useAppStore((s) => s.setCurrentPageTitle);
  const addToast = useAppStore((s) => s.addToast);

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
        clientProfileId: realCampaign.clientProfileId,
        selectedReferenceIds: realCampaign.selectedReferenceIds,
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

  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [direction, setDirection] = useState(1);
  const [hasSetInitialStep, setHasSetInitialStep] = useState(false);

  useEffect(() => {
    if (hasSetInitialStep || isLoading || isNew) return;
    if (derivationsData && derivationsData.length > 0) {
      queueMicrotask(() => {
        setCurrentStep(3);
        setHasSetInitialStep(true);
      });
    }
  }, [hasSetInitialStep, isLoading, isNew, derivationsData]);

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
        qaStatus: d.qaStatus ?? undefined,
        qaChecklist: d.qaChecklist ?? undefined,
        qaIssues: d.qaIssues ?? undefined,
        qaSuggestions: d.qaSuggestions ?? undefined,
        qaAnalyzedAt: d.qaAnalyzedAt ?? undefined,
        createdAt: d.createdAt,
        completedAt: d.status === "completed" ? d.updatedAt : undefined,
      };
    });
  }, [derivationsData, campaign, td]);

  const approvedDerivation = useMemo(
    () => allDerivations.find((derivation) => derivation.status === "approved"),
    [allDerivations]
  );

  const creativeQa = useCreativeQa();
  const [savingReferenceId, setSavingReferenceId] = useState<string | null>(null);

  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [selectedDeliverySource, setSelectedDeliverySource] = useState<Derivation | null>(null);

  const handleDeliveryModalOpenChange = useCallback((open: boolean) => {
    setDeliveryModalOpen(open);
    if (!open) {
      setSelectedDeliverySource(null);
    }
  }, []);

  useEffect(() => {
    setCurrentPageTitle(campaign?.name || tc("campaign"));
  }, [setCurrentPageTitle, campaign?.name, tc]);

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
          targetFormats: data.targetFormats,
          creativeLevel: data.creativeLevel,
          clientProfileId: data.clientProfileId,
          selectedReferenceIds: data.selectedReferenceIds,
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
          targetFormats: data.targetFormats,
          creativeLevel: data.creativeLevel,
          clientProfileId: data.clientProfileId,
          selectedReferenceIds: data.selectedReferenceIds,
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

  const handleUploadContinue = useCallback(() => {
    handleGenerateDerivations();
  }, [handleGenerateDerivations]);

  const handleGeneratePreview = useCallback(() => {
    handleGenerateDerivations({ preview: true });
  }, [handleGenerateDerivations]);

  const handleGenerateLandingPage = useCallback(
    (id: string) => {
      generateLandingPage.mutate({ derivationId: id });
    },
    [generateLandingPage]
  );

  const handleSaveAsReference = useCallback((id: string) => {
    const derivation = allDerivations.find((item) => item.id === id);
    const clientProfileId = campaign?.clientProfileId;
    if (!derivation || !clientProfileId) return;

    setSavingReferenceId(id);
    saveDerivationAsReference.mutate(
      {
        derivationId: id,
        clientProfileId,
        label: derivation.name,
        kind: "style",
      },
      {
        onSuccess: () => {
          addToast("success", td("referenceSaved"));
        },
        onError: () => {
          addToast("error", tc("errorLoading"));
        },
        onSettled: () => {
          setSavingReferenceId(null);
        },
      }
    );
  }, [allDerivations, campaign?.clientProfileId, saveDerivationAsReference, addToast, td, tc]);

  const hasActivePreview = useMemo(() => {
    return allDerivations.some((d) => d.isPreview && ["queued", "processing", "generating", "completed"].includes(d.status));
  }, [allDerivations]);

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

  const getStepNavLabel = useCallback((step: WizardStep, direction: "prev" | "next") => {
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
  }, [ts]);

  const handleDelete = useCallback(() => {
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
  }, [campaignId, deleteCampaign, addToast, tc, router]);

  return {
    campaignId,
    isNew,
    campaign,
    isLoading,
    isError,
    currentStep,
    direction,
    allDerivations,
    approvedDerivation,
    creativeQa,
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
    handleGenerateDerivations,
    handleUploadContinue,
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
    handleExportDerivation,
    getStepNavLabel,
    handleDelete,
    createDerivations,
    exportMutation,
    reviewMutation,
    regenerateMutation,
    generateLandingPage,
    createDeliveryPackage,
    addToast,
    tc,
  };
}
