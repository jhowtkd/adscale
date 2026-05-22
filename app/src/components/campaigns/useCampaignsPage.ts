"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppStore } from "@/lib/store";
import type { AdPlatform, CampaignStatus, Campaign } from "@/lib/mock-data";
import { toast } from "sonner";

import {
  useCampaigns,
  useCreateCampaign,
  useUpdateCampaigns,
  useDeleteCampaigns,
  useDuplicateCampaign,
} from "@/lib/hooks/use-campaigns";

import { useTranslations } from "next-intl";

import type { ViewMode, SortOption, StatusFilter, PlatformFilter } from "./types";

export function useCampaignsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setCurrentPageTitle = useAppStore((s) => s.setCurrentPageTitle);
  const t = useTranslations("campaign");
  const tc = useTranslations("common");
  const te = useTranslations("errors");

  const createCampaign = useCreateCampaign();
  const updateCampaigns = useUpdateCampaigns();
  const deleteCampaigns = useDeleteCampaigns();
  const duplicateCampaign = useDuplicateCampaign();

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [modalOpen, setModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const searchQuery = searchParams.get("q") ?? "";

  const campaignQuery = {
    searchQuery,
    statusFilter,
    platformFilter,
    sortOption,
    page: currentPage,
    limit: itemsPerPage,
  };

  const { campaigns, totalCount, isLoading, isError, error } = useCampaigns(campaignQuery);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [saveTemplateCampaign, setSaveTemplateCampaign] = useState<Campaign | null>(null);

  const updateSearchQuery = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) {
      params.set("q", value);
    } else {
      params.delete("q");
    }
    const query = params.toString();
    router.replace(`/campaigns${query ? `?${query}` : ""}`, { scroll: false });
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [router, searchParams]);

  const updateStatusFilter = useCallback((value: StatusFilter) => {
    setStatusFilter(value);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);

  const updatePlatformFilter = useCallback((value: PlatformFilter) => {
    setPlatformFilter(value);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);

  const updateSortOption = useCallback((value: SortOption) => {
    setSortOption(value);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);

  const updateItemsPerPage = useCallback((value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);

  const clearFilters = useCallback(() => {
    updateSearchQuery("");
    setStatusFilter("all");
    setPlatformFilter("all");
    setCurrentPage(1);
  }, [updateSearchQuery]);

  useEffect(() => {
    setCurrentPageTitle(tc("campaign"));
  }, [setCurrentPageTitle, tc]);

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const visibleCurrentPage = Math.min(currentPage, totalPages);

  const activeFilters = useMemo(() => {
    const filters: Array<{ label: string; onRemove: () => void }> = [];
    if (searchQuery) {
      filters.push({
        label: `${tc("search")}: "${searchQuery}"`,
        onRemove: () => updateSearchQuery(""),
      });
    }
    if (statusFilter !== "all") {
      filters.push({
        label: `${tc("status")}: ${t(`status.${statusFilter}`)}`,
        onRemove: () => updateStatusFilter("all"),
      });
    }
    if (platformFilter !== "all") {
      filters.push({
        label: `${tc("platforms")}: ${t(`platformNames.${platformFilter}`)}`,
        onRemove: () => updatePlatformFilter("all"),
      });
    }
    return filters;
  }, [
    searchQuery,
    statusFilter,
    platformFilter,
    updateSearchQuery,
    updateStatusFilter,
    updatePlatformFilter,
    t,
    tc,
  ]);

  const hasActiveFilters = activeFilters.length > 0;

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedIds(new Set(campaigns.map((c) => c.id)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [campaigns]
  );

  const allSelected =
    campaigns.length > 0 && campaigns.every((c) => selectedIds.has(c.id));

  const handleCreateCampaign = useCallback(
    (data: {
      name: string;
      client: string;
      generationMode: "art_variation" | "format_adaptation" | "restyling";
      targetFormats?: string[];
      constraints?: string;
      notes?: string;
      platforms: AdPlatform[];
      status: CampaignStatus;
      variations: number;
      creditsUsed: number;
    }) => {
      createCampaign.mutate(
        {
          name: data.name,
          client: data.client,
          generationMode: data.generationMode,
          targetFormats: data.targetFormats,
          constraints: data.constraints,
          notes: data.notes,
          platforms: data.platforms,
        },
        {
          onSuccess: (campaign) => {
            toast.success(tc("campaignCreated", { name: data.name }));
            setModalOpen(false);
            router.push(`/campaigns/${campaign.id}`);
          },
          onError: (err) => {
            toast.error(err.message || tc("failedCreateCampaign"));
          },
        }
      );
    },
    [createCampaign, router, tc]
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      duplicateCampaign.mutate(id, {
        onSuccess: () => {
          toast.success(tc("campaignDuplicated"));
        },
        onError: (err) => {
          toast.error(err.message || tc("failedDuplicateCampaign"));
        },
      });
    },
    [duplicateCampaign, tc]
  );

  const handleArchive = useCallback(
    (id: string) => {
      updateCampaigns.mutate(
        { id, payload: { status: "draft" } },
        {
          onSuccess: () => {
            toast.success(tc("campaignArchived"));
          },
          onError: (err) => {
            toast.error(err.message || tc("failedArchiveCampaign"));
          },
        }
      );
    },
    [updateCampaigns, tc]
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteCampaigns.mutate(id, {
        onSuccess: () => {
          setDeleteTarget(null);
          toast.success(tc("campaignDeleted"));
        },
        onError: (err) => {
          toast.error(err.message || tc("failedDeleteCampaign"));
        },
      });
    },
    [deleteCampaigns, tc]
  );

  const handleBulkArchive = useCallback(() => {
    const promises = Array.from(selectedIds).map((id) =>
      updateCampaigns.mutateAsync({ id, payload: { status: "draft" } })
    );
    Promise.all(promises)
      .then(() => {
        setSelectedIds(new Set());
        toast.success(tc("campaignsArchived", { count: selectedIds.size }));
      })
      .catch(() => {
        toast.error(tc("failedArchiveSome"));
      });
  }, [selectedIds, updateCampaigns, tc]);

  const handleBulkDelete = useCallback(() => {
    const promises = Array.from(selectedIds).map((id) =>
      deleteCampaigns.mutateAsync(id)
    );
    Promise.all(promises)
      .then(() => {
        setSelectedIds(new Set());
        toast.success(tc("campaignsDeleted", { count: selectedIds.size }));
      })
      .catch(() => {
        toast.error(tc("failedDeleteSome"));
      });
  }, [selectedIds, deleteCampaigns, tc]);

  const startIndex = totalCount === 0 ? 0 : (visibleCurrentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(visibleCurrentPage * itemsPerPage, totalCount);

  const pageNumbers = useMemo(() => {
    const pages: (number | "ellipsis")[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (visibleCurrentPage > 3) pages.push("ellipsis");
      const start = Math.max(2, visibleCurrentPage - 1);
      const end = Math.min(totalPages - 1, visibleCurrentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (visibleCurrentPage < totalPages - 2) pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  }, [visibleCurrentPage, totalPages]);

  return {
    campaigns,
    totalCount,
    isLoading,
    isError,
    error,
    viewMode,
    setViewMode,
    modalOpen,
    setModalOpen,
    statusFilter,
    setStatusFilter,
    platformFilter,
    setPlatformFilter,
    sortOption,
    setSortOption,
    selectedIds,
    setSelectedIds,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    searchQuery,
    deleteTarget,
    setDeleteTarget,
    saveTemplateCampaign,
    setSaveTemplateCampaign,
    updateSearchQuery,
    updateStatusFilter,
    updatePlatformFilter,
    updateSortOption,
    updateItemsPerPage,
    clearFilters,
    totalPages,
    visibleCurrentPage,
    activeFilters,
    hasActiveFilters,
    toggleSelect,
    toggleSelectAll,
    allSelected,
    handleCreateCampaign,
    handleDuplicate,
    handleArchive,
    handleDelete,
    handleBulkArchive,
    handleBulkDelete,
    startIndex,
    endIndex,
    pageNumbers,
    t,
    tc,
    te,
  };
}
