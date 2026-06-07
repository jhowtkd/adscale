"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { Derivation, AdPlatform, CampaignStatus } from "@/lib/mock-data";
import { useAppStore } from "@/lib/store";
import { useCampaign, useUpdateCampaign } from "@/lib/hooks/use-campaigns";
import { useDeleteCampaign } from "@/lib/hooks/use-campaigns";
import { useDerivations, useCreateDerivations, useRestyleCampaign } from "@/lib/hooks/use-derivations";
import { useRegenerateDerivation } from "@/lib/hooks/use-regenerate";
import { useExport } from "@/lib/hooks/use-export";
import { useReviewDerivation } from "@/lib/hooks/use-review";
import { useCreateDeliveryPackage } from "@/lib/hooks/use-delivery-package";
import { useCreativeQa } from "@/lib/hooks/use-creative-qa";
import { usePlan, useGeneratePlan, useUpdatePlanStatus } from "./use-plan";
import { useSaveDerivationAsReference } from "@/lib/hooks/use-client-profiles";
import { useGenerateLandingPage } from "@/lib/hooks/use-landing-page";
import type { DeliveryFormat } from "@/components/workspace/DeliveryPackageModal";
import {
  buildRegenerationFeedback,
  derivationNeedsRegenerateDialog,
} from "@/lib/derivation-regeneration-feedback";
import { useTranslations } from "next-intl";
import {
  estimateCreditCost,
  type RecipeGenerationConfig,
} from "@/server/ai/strategy-recipes";
import { shouldShowPreviewGate } from "@/server/ai/preview-gate";
import { useMissionInsightOptional } from "@/components/mission-insights/MissionInsightProvider";
import {
  creditFrictionDiagnostic,
  isInsufficientCreditsError,
} from "@/lib/mission-insights/helpers";

export type WorkspaceState =
  | "piloto"           // upload + briefing
  | "acoes"            // action buttons + derivation grid
  | "derivando"        // configuring derivation
  | "estilizando"      // configuring styling
  | "gerando";         // loading while generating

