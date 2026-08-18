"use client";

import { Suspense, useMemo, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import { AlertCircle, ImageOff, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { formatDistanceToNow } from "date-fns";

import CampaignsBulkActionsBar from "@/components/campaigns/CampaignsBulkActionsBar";
import CampaignsPagination from "@/components/campaigns/CampaignsPagination";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useCampaignsPage } from "@/components/campaigns/useCampaignsPage";
import CampaignsV6View from "@/components/campaigns/v6/CampaignsV6View";
import { buildCampaignsV6Labels } from "@/components/campaigns/v6/build-campaigns-v6-labels";
import { mapCanonicalWorkToV6Row } from "@/components/campaigns/v6/map-canonical-work-to-v6-row";
import type { WorkOriginFilter } from "@/components/campaigns/v6/campaigns-v6-types";
import { useCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { useCampaigns } from "@/lib/hooks/use-campaigns";
import {
  getPlatformFilterLabel,
  getSortFilterLabel,
  getStatusFilterLabel,
} from "@/components/campaigns/filter-labels";
import type { PlatformFilter, SortOption, StatusFilter } from "@/components/campaigns/types";

const KanbanBoard = dynamic(() => import("@/components/campaigns/KanbanBoard"), {
  loading: () => <div className="flex h-64 items-center justify-center"><div className="size-8 animate-spin rounded-full border-2 border-[var(--border-subtle)] border-b-[var(--utility-icon)]" /></div>,
});

const SaveTemplateModal = dynamic(() => import("@/components/templates/SaveTemplateModal"), {
  ssr: false,
  loading: () => null,
});

function formatUpdated(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: false })
    .replace("about ", "")
    .replace("less than a minute", "agora")
    .replace(/ minutes?/, " min")
    .replace(/ hours?/, "h")
    .replace(/ days?/, " dias")
    .replace(/ weeks?/, " sem")
    .replace(/ months?/, " mês");
}

const STATUS_OPTIONS: StatusFilter[] = ["all", "draft", "active", "generating", "completed", "failed"];
const PLATFORM_OPTIONS: PlatformFilter[] = ["all", "Meta", "TikTok", "Google"];
const SORT_OPTIONS: SortOption[] = ["newest", "oldest", "name-asc", "name-desc", "variations"];

export default function CampaignsListPage() {
  return (
    <Suspense fallback={<CampaignsV6ViewSkeleton />}>
      <CampaignsListContent />
    </Suspense>
  );
}

function CampaignsListContent() {
  return <CampaignsProductContent />;
}

