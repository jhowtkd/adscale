"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Campaign } from "@/lib/mock-data";
import { toast } from "sonner";

import {
  useCampaigns,
  useCreateCampaign,
  useUpdateCampaigns,
  useDeleteCampaigns,
  useDuplicateCampaign,
} from "@/lib/hooks/use-campaigns";
import {
  fetchTemplate,
  TemplateLoadError,
  type CampaignTemplate,
} from "@/lib/hooks/use-templates";

import { useTranslations } from "next-intl";

import type { ViewMode, SortOption, StatusFilter, PlatformFilter } from "./types";

interface CampaignSearchParams {
  get(name: string): string | null;
  toString(): string;
}

type TemplateLoadState = "idle" | "loading" | "ready" | "error" | "not_found";

function stripCreationParams(searchParams: CampaignSearchParams) {
  const params = new URLSearchParams(searchParams.toString());
  params.delete("new");
  params.delete("templateId");
  const query = params.toString();
  return `/campaigns${query ? `?${query}` : ""}`;
}

export function useCampaignsPage(searchParams: CampaignSearchParams) {
  const router = useRouter();
  const t = useTranslations("campaign");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const tTemplate = useTranslations("template");

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
  const [pendingSearch, setPendingSearch] = useState<string | null>(null);
  const [prevUrlSearchQuery, setPrevUrlSearchQuery] = useState(searchQuery);
  const searchInput = pendingSearch ?? searchQuery;
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUrlApplyRef = useRef<string | null>(null);
  const pendingSearchRef = useRef<string | null>(null);

  if (searchQuery !== prevUrlSearchQuery) {
    setPrevUrlSearchQuery(searchQuery);
    setPendingSearch((current) => {
      if (current === null) {
        pendingSearchRef.current = null;
        return null;
      }
      if (
        pendingUrlApplyRef.current !== null &&
        searchQuery === pendingUrlApplyRef.current
      ) {
        pendingUrlApplyRef.current = null;
        pendingSearchRef.current = current;
        return current;
      }
      pendingUrlApplyRef.current = null;
      pendingSearchRef.current = null;
      return null;
    });
  }

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const templateIdParam = searchParams.get("templateId");
  const newParam = searchParams.get("new");
  const shouldOpenNewModal =
    newParam !== null &&
    (newParam === "1" || newParam === "true" || newParam === "");

  const [templateLoadState, setTemplateLoadState] =
    useState<TemplateLoadState>("idle");
  const [loadedTemplate, setLoadedTemplate] = useState<CampaignTemplate | null>(
    null
  );
  const [templateRetryToken, setTemplateRetryToken] = useState(0);
  const activeTemplateLoadRef = useRef<string | null>(null);

  const clearCreationQueryParams = useCallback(() => {
    const nextUrl = stripCreationParams(searchParams);
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [searchParams]);

  const dismissTemplateFlow = useCallback(() => {
    setTemplateLoadState("idle");
    setLoadedTemplate(null);
    setModalOpen(false);
    activeTemplateLoadRef.current = null;
    clearCreationQueryParams();
  }, [clearCreationQueryParams]);

  // Bare ?new=1 (no template): open modal immediately and strip only `new`.
  const [consumedNewParam, setConsumedNewParam] = useState<string | null>(null);
  if (
    shouldOpenNewModal &&
    !templateIdParam &&
    consumedNewParam !== newParam
  ) {
    setConsumedNewParam(newParam);
    if (!modalOpen) {
      setModalOpen(true);
    }
  }

  useEffect(() => {
    if (!shouldOpenNewModal || templateIdParam || consumedNewParam !== newParam) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    const query = params.toString();
    const nextUrl = `/campaigns${query ? `?${query}` : ""}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [
    shouldOpenNewModal,
    templateIdParam,
    consumedNewParam,
    newParam,
    searchParams,
  ]);

  // ?templateId=… — load before opening modal; keep params until success/cancel.
  useEffect(() => {
    if (!templateIdParam) return;

    const loadKey = `${templateIdParam}:${templateRetryToken}`;
    if (activeTemplateLoadRef.current === loadKey) return;
    activeTemplateLoadRef.current = loadKey;

    let cancelled = false;
    setTemplateLoadState("loading");
    setLoadedTemplate(null);
    setModalOpen(false);

    void fetchTemplate(templateIdParam)
      .then((template) => {
        if (cancelled) return;
        setLoadedTemplate(template);
        setTemplateLoadState("ready");
        setModalOpen(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status =
          err instanceof TemplateLoadError ? err.status : undefined;
        if (status === 404) {
          setTemplateLoadState("not_found");
          toast.error(tTemplate("loadTemplateNotFound"));
        } else {
          setTemplateLoadState("error");
          toast.error(tTemplate("loadTemplateError"));
        }
        setLoadedTemplate(null);
        setModalOpen(false);
      });

    return () => {
      cancelled = true;
    };
  }, [templateIdParam, templateRetryToken, tTemplate]);

  const retryTemplateLoad = useCallback(() => {
    activeTemplateLoadRef.current = null;
    setTemplateRetryToken((n) => n + 1);
  }, []);

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

  const applySearchQueryToUrl = useCallback((value: string) => {
    pendingUrlApplyRef.current = value;
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

  const clearSearchQuery = useCallback(() => {
    pendingSearchRef.current = null;
    setPendingSearch(null);
    pendingUrlApplyRef.current = null;
    applySearchQueryToUrl("");
  }, [applySearchQueryToUrl]);

  const handleSearchChange = useCallback(
    (value: string) => {
      pendingSearchRef.current = value;
      setPendingSearch(value);
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      const scheduledValue = value;
      searchDebounceRef.current = setTimeout(() => {
        const current = pendingSearchRef.current;
        if (current !== scheduledValue) {
          return;
        }
        pendingSearchRef.current = null;
        setPendingSearch(null);
        applySearchQueryToUrl(scheduledValue);
      }, 300);
    },
    [applySearchQueryToUrl],
  );

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
    clearSearchQuery();
    setStatusFilter("all");
    setPlatformFilter("all");
    setCurrentPage(1);
  }, [clearSearchQuery]);

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const visibleCurrentPage = Math.min(currentPage, totalPages);

  const activeFilters = useMemo(() => {
    const filters: Array<{ label: string; onRemove: () => void }> = [];
    if (searchQuery) {
      // clearSearchQuery writes pending* refs; chip onRemove only runs on click.
      // eslint-disable-next-line react-hooks/refs -- event handler, not render read
      filters.push({
        label: `${tc("search")}: "${searchQuery}"`,
        onRemove: clearSearchQuery,
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
    clearSearchQuery,
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

  const handleModalOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        if (templateIdParam) {
          dismissTemplateFlow();
          return;
        }
        setModalOpen(false);
        return;
      }
      setModalOpen(true);
    },
    [templateIdParam, dismissTemplateFlow]
  );

  const handleCreateCampaign = useCallback(
    (data: {
      name: string;
      client: string;
      clientProfileId: string | null;
    }) => {
      const fromTemplate = loadedTemplate;
      createCampaign.mutate(
        {
          name: data.name,
          client: data.client,
          // Generic template: never attach brand/refs from snapshot.
          clientProfileId: null,
          ...(fromTemplate
            ? {
                product: fromTemplate.product ?? undefined,
                objective: fromTemplate.objective ?? undefined,
                audience: fromTemplate.audience ?? undefined,
                platforms: fromTemplate.platforms ?? undefined,
                tone: fromTemplate.tone ?? undefined,
                offer: fromTemplate.offer ?? undefined,
                constraints: fromTemplate.constraints ?? undefined,
                notes: fromTemplate.notes ?? undefined,
                generationMode: fromTemplate.generationMode,
                creativeLevel: (fromTemplate.creativeLevel as
                  | "conservative"
                  | "balanced"
                  | "bold"
                  | "extreme"
                  | null) ?? undefined,
                styleIntensity: (fromTemplate.styleIntensity as
                  | "soft"
                  | "medium"
                  | "strong"
                  | null) ?? undefined,
                ctaVariants: fromTemplate.ctaVariants ?? undefined,
                targetFormats: fromTemplate.targetFormats ?? undefined,
              }
            : {}),
        },
        {
          onSuccess: (campaign) => {
            toast.success(tc("campaignCreated", { name: data.name }));
            setModalOpen(false);
            setLoadedTemplate(null);
            setTemplateLoadState("idle");
            activeTemplateLoadRef.current = null;
            clearCreationQueryParams();
            router.push(`/campaigns/${campaign.id}`);
          },
          onError: (err) => {
            toast.error(err.message || tc("failedCreateCampaign"));
          },
        }
      );
    },
    [createCampaign, router, tc, loadedTemplate, clearCreationQueryParams]
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

  const modalInitialValues = loadedTemplate
    ? {
        name: loadedTemplate.name,
        clientName: loadedTemplate.client ?? "",
      }
    : null;

  return {
    campaigns,
    totalCount,
    isLoading,
    isError,
    error,
    viewMode,
    setViewMode,
    modalOpen,
    setModalOpen: handleModalOpenChange,
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
    searchInput,
    handleSearchChange,
    deleteTarget,
    setDeleteTarget,
    saveTemplateCampaign,
    setSaveTemplateCampaign,
    clearSearchQuery,
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
    templateLoadState,
    loadedTemplate,
    modalInitialValues,
    retryTemplateLoad,
    dismissTemplateFlow,
    createPending: createCampaign.isPending,
    t,
    tc,
    te,
    tTemplate,
  };
}
