"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { useCampaign, useDeleteCampaign } from "@/lib/hooks/use-campaigns";
import { useDerivations } from "@/lib/hooks/use-derivations";
import { useTranslations } from "next-intl";
import { mapWorkspaceDerivations } from "@/lib/hooks/workspace/map-workspace-derivations";
import {
  resolveVisibleWorkspaceState,
  useWorkspaceNavigation,
  type WorkspaceSurfaceState,
} from "@/lib/hooks/workspace/use-workspace-navigation";

/** @deprecated Prefer WorkspaceSurfaceState — kept for public API stability. */
export type WorkspaceState = WorkspaceSurfaceState;

/**
 * Campaign workspace facade (Phase 6 / item 48).
 * Read-only since #790: the Campanha shows its Peças and the stage, and can be
 * deleted. Reviewing and delivering old Peças of a Campanha is the Assistente's job.
 */
export function useCampaignWorkspace(campaignId: string, isNew: boolean) {
  const router = useRouter();
  const t = useTranslations("campaign");
  const td = useTranslations("derivation");
  const tc = useTranslations("common");

  const setCurrentPageTitle = useAppStore((s) => s.setCurrentPageTitle);
  const addToast = useAppStore((s) => s.addToast);

  const {
    campaign: realCampaign,
    isLoading,
    isError,
    loadErrorKind,
    refetch: refetchCampaign,
  } = useCampaign(campaignId);
  const deleteCampaign = useDeleteCampaign();

  const derivationsQuery = useDerivations(campaignId);
  const {
    data: derivationsData,
    summary: derivationSummary,
    isError: derivationsFailed,
    isFetchNextPageError: loadMoreDerivationsFailed,
    errorKind: derivationsErrorKind,
    refetch: refetchDerivations,
  } = derivationsQuery;
  // A failed "Carregar mais" stays a grid-level notice next to its button: the
  // loaded pages are fine, and a page-level retry would refetch only those.
  const isDerivationsError = derivationsFailed && !loadMoreDerivationsFailed;

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

  // Counts, the stage and the generating flag cover every Peça of the
  // Campanha: they come from the server summary, never from the loaded pages.
  const isGenerating = derivationSummary?.isGenerating ?? false;

  const visibleWorkspaceState = resolveVisibleWorkspaceState(
    nav.workspaceState,
    {
      isLoading,
      isNew,
      derivationCount: derivationSummary?.total ?? 0,
    }
  );

  /** Loaded pages, newest first: what the grid shows. */
  const loadedDerivations = useMemo(
    () =>
      mapWorkspaceDerivations(
        (derivationsData ?? []) as Parameters<typeof mapWorkspaceDerivations>[0],
        campaign,
        td
      ),
    [derivationsData, campaign, td]
  );

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
    derivationSummary,
    loadedDerivations,
    hasMoreDerivations: derivationsQuery.hasNextPage,
    loadMoreDerivations: derivationsQuery.fetchNextPage,
    loadingMoreDerivations: derivationsQuery.isFetchingNextPage,
    // The Peças answered in this visit, not from an older cache: the grid only
    // reads an empty Campanha from them then (#786).
    derivationsAnsweredInVisit: derivationsQuery.isFetchedAfterMount && derivationsQuery.isSuccess,
    derivationsFetching: derivationsQuery.isFetching,
    loadMoreDerivationsFailed,
    workspaceState: visibleWorkspaceState,
    isGenerating,
    goToSetup: nav.goToSetup,
    goToTrabalho: nav.goToTrabalho,
    handleDelete,
    handleDeleteClick,
    showDeleteDialog,
    setShowDeleteDialog,
  };
}