function CampaignsProductContent() {
  const searchParams = useSearchParams();
  const [originFilter, setOriginFilter] = useState<WorkOriginFilter>("all");
  const {
    data: canonicalWorks = [],
    isLoading: worksLoading,
    isError: worksError,
    error: worksErrorObj,
    refetch: refetchWorks,
  } = useCanonicalWorks();
  // Metadata enrich is optional; the canonical query itself is the source of list membership.
  const { campaigns: campaignsMeta, isLoading: metaLoading } = useCampaigns({
    page: 1,
  });
  const {
    campaigns,
    totalCount: campaignsTotalCount,
    isLoading: campaignsLoading,
    isError: campaignsError,
    error,
    viewMode,
    setViewMode,
    statusFilter,
    platformFilter,
    sortOption,
    selectedIds,
    setSelectedIds,
    setCurrentPage,
    itemsPerPage,
    searchInput,
    handleSearchChange,
    deleteTarget,
    setDeleteTarget,
    saveTemplateCampaign,
    setSaveTemplateCampaign,
    updateStatusFilter,
    updatePlatformFilter,
    updateSortOption,
    updateItemsPerPage,
    clearFilters,
    totalPages,
    visibleCurrentPage,
    hasActiveFilters,
    toggleSelect,
    startNewWork,
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
  } = useCampaignsPage(searchParams);

  const labels = useMemo(() => buildCampaignsV6Labels(t, tc), [t, tc]);
  const isCanonicalMode = viewMode !== "board";
  // Title/count only need canonical works; meta enrich is optional and must not
  // leave the h1 in a permanent skeleton (UAT S05).
  const isLoading = isCanonicalMode ? worksLoading : campaignsLoading;
  void metaLoading; // metrics enrich only; do not block title/list chrome
  // List can render with stubs if the campaigns page query fails; only canonical fails hard.
  const isError = isCanonicalMode ? worksError : campaignsError;

  const campaignById = useMemo(() => {
    const map = new Map(campaignsMeta.map((c) => [c.id, c]));
    // Paginated page may hold fresher metrics for the current grid page.
    for (const c of campaigns) map.set(c.id, c);
    return map;
  }, [campaignsMeta, campaigns]);

  const filteredWorks = useMemo(() => {
    let list = canonicalWorks;
    if (originFilter !== "all") {
      list = list.filter((w) => w.originKind === originFilter);
    }
    const q = searchInput.trim().toLowerCase();
    if (q) {
      list = list.filter((w) => w.name.toLowerCase().includes(q));
    }
    return list;
  }, [canonicalWorks, originFilter, searchInput]);

  const rows = useMemo(
    () =>
      filteredWorks.map((work) =>
        mapCanonicalWorkToV6Row({
          work,
          campaign:
            work.originKind === "campaign"
              ? campaignById.get(work.originId)
              : undefined,
          originLabel:
            work.originKind === "campaign"
              ? labels.originCampaigns
              : labels.originPosts,
          formatUpdated,
          tState: (state) => {
            const key = `v6.workStates.${state}` as Parameters<typeof t>[0];
            return t.has(key) ? t(key) : state;
          },
          formatProtocol: labels.formatProtocol,
          formatNextAction: labels.formatNextAction,
        })
      ),
    [filteredWorks, campaignById, labels.formatNextAction, labels.formatProtocol, labels.originCampaigns, labels.originPosts, t]
  );

  const displayCount = isCanonicalMode ? filteredWorks.length : campaignsTotalCount;

  const statusFilterLabel = getStatusFilterLabel(statusFilter, t, tc);
  const platformFilterLabel = getPlatformFilterLabel(platformFilter, t, tc);
  const sortLabel = getSortFilterLabel(sortOption, tc);

  const statusOptions = STATUS_OPTIONS.map((value) => ({
    value,
    label: getStatusFilterLabel(value, t, tc),
  }));
  const platformOptions = PLATFORM_OPTIONS.map((value) => ({
    value,
    label: getPlatformFilterLabel(value, t, tc),
  }));
  const sortOptions = SORT_OPTIONS.map((value) => ({
    value,
    label: getSortFilterLabel(value, tc),
  }));

  const canonicalEmpty =
    isCanonicalMode &&
    !isLoading &&
    !isError &&
    rows.length === 0;
  const boardEmpty =
    !isCanonicalMode &&
    !isLoading &&
    !isError &&
    campaigns.length === 0;

  const emptyState =
    canonicalEmpty || boardEmpty ? (
      <EmptyState
        icon={
          hasActiveFilters ||
          (isCanonicalMode && (originFilter !== "all" || searchInput))
            ? Search
            : ImageOff
        }
        title={
          hasActiveFilters ||
          (isCanonicalMode && (originFilter !== "all" || searchInput))
            ? tc("noCampaignsMatch")
            : tc("noCampaignsYet")
        }
        description={
          hasActiveFilters ||
          (isCanonicalMode && (originFilter !== "all" || searchInput))
            ? tc("adjustFilters")
            : tc("createFirstCampaign")
        }
        action={
          hasActiveFilters ||
          (isCanonicalMode && (originFilter !== "all" || searchInput))
            ? {
                label: tc("clearAllFilters"),
                onClick: () => {
                  clearFilters();
                  setOriginFilter("all");
                },
              }
            : { label: t("new"), onClick: startNewWork }
        }
      />
    ) : undefined;

  const alternateView =
    viewMode === "board" ? (
      <KanbanBoard campaigns={campaigns} />
    ) : null;

  if (isError) {
    return (
      <div className="py-8">
        <EmptyState
          icon={AlertCircle}
          title={tc("errorLoading")}
          description={
            worksErrorObj instanceof Error
              ? worksErrorObj.message
              : error?.message || te("generic")
          }
          action={{
            label: tc("retry"),
            onClick: () => {
              void refetchWorks();
              window.location.reload();
            },
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 pb-10">
      {/* Visible product-page-title h1 lives in CampaignsV6View */}

      <CampaignsBulkActionsBar
        selectedCount={selectedIds.size}
        onArchive={handleBulkArchive}
        onDelete={handleBulkDelete}
        onCancel={() => setSelectedIds(new Set())}
      />

      <CampaignsV6View
        labels={labels}
        rows={rows}
        totalCount={displayCount}
        isLoading={isLoading}
        searchQuery={searchInput}
        onSearchChange={handleSearchChange}
        originFilter={isCanonicalMode ? originFilter : "campaign"}
        onOriginChange={
          isCanonicalMode
            ? (value) => {
                setOriginFilter(value);
              }
            : undefined
        }
        showCampaignFilters={!isCanonicalMode}
        statusFilter={statusFilter}
        statusFilterLabel={statusFilterLabel}
        onStatusChange={updateStatusFilter}
        statusOptions={statusOptions}
        platformFilter={platformFilter}
        platformFilterLabel={platformFilterLabel}
        onPlatformChange={updatePlatformFilter}
        platformOptions={platformOptions}
        sortOption={sortOption}
        sortLabel={sortLabel}
        onSortChange={updateSortOption}
        sortOptions={sortOptions}
        viewMode={viewMode}
        onViewModeChange={(mode) => {
          setViewMode(mode);
          if (mode === "board" && originFilter === "creative_work") {
            setOriginFilter("all");
          }
        }}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onNewCampaign={startNewWork}
        onDuplicate={handleDuplicate}
        onArchive={handleArchive}
        onDelete={setDeleteTarget}
        onSaveAsTemplate={(campaign) => {
          if (campaign) setSaveTemplateCampaign(campaign as never);
        }}
        alternateView={alternateView}
        emptyState={emptyState}
      />

      {viewMode === "board" && !isLoading && campaignsTotalCount > 0 ? (
        <CampaignsPagination
          startIndex={startIndex}
          endIndex={endIndex}
          totalCount={campaignsTotalCount}
          pageNumbers={pageNumbers}
          visibleCurrentPage={visibleCurrentPage}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={updateItemsPerPage}
        />
      ) : null}

      <SaveTemplateModal
        open={!!saveTemplateCampaign}
        onOpenChange={(open) => !open && setSaveTemplateCampaign(null)}
        campaignId={saveTemplateCampaign?.id ?? ""}
        campaignName={saveTemplateCampaign?.name ?? ""}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("deleteTitle")}
        description={tc("deleteCampaignConfirm", {
          name: campaigns.find((c) => c.id === deleteTarget)?.name ?? "",
        })}
        confirmLabel={tc("delete")}
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) void handleDelete(deleteTarget);
        }}
      />
    </div>
  );
}

