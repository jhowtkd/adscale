"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { useCampaign, useUpdateCampaign, useDeleteCampaign } from "@/lib/hooks/use-campaigns";
import {
  useDerivations,
  useCreateDerivations,
  useRestyleCampaign,
} from "@/lib/hooks/use-derivations";
import { useRegenerateDerivation } from "@/lib/hooks/use-regenerate";
import { useExport } from "@/lib/hooks/use-export";
import { useReviewDerivation } from "@/lib/hooks/use-review";
import { useCreateDeliveryPackage } from "@/lib/hooks/use-delivery-package";
import { useCreativeQa } from "@/lib/hooks/use-creative-qa";
import { useGeneratePlan, useUpdatePlanStatus } from "./use-plan";
import { useTranslations } from "next-intl";
import { useMissionInsightOptional } from "@/components/mission-insights/MissionInsightProvider";
import type { OutputLearningApplicationSnapshot } from "@/server/human-quality/corpus";
import { invalidateCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { mapWorkspaceDerivations } from "@/lib/hooks/workspace/map-workspace-derivations";
import {
  resolveVisibleWorkspaceState,
  useWorkspaceNavigation,
  type WorkspaceSurfaceState,
} from "@/lib/hooks/workspace/use-workspace-navigation";
import { useWorkspaceProduce } from "@/lib/hooks/workspace/use-workspace-produce";
import { useWorkspaceReview } from "@/lib/hooks/workspace/use-workspace-review";
import { useWorkspaceDeliver } from "@/lib/hooks/workspace/use-workspace-deliver";

/** @deprecated Prefer WorkspaceSurfaceState — kept for public API stability. */
export type WorkspaceState = WorkspaceSurfaceState;

/**
 * Campaign workspace facade (Phase 6 / item 48).
 * Composes narrow flow modules: navigation · produce · review · deliver.
 */
export function useCampaignWorkspace(
  campaignId: string,
  isNew: boolean,
  options?: {
    pendingOutputLearningApplication?: OutputLearningApplicationSnapshot | null;
  }
) {
  const pendingOutputLearningApplication =
    options?.pendingOutputLearningApplication ?? null;
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
    produceSurface,
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
  const creativeQa = useCreativeQa();
  const generatePlanMutation = useGeneratePlan(campaignId);
  const updatePlanStatusMutation = useUpdatePlanStatus(campaignId);

  const campaign = useMemo(() => {
    if (realCampaign) {
      return {
        id: realCampaign.id,
        workspaceId: realCampaign.workspaceId,
        name: realCampaign.name,
        client: realCampaign.client,
        clientProfileId: realCampaign.clientProfileId,
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

  const nav = useWorkspaceNavigation();

  const hasActiveDerivations = Boolean(
    derivationsData?.some(
      (d) => d.status === "queued" || d.status === "processing"
    )
  );
  const isGenerating = hasActiveDerivations;

  const visibleWorkspaceState = resolveVisibleWorkspaceState(
    nav.workspaceState,
    {
      isLoading,
      isNew,
      derivationCount: derivationsData?.length ?? 0,
    }
  );

  const savePilot = useCallback(
    async (
      assetId: string,
      briefing: {
        product?: string;
        offer?: string;
        objective?: string;
        audience?: string;
        tone?: string;
        platforms?: string;
        ctaText?: string;
        constraints?: string;
        notes?: string;
      }
    ) => {
      const res = await fetch(`/api/campaigns/${campaignId}/pilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, briefing }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 429 || err.error === "rateLimitExceeded") {
          throw new Error("rateLimitExceeded");
        }
        throw new Error("Failed to save pilot");
      }
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
      void invalidateCanonicalWorks(queryClient);
      nav.setWorkspaceState("trabalho");
    },
    [campaignId, queryClient, nav]
  );

  const allDerivations = useMemo(
    () =>
      mapWorkspaceDerivations(
        (derivationsData ?? []) as Parameters<typeof mapWorkspaceDerivations>[0],
        campaign,
        td
      ),
    [derivationsData, campaign, td]
  );

  const approvedDerivation = useMemo(
    () => allDerivations.find((derivation) => derivation.status === "approved"),
    [allDerivations]
  );

  const produce = useWorkspaceProduce({
    campaignId,
    isNew,
    campaign,
    allDerivations,
    produceSurface,
    currentRoute,
    pendingOutputLearningApplication,
    createDerivations,
    restyleCampaign,
    updateCampaign,
    setWorkspaceState: nav.setWorkspaceState,
    addToast,
    tc,
    missionInsight,
  });

  const review = useWorkspaceReview({
    campaignId,
    allDerivations,
    regenerateMutation,
    reviewMutation,
    creativeQa,
    addToast,
    tc,
    missionInsight,
  });

  const deliver = useWorkspaceDeliver({
    campaignId,
    allDerivations,
    exportMutation,
    createDeliveryPackage,
    addToast,
    tc,
    missionInsight,
  });

  const handleSaveAsReference = useCallback(
    (_id: string) => {
      addToast("info", "Feature unavailable");
    },
    [addToast]
  );

  const [savingReferenceId] = useState<string | null>(null);
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
    workspaceId: derivationsData?.[0]?.workspaceId,
    isLoading,
    isError,
    loadErrorKind,
    refetchCampaign,
    isDerivationsError,
    derivationsErrorKind,
    refetchDerivations,
    allDerivations,
    approvedDerivation,
    reviewDerivationId: review.reviewDerivationId,
    regenerateDialog: review.regenerateDialog,
    workspaceState: visibleWorkspaceState,
    isGenerating,
    savingReferenceId,
    deliveryModalOpen: deliver.deliveryModalOpen,
    selectedDeliverySource: deliver.selectedDeliverySource,
    handleDeliveryModalOpenChange: deliver.handleDeliveryModalOpenChange,
    goToSetup: nav.goToSetup,
    goToTrabalho: nav.goToTrabalho,
    savePilot,
    handleGenerateDerivations: produce.handleGenerateDerivations,
    configureAndGenerate: produce.configureAndGenerate,
    handleRestyle: produce.handleRestyle,
    handleSaveAsReference,
    hasActivePreview: produce.hasActivePreview,
    previewDerivation: produce.previewDerivation,
    showPreviewGate: produce.showPreviewGate,
    batchCreditEstimate: produce.batchCreditEstimate,
    batchCreditBreakdown: produce.batchCreditBreakdown,
    approvePreviewToBatch: produce.approvePreviewToBatch,
    handlePreview: review.handlePreview,
    handleCloseReview: review.handleCloseReview,
    handleRequestRegenerate: review.handleRequestRegenerate,
    handleConfirmRegenerate: review.handleConfirmRegenerate,
    handleCloseRegenerateDialog: review.handleCloseRegenerateDialog,
    handleDownloadDerivation: deliver.handleDownloadDerivation,
    handleRegenerateDerivation: review.handleRegenerateDerivation,
    handleApproveDerivation: review.handleApproveDerivation,
    handleRejectDerivation: review.handleRejectDerivation,
    handleReviewDecision: review.handleReviewDecision,
    handleRunQa: review.handleRunQa,
    handleCreateDeliveryPackage: deliver.handleCreateDeliveryPackage,
    handleConfirmDeliveryPackage: deliver.handleConfirmDeliveryPackage,
    handleDownloadDeliverySource: deliver.handleDownloadDeliverySource,
    handleExportDerivation: deliver.handleExportDerivation,
    handleDelete,
    handleDeleteClick,
    showDeleteDialog,
    setShowDeleteDialog,
    creativeQaPending: review.creativeQaPending,
    creativeQaVariables: review.creativeQaVariables,
    reviewPending: review.reviewPending,
    reviewVariables: review.reviewVariables,
    regeneratePending: review.regeneratePending,
    regenerateVariables: review.regenerateVariables,
    createDerivationsPending: produce.createDerivationsPending,
    restylePending: produce.restylePending,
    exportPending: deliver.exportPending,
    deliveryPackagePending: deliver.deliveryPackagePending,
    generatePlanPending: generatePlanMutation.isPending,
    updatePlanStatusPending: updatePlanStatusMutation.isPending,
  };
}