export function useCampaignWorkspace(campaignId: string, isNew: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentRoute = useMemo(() => {
    const query = searchParams?.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const queryClient = useQueryClient();
  const t = useTranslations("campaign");
  const td = useTranslations("derivation");
  const tc = useTranslations("common");

  const setCurrentPageTitle = useAppStore((s) => s.setCurrentPageTitle);
  const addToast = useAppStore((s) => s.addToast);
  const missionInsight = useMissionInsightOptional();

  const {
    campaign: realCampaign,
    isLoading,
    isError,
    loadErrorKind,
    refetch: refetchCampaign,
  } = useCampaign(campaignId);
  const updateCampaign = useUpdateCampaign(campaignId);
  const deleteCampaign = useDeleteCampaign();

  const {
    data: derivationsData,
    isError: isDerivationsError,
    errorKind: derivationsErrorKind,
    refetch: refetchDerivations,
  } = useDerivations(campaignId);
  const createDerivations = useCreateDerivations(campaignId);
  const restyleCampaign = useRestyleCampaign(campaignId);
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
        product: realCampaign.product,
        offer: realCampaign.offer,
        objective: realCampaign.objective,
        audience: realCampaign.audience,
        platforms: realCampaign.platforms,
        tone: realCampaign.tone,
        constraints: realCampaign.constraints,
        notes: realCampaign.notes,
        ctaVariants: realCampaign.ctaVariants,
        generationMode: realCampaign.generationMode,
        creativeLevel: realCampaign.creativeLevel,
        targetFormats: realCampaign.targetFormats,
        styleIntensity: realCampaign.styleIntensity,
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

  // Workspace state
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>("piloto");
  const hasActiveDerivations = Boolean(
    derivationsData?.some(
      (d) => d.status === "queued" || d.status === "processing"
    )
  );

  const resolvedWorkspaceState =
    workspaceState === "gerando" &&
    derivationsData?.length &&
    !hasActiveDerivations
      ? "acoes"
      : workspaceState;

  const visibleWorkspaceState =
    !isLoading &&
    !isNew &&
    derivationsData &&
    derivationsData.length > 0 &&
    resolvedWorkspaceState === "piloto"
      ? "acoes"
      : resolvedWorkspaceState;

  const goToPilot = useCallback(() => setWorkspaceState("piloto"), []);
  const goToActions = useCallback(() => setWorkspaceState("acoes"), []);
  const goToDerivation = useCallback(() => setWorkspaceState("derivando"), []);
  const goToStyling = useCallback(() => setWorkspaceState("estilizando"), []);
  const goToGenerating = useCallback(() => setWorkspaceState("gerando"), []);

  const savePilot = useCallback(
    async (assetId: string, briefing: {
      product?: string;
      offer?: string;
      objective?: string;
      audience?: string;
      tone?: string;
      platforms?: string;
      ctaText?: string;
      constraints?: string;
      notes?: string;
    }) => {
      const res = await fetch(`/api/campaigns/${campaignId}/pilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, briefing }),
      });
      if (!res.ok) throw new Error("Failed to save pilot");
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
      setWorkspaceState("acoes");
    },
    [campaignId, queryClient]
  );

  const allDerivations = useMemo(() => {
    const items = derivationsData ?? [];
    const mapped = items.map((d, i) => {
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
        outputKey: d.outputKey ?? undefined,
        generationMode,
        variantIndex,
        format,
        ctaText,
        qualityScore: d.qualityScore ?? undefined,
        scoreStatus: d.scoreStatus ?? undefined,
        scoreIssues: d.scoreIssues ?? undefined,
        regenerationSuggestion: d.regenerationSuggestion ?? undefined,
        regenerationPrimaryReason: d.regenerationPrimaryReason ?? undefined,
        regenerationIssueBreakdown: d.regenerationIssueBreakdown ?? undefined,
        qaStatus: d.qaStatus ?? undefined,
        qaChecklist: d.qaChecklist ?? undefined,
        qaIssues: d.qaIssues ?? undefined,
        qualityVerdict: d.qualityVerdict ?? undefined,
        hardFailures: d.hardFailures ?? undefined,
        polishSuggestions: d.polishSuggestions ?? undefined,
        styleAssetId: d.styleAssetId ?? undefined,
        isPreview: d.isPreview,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };
    });
    return mapped;
  }, [derivationsData, campaign, td]);

  const approvedDerivation = useMemo(
    () => allDerivations.find((derivation) => derivation.status === "approved"),
    [allDerivations]
  );

  const [savingReferenceId, setSavingReferenceId] = useState<string | null>(null);
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [selectedDeliverySource, setSelectedDeliverySource] = useState<Derivation | null>(null);
  const [reviewDerivationId, setReviewDerivationId] = useState<string | null>(null);
  const [regenerateDialog, setRegenerateDialog] = useState<{
    id: string;
    feedback: string;
    primaryReason?: string;
    issueBreakdown?: import("@/lib/regeneration-preview-types").RegenerationIssueBreakdown;
  } | null>(null);

  const handleDeliveryModalOpenChange = useCallback((open: boolean) => {
    setDeliveryModalOpen(open);
    if (!open) setSelectedDeliverySource(null);
  }, []);

  const handleGenerateDerivations = useCallback(
    (options?: { preview?: boolean }) => {
      if (createDerivations.isPending) return;
      createDerivations.mutate(options, {
        onSuccess: () => {
          addToast("success", options?.preview ? tc("previewQueued") : tc("derivationsQueued"));
          setWorkspaceState("acoes");
          if (campaign && !isNew) updateCampaign.mutate({ status: "generating" });
          if (options?.preview && missionInsight) {
            missionInsight.maybePromptMissionInsight({
              moment: "preview_first",
              missionKey: "preview",
              campaignId: campaignId !== "new" ? campaignId : undefined,
              route: currentRoute,
              diagnosticContext: { isPreview: true, operation: "preview_generate" },
            });
          }
        },
        onError: (error) => {
          addToast("error", options?.preview ? tc("failedQueuePreview") : tc("failedQueueDerivations"));
          setWorkspaceState("acoes");
          if (isInsufficientCreditsError(error) && missionInsight) {
            missionInsight.maybePromptMissionInsight({
              moment: "credit_friction",
              missionKey: options?.preview ? "preview" : "batch",
              campaignId: campaignId !== "new" ? campaignId : undefined,
              route: currentRoute,
              diagnosticContext: creditFrictionDiagnostic(error),
            });
          }
        },
      });
    },
    [createDerivations, campaign, isNew, updateCampaign, addToast, tc, campaignId, missionInsight, currentRoute]
  );

  const configureAndGenerate = useCallback(
    async (
      config: {
        generationMode: "art_variation" | "format_adaptation";
        ctaVariants?: string[];
        targetFormats?: string[];
        creativeLevel?: string;
      },
      options?: { preview?: boolean }
    ) => {
      if (!campaign || isNew) return;

      try {
        await updateCampaign.mutateAsync({
          generationMode: config.generationMode,
          ...(config.ctaVariants && { ctaVariants: config.ctaVariants }),
          ...(config.targetFormats && { targetFormats: config.targetFormats }),
          ...(config.creativeLevel && {
            creativeLevel: config.creativeLevel as
              | "conservative"
              | "balanced"
              | "bold"
              | "extreme",
          }),
        });
        handleGenerateDerivations({ preview: options?.preview ?? false });
      } catch {
        addToast("error", tc("failedQueueDerivations"));
      }
    },
    [campaign, isNew, updateCampaign, handleGenerateDerivations, addToast, tc]
  );

  const approvePreviewToBatch = useCallback(() => {
    if (createDerivations.isPending) return;
    handleGenerateDerivations();
  }, [createDerivations.isPending, handleGenerateDerivations]);

  const handleRestyle = useCallback(
    async (input: { styleAssetIds?: string[]; styleIntensity?: string }) => {
      if (!campaign || isNew) return;
      if (restyleCampaign.isPending) return;

      restyleCampaign.mutate(input, {
        onSuccess: () => {
          addToast("success", tc("derivationsQueued"));
          setWorkspaceState("acoes");
        },
        onError: () => {
          addToast("error", tc("failedQueueDerivations"));
        },
      });
    },
    [restyleCampaign, campaign, isNew, addToast, tc]
  );

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

  const previewDerivation = useMemo(
    () => allDerivations.find((d) => d.isPreview) ?? null,
    [allDerivations]
  );

  const showPreviewGate = useMemo(
    () => shouldShowPreviewGate(allDerivations),
    [allDerivations]
  );

  const batchCreditEstimate = useMemo(() => {
    if (!campaign) return 0;
    const config: RecipeGenerationConfig = {
      generationMode:
        campaign.generationMode === "format_adaptation"
          ? "format_adaptation"
          : "art_variation",
      creativeLevel:
        (campaign.creativeLevel as RecipeGenerationConfig["creativeLevel"]) ??
        "balanced",
      ctaVariants: (campaign.ctaVariants ?? [])
        .map((cta) => cta.trim())
        .filter(Boolean),
      targetFormats: campaign.targetFormats ?? ["1:1", "4:5", "9:16"],
      preservationEmphasis: "medium",
    };
    return estimateCreditCost(config);
  }, [campaign]);

  const hasActivePreview = Boolean(previewDerivation);

  const handlePreview = useCallback((id: string) => {
    setReviewDerivationId(id);
  }, []);

  const handleCloseReview = useCallback(() => {
    setReviewDerivationId(null);
  }, []);

  const handleRequestRegenerate = useCallback(
    (id: string, feedback?: string) => {
      const derivation = allDerivations.find((item) => item.id === id);
      if (!derivation) {
        regenerateMutation.mutate({ id, feedback });
        return;
      }

      const built = buildRegenerationFeedback({
        regenerationSuggestion: derivation.regenerationSuggestion,
        hardFailures: derivation.hardFailures,
        regenerationPrimaryReason: derivation.regenerationPrimaryReason,
        regenerationIssueBreakdown: derivation.regenerationIssueBreakdown,
      });

      const preset = feedback ?? built.feedbackText;
      const needsDialog = derivationNeedsRegenerateDialog({
        hardFailures: derivation.hardFailures,
        regenerationSuggestion: derivation.regenerationSuggestion,
        regenerationPrimaryReason: derivation.regenerationPrimaryReason,
        qualityVerdict: derivation.qualityVerdict,
        qaChecklist: derivation.qaChecklist,
      });

      if (needsDialog || preset.trim()) {
        setRegenerateDialog({
          id,
          feedback: preset,
          primaryReason: built.primaryReason,
          issueBreakdown: built.issueBreakdown,
        });
        return;
      }

      regenerateMutation.mutate({ id, feedback: undefined });
    },
    [allDerivations, regenerateMutation]
  );

  const handleConfirmRegenerate = useCallback(
    (feedback: string) => {
      if (!regenerateDialog) return;
      regenerateMutation.mutate(
        { id: regenerateDialog.id, feedback },
        {
          onSuccess: () => {
            setRegenerateDialog(null);
            setReviewDerivationId(null);
            missionInsight?.maybePromptMissionInsight({
              moment: "regeneration_first",
              missionKey: "regeneration",
              campaignId,
              derivationId: regenerateDialog.id,
              diagnosticContext: { operation: "regenerate" },
            });
          },
        }
      );
    },
    [regenerateDialog, regenerateMutation, missionInsight, campaignId]
  );

  const handleCloseRegenerateDialog = useCallback((open: boolean) => {
    if (!open) {
      setRegenerateDialog(null);
    }
  }, []);

  const handleDownloadDerivation = useCallback(
    (id: string) =>
      exportMutation.mutate(
        { type: "individual", derivationId: id, format: "png" },
        {
          onSuccess: () => {
            missionInsight?.maybePromptMissionInsight({
              moment: "export_first",
              missionKey: "export",
              campaignId,
              derivationId: id,
              diagnosticContext: { operation: "export", format: "png" },
            });
          },
        }
      ),
    [exportMutation, missionInsight, campaignId]
  );

  const handleRegenerateDerivation = useCallback(
    (id: string, feedback?: string) => handleRequestRegenerate(id, feedback),
    [handleRequestRegenerate]
  );

  const handleApproveDerivation = useCallback(
    (id: string) => reviewMutation.mutate({ id, status: "approved" }),
    [reviewMutation]
  );

  const handleRejectDerivation = useCallback(
    (id: string) =>
      reviewMutation.mutate(
        { id, status: "rejected" },
        {
          onSuccess: () => {
            missionInsight?.maybePromptMissionInsight({
              moment: "rejection_first",
              missionKey: "review",
              campaignId,
              derivationId: id,
              diagnosticContext: { derivationStatus: "rejected" },
            });
          },
        }
      ),
    [reviewMutation, missionInsight, campaignId]
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

  return {
    campaign,
    isLoading,
    isError,
    loadErrorKind,
    refetchCampaign,
    isDerivationsError,
    derivationsErrorKind,
    refetchDerivations,
    allDerivations,
    approvedDerivation,
    reviewDerivationId,
    regenerateDialog,
    workspaceState: visibleWorkspaceState,
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
    approvePreviewToBatch,
    handlePreview,
    handleCloseReview,
    handleRequestRegenerate,
    handleConfirmRegenerate,
    handleCloseRegenerateDialog,
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
    restylePending: restyleCampaign.isPending,
    exportPending: exportMutation.isPending,
    deliveryPackagePending: createDeliveryPackage.isPending,
    planData,
    generatePlanPending: generatePlanMutation.isPending,
    updatePlanStatusPending: updatePlanStatusMutation.isPending,
  };
}