function CampaignsV6ViewSkeleton() {
  const labels = {
    sectionLabel: "Trabalhos",
    versionBadge: "v1",
    formatTitle: () => "",
    subtitle: "",
    sortPrefix: "Ordenar",
    newCampaign: "Novo trabalho",
    searchPlaceholder: "",
    searchAriaLabel: "",
    filtersAria: "",
    statusChipPrefix: "Status",
    platformChipPrefix: "Plataforma",
    originAll: "Todos",
    originCampaigns: "Campanhas",
    originPosts: "Posts",
    viewList: "Lista",
    viewGrid: "Grade",
    viewBoard: "Quadro",
    selectCampaign: () => "",
    actionsFor: () => "",
    openCampaign: "",
    duplicate: "",
    saveAsTemplate: "",
    archive: "",
    delete: "",
    variationsLabel: "variações",
    approvedLabel: "aprovadas",
  };

  return (
    <CampaignsV6View
      labels={labels}
      rows={[]}
      totalCount={0}
      isLoading
      searchQuery=""
      statusFilter="all"
      statusFilterLabel="Todos"
      statusOptions={[]}
      platformFilter="all"
      platformFilterLabel="Todas"
      platformOptions={[]}
      sortOption="newest"
      sortLabel="Atualização"
      sortOptions={[]}
      viewMode="grid"
    />
  );
}
