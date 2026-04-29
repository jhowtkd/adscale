"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import type { AdPlatform, CampaignStatus } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import CampaignCard from "@/components/campaigns/CampaignCard";
import CampaignTableRow from "@/components/campaigns/CampaignTableRow";
import NewCampaignModal from "@/components/campaigns/NewCampaignModal";
import EmptyState from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

import {
  useCampaigns,
  useCreateCampaign,
  useUpdateCampaigns,
  useDeleteCampaigns,
  useDuplicateCampaign,
} from "@/lib/hooks/use-campaigns";

import {
  Plus,
  Search,
  X,
  List,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Archive,
} from "lucide-react";
import { useTranslations } from "next-intl";

// ============================================
// Types
// ============================================

type ViewMode = "list" | "grid";
type SortOption = "newest" | "oldest" | "name-asc" | "name-desc" | "variations";
type StatusFilter = "all" | "draft" | "active" | "generating" | "completed" | "failed";
type PlatformFilter = "all" | "Meta" | "TikTok" | "Google";

// ============================================
// Animation Variants
// ============================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

// ============================================
// Loading Skeletons
// ============================================

function TableSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-dim)] bg-[var(--surface-raised)]">
        <div className="flex gap-4">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24 ml-auto" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-8" />
        </div>
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "px-4 py-4 border-b border-[var(--border-dim)] flex items-center gap-4",
            i % 2 === 1 && "bg-[rgba(0,0,0,0.02)]"
          )}
        >
          <Skeleton className="h-4 w-4 flex-shrink-0" />
          <div className="flex-1 min-w-[200px] space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-8" />
        </div>
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] overflow-hidden"
        >
          <Skeleton className="h-[140px] w-full" />
          <div className="p-4 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-4 w-12 rounded-full" />
              <Skeleton className="h-4 w-12 rounded-full" />
            </div>
            <div className="flex justify-between pt-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Main Page Component
// ============================================

export default function CampaignsListPage() {
  const router = useRouter();
  const setCurrentPageTitle = useAppStore((s) => s.setCurrentPageTitle);
  const t = useTranslations("campaign");
  const tc = useTranslations("common");
  const te = useTranslations("errors");

  const { campaigns, isLoading, isError, error } = useCampaigns();
  const createCampaign = useCreateCampaign();
  const updateCampaigns = useUpdateCampaigns();
  const deleteCampaigns = useDeleteCampaigns();
  const duplicateCampaign = useDuplicateCampaign();

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [modalOpen, setModalOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const updateSearchQuery = useCallback((value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  }, []);

  const updateStatusFilter = useCallback((value: StatusFilter) => {
    setStatusFilter(value);
    setCurrentPage(1);
  }, []);

  const updatePlatformFilter = useCallback((value: PlatformFilter) => {
    setPlatformFilter(value);
    setCurrentPage(1);
  }, []);

  const updateSortOption = useCallback((value: SortOption) => {
    setSortOption(value);
    setCurrentPage(1);
  }, []);

  const updateItemsPerPage = useCallback((value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("all");
    setPlatformFilter("all");
    setCurrentPage(1);
  }, []);

  // ---- Effects ----

  useEffect(() => {
    setCurrentPageTitle(tc("campaign"));
  }, [setCurrentPageTitle, tc]);

  // ---- Filtering & Sorting ----

  const filteredCampaigns = useMemo(() => {
    let result = [...campaigns];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.platforms.some((p) => p.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }

    // Platform filter
    if (platformFilter !== "all") {
      result = result.filter((c) => c.platforms.includes(platformFilter as AdPlatform));
    }

    // Sort
    switch (sortOption) {
      case "newest":
        result.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
        break;
      case "oldest":
        result.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());
        break;
      case "name-asc":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "variations":
        result.sort((a, b) => b.variations - a.variations);
        break;
    }

    return result;
  }, [campaigns, searchQuery, statusFilter, platformFilter, sortOption]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / itemsPerPage));
  const paginatedCampaigns = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredCampaigns.slice(start, start + itemsPerPage);
  }, [filteredCampaigns, currentPage, itemsPerPage]);

  // Active filters
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

  // ---- Selection Handlers ----

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
        setSelectedIds(new Set(paginatedCampaigns.map((c) => c.id)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [paginatedCampaigns]
  );

  const allSelected =
    paginatedCampaigns.length > 0 &&
    paginatedCampaigns.every((c) => selectedIds.has(c.id));

  // ---- Action Handlers ----

  const handleCreateCampaign = useCallback(
    (data: {
      name: string;
      client: string;
      generationMode: "art_variation" | "format_adaptation";
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

  // ---- Pagination ----

  const startIndex = (currentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(currentPage * itemsPerPage, filteredCampaigns.length);

  const pageNumbers = useMemo(() => {
    const pages: (number | "ellipsis")[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("ellipsis");
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  }, [currentPage, totalPages]);

  // ---- Render ----

  return (
    <div className="max-w-7xl mx-auto">
      {/* ============ Header ============ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.19, 1, 0.22, 1] as [number, number, number, number] }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--border-dim)]"
      >
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
              {tc("campaign")}
            </h1>
            <span className="inline-flex items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] text-xs font-medium px-2.5 py-0.5 min-w-[24px] h-6">
              {filteredCampaigns.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {t("manageCampaigns")}
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <Button
            onClick={() => setModalOpen(true)}
            className="bg-[var(--accent-mint)] text-white hover:bg-[var(--accent-mint-light)] hover:-translate-y-px active:scale-[0.98] transition-all duration-200 h-9 px-4"
          >
            <Plus size={16} />
            {t("new")}
          </Button>
        </motion.div>
      </motion.div>

      {/* ============ Filter Toolbar ============ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3, ease: [0.19, 1, 0.22, 1] as [number, number, number, number] }}
        className="mt-5"
      >
        {/* Bulk action bar */}
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
              className="mb-3 flex items-center justify-between rounded-lg px-4 py-3"
              style={{ backgroundColor: "var(--accent-mint-dim)" }}
            >
              <span className="text-sm font-medium text-[var(--accent-mint)]">
                {selectedIds.size} {tc("selected")}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkArchive}
                  className="border-[var(--border-dim)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] h-7 text-xs"
                >
                  <Archive size={14} className="mr-1" />
                  {tc("archive")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="h-7 text-xs"
                >
                  <Trash2 size={14} className="mr-1" />
                  {tc("delete")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] h-7 text-xs"
                >
                  {tc("cancel")}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filters */}
        <div className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-3">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3">
            {/* Search */}
            <div className="relative w-full lg:w-[280px]">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
              />
              <Input
                value={searchQuery}
                onChange={(e) => updateSearchQuery(e.target.value)}
                placeholder={tc("search")}
                className="h-8 w-full pl-9 pr-8 bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => updateSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Status Filter */}
              <Select
                value={statusFilter}
                onValueChange={(v) => updateStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="h-8 w-[140px] bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs">
                  <SelectValue placeholder={tc("allStatus")} />
                </SelectTrigger>
                <SelectContent className="bg-[var(--surface-raised)] border-[var(--border-dim)]">
                  <SelectItem value="all" className="text-[var(--text-primary)] text-xs">{tc("allStatus")}</SelectItem>
                  <SelectItem value="draft" className="text-[var(--text-primary)] text-xs">{t("status.draft")}</SelectItem>
                  <SelectItem value="active" className="text-[var(--text-primary)] text-xs">{t("status.active")}</SelectItem>
                  <SelectItem value="generating" className="text-[var(--text-primary)] text-xs">{t("status.generating")}</SelectItem>
                  <SelectItem value="completed" className="text-[var(--text-primary)] text-xs">{t("status.completed")}</SelectItem>
                  <SelectItem value="failed" className="text-[var(--text-primary)] text-xs">{t("status.failed")}</SelectItem>
                </SelectContent>
              </Select>

              {/* Platform Filter */}
              <Select
                value={platformFilter}
                onValueChange={(v) => updatePlatformFilter(v as PlatformFilter)}
              >
                <SelectTrigger className="h-8 w-[150px] bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs">
                  <SelectValue placeholder={tc("allPlatforms")} />
                </SelectTrigger>
                <SelectContent className="bg-[var(--surface-raised)] border-[var(--border-dim)]">
                  <SelectItem value="all" className="text-[var(--text-primary)] text-xs">{tc("allPlatforms")}</SelectItem>
                  <SelectItem value="Meta" className="text-[var(--text-primary)] text-xs">{t("platformNames.Meta")}</SelectItem>
                  <SelectItem value="TikTok" className="text-[var(--text-primary)] text-xs">{t("platformNames.TikTok")}</SelectItem>
                  <SelectItem value="Google" className="text-[var(--text-primary)] text-xs">{t("platformNames.Google")}</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort */}
              <Select
                value={sortOption}
                onValueChange={(v) => updateSortOption(v as SortOption)}
              >
                <SelectTrigger className="h-8 w-[140px] bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs">
                  <SelectValue placeholder={tc("sort")} />
                </SelectTrigger>
                <SelectContent className="bg-[var(--surface-raised)] border-[var(--border-dim)]">
                  <SelectItem value="newest" className="text-[var(--text-primary)] text-xs">{tc("newest")}</SelectItem>
                  <SelectItem value="oldest" className="text-[var(--text-primary)] text-xs">{tc("oldest")}</SelectItem>
                  <SelectItem value="name-asc" className="text-[var(--text-primary)] text-xs">{tc("nameAsc")}</SelectItem>
                  <SelectItem value="name-desc" className="text-[var(--text-primary)] text-xs">{tc("nameDesc")}</SelectItem>
                  <SelectItem value="variations" className="text-[var(--text-primary)] text-xs">{tc("mostDerivations")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* View Toggle */}
            <div className="ml-auto flex items-center rounded-lg bg-[var(--surface-raised)] p-0.5">
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "flex items-center justify-center h-7 w-7 rounded-md transition-all duration-200",
                  viewMode === "list"
                    ? "bg-[var(--surface-base)] text-[var(--accent-mint)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                <List size={16} />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "flex items-center justify-center h-7 w-7 rounded-md transition-all duration-200",
                  viewMode === "grid"
                    ? "bg-[var(--surface-base)] text-[var(--accent-blue)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>

          {/* Active filter pills */}
          <AnimatePresence>
            {hasActiveFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border-dim)] overflow-hidden"
              >
                <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
                  {tc("filters")}:
                </span>
                {activeFilters.map((filter, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] text-xs px-2.5 py-1 border border-[var(--border-dim)]"
                  >
                    {filter.label}
                    <button
                      onClick={filter.onRemove}
                      className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--accent-rose)] transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <button
                  onClick={clearFilters}
                  className="text-xs text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors ml-1"
                >
                  {tc("clearAll")}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ============ Content ============ */}
      <div className="mt-5">
        {isLoading ? (
          viewMode === "list" ? <TableSkeleton /> : <GridSkeleton />
        ) : isError ? (
          <EmptyState
            illustration="/empty-campaigns.svg"
            title={tc("errorLoading")}
            description={error?.message || te("generic")}
            action={{
              label: tc("retry"),
              onClick: () => window.location.reload(),
            }}
          />
        ) : filteredCampaigns.length === 0 ? (
          <EmptyState
            illustration="/empty-campaigns.svg"
            title={hasActiveFilters ? tc("noCampaignsMatch") : tc("noCampaignsYet")}
            description={
              hasActiveFilters
                ? tc("adjustFilters")
                : tc("createFirstCampaign")
            }
            action={
              hasActiveFilters
                ? {
                    label: tc("clearAllFilters"),
                    onClick: clearFilters,
                  }
                : {
                    label: t("new"),
                    onClick: () => setModalOpen(true),
                  }
            }
          />
        ) : viewMode === "list" ? (
          /* ============ List View ============ */
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] overflow-hidden"
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 z-20">
                  <tr className="border-b border-[var(--border-dim)] bg-[var(--surface-raised)]">
                    <TableHead className="w-[44px] px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        className={cn(
                          "h-[18px] w-[18px] rounded-sm border border-[var(--border-medium)] appearance-none cursor-pointer",
                          "checked:bg-[var(--accent-mint)] checked:border-[var(--accent-mint)]",
                          "indeterminate:bg-[var(--accent-mint)] indeterminate:border-[var(--accent-mint)]",
                          "transition-colors duration-150"
                        )}
                        style={
                          allSelected
                            ? {
                                backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%2001%200%201.414l-5%205a1%201%20%200%2001-1.414%200l-2-2a1%201%20%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%20%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E")`,
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "center",
                              }
                            : selectedIds.size > 0
                              ? {
                                  backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M3%208h10v1H3z%22%2F%3E%3C%2Fsvg%3E")`,
                                  backgroundRepeat: "no-repeat",
                                  backgroundPosition: "center",
                                  backgroundColor: "var(--accent-mint)",
                                }
                              : {}
                        }
                      />
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] px-4 py-3">
                      {tc("campaign")}
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] px-4 py-3 w-[140px]">
                      {tc("platforms")}
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] px-4 py-3 w-[120px]">
                      {tc("status")}
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] px-4 py-3 w-[100px]">
                      {tc("variations")}
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] px-4 py-3 w-[100px] hidden md:table-cell">
                      {tc("credits")}
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] px-4 py-3 w-[140px]">
                      {tc("modified")}
                    </TableHead>
                    <TableHead className="w-[56px] px-4 py-3" />
                  </tr>
                </TableHeader>
                <TableBody>
                  {paginatedCampaigns.map((campaign, index) => (
                    <CampaignTableRow
                      key={campaign.id}
                      campaign={campaign}
                      index={index}
                      selected={selectedIds.has(campaign.id)}
                      onSelect={(checked) => toggleSelect(campaign.id, checked)}
                      onDuplicate={handleDuplicate}
                      onArchive={handleArchive}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </motion.div>
        ) : (
          /* ============ Grid View ============ */
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
          >
            {paginatedCampaigns.map((campaign, index) => (
              <CampaignCard key={campaign.id} campaign={campaign} index={index} />
            ))}
          </motion.div>
        )}
      </div>

      {/* ============ Pagination ============ */}
      {!isLoading && !isError && filteredCampaigns.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6"
        >
          <p className="text-sm text-[var(--text-muted)]">
            {tc("showingResults", { start: startIndex, end: endIndex, total: filteredCampaigns.length })}
          </p>

          <div className="flex items-center gap-2">
            {/* Prev */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 px-2 border-[var(--border-dim)] text-[var(--text-secondary)] disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </Button>

            {/* Page Numbers */}
            {pageNumbers.map((page, i) =>
              page === "ellipsis" ? (
                <span key={`ellipsis-${i}`} className="text-[var(--text-muted)] px-1">
                  ...
                </span>
              ) : (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className={cn(
                    "h-8 w-8 p-0 text-xs font-medium",
                    currentPage === page
                      ? "bg-[var(--accent-mint)] text-white hover:bg-[var(--accent-mint-light)] border-transparent"
                      : "border-[var(--border-dim)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
                  )}
                >
                  {page}
                </Button>
              )
            )}

            {/* Next */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 px-2 border-[var(--border-dim)] text-[var(--text-secondary)] disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </Button>

            {/* Items per page */}
            <Select
              value={String(itemsPerPage)}
              onValueChange={(v) => updateItemsPerPage(Number(v))}
            >
              <SelectTrigger className="h-8 w-[70px] ml-2 bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[var(--surface-raised)] border-[var(--border-dim)]">
                <SelectItem value="10" className="text-[var(--text-primary)] text-xs">10</SelectItem>
                <SelectItem value="25" className="text-[var(--text-primary)] text-xs">25</SelectItem>
                <SelectItem value="50" className="text-[var(--text-primary)] text-xs">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </motion.div>
      )}

      {/* ============ New Campaign Modal ============ */}
      <NewCampaignModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={handleCreateCampaign}
      />

      {/* ============ Delete Confirmation Dialog ============ */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="bg-[var(--surface-raised)] border-[var(--border-dim)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-semibold text-[var(--text-primary)]">
              {tc("delete")}
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--text-secondary)]">
              {tc("deleteCampaignConfirm", { name: campaigns.find((c) => c.id === deleteTarget)?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="border-[var(--border-dim)] text-[var(--text-secondary)]"
            >
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-[var(--accent-rose)] text-white hover:opacity-90"
            >
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
