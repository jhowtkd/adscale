"use client";

import { Suspense, useMemo } from "react";
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
import { mapCampaignToV6Row } from "@/components/campaigns/v6/map-campaigns-v6";
import {
  getPlatformFilterLabel,
  getSortFilterLabel,
  getStatusFilterLabel,
} from "@/components/campaigns/filter-labels";
import type { PlatformFilter, SortOption, StatusFilter } from "@/components/campaigns/types";

const CampaignsGridView = dynamic(() => import("@/components/campaigns/CampaignsGridView"), {
  loading: () => <div className="h-48 animate-pulse rounded bg-[var(--surface-raised)]" />,
});

const KanbanBoard = dynamic(() => import("@/components/campaigns/KanbanBoard"), {
  loading: () => <div className="flex h-64 items-center justify-center"><div className="size-8 animate-spin rounded-full border-b-2 border-primary" /></div>,
});

const NewCampaignModal = dynamic(() => import("@/components/campaigns/NewCampaignModal"), {
  ssr: false,
  loading: () => null,
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
  const searchParams = useSearchParams();
  const {
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
    platformFilter,
    sortOption,
    selectedIds,
    setSelectedIds,
    setCurrentPage,
    itemsPerPage,
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
    hasActiveFilters,
    toggleSelect,
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
  } = useCampaignsPage(searchParams);

  const labels = useMemo(() => buildCampaignsV6Labels(t, tc), [t, tc]);

  const rows = useMemo(
    () =>
      campaigns.map((campaign) =>
        mapCampaignToV6Row({
          campaign,
          tStatus: (key) => t(`status.${key}`),
          formatUpdated,
        }),
      ),
    [campaigns, t],
  );

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

  const emptyState =
    !isLoading && !isError && campaigns.length === 0 ? (
      <EmptyState
        icon={hasActiveFilters ? Search : ImageOff}
        title={hasActiveFilters ? tc("noCampaignsMatch") : tc("noCampaignsYet")}
        description={hasActiveFilters ? tc("adjustFilters") : tc("createFirstCampaign")}
        action={
          hasActiveFilters
            ? { label: tc("clearAllFilters"), onClick: clearFilters }
            : { label: t("new"), onClick: () => setModalOpen(true) }
        }
      />
    ) : undefined;

  const alternateView =
    viewMode === "grid" ? (
      <CampaignsGridView campaigns={campaigns} />
    ) : viewMode === "board" ? (
      <KanbanBoard campaigns={campaigns} />
    ) : null;

  if (isError) {
    return (
      <div className="py-8">
        <EmptyState
          icon={AlertCircle}
          title={tc("errorLoading")}
          description={error?.message || te("generic")}
          action={{ label: tc("retry"), onClick: () => window.location.reload() }}
        />
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 pb-10">
      <h1 className="sr-only">{tc("pageTitle")}</h1>

      <CampaignsBulkActionsBar
        selectedCount={selectedIds.size}
        onArchive={handleBulkArchive}
        onDelete={handleBulkDelete}
        onCancel={() => setSelectedIds(new Set())}
      />

      <CampaignsV6View
        labels={labels}
        rows={rows}
        totalCount={totalCount}
        isLoading={isLoading}
        searchQuery={searchQuery}
        onSearchChange={updateSearchQuery}
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
        onViewModeChange={setViewMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onNewCampaign={() => setModalOpen(true)}
        onDuplicate={handleDuplicate}
        onArchive={handleArchive}
        onDelete={setDeleteTarget}
        onSaveAsTemplate={setSaveTemplateCampaign}
        alternateView={alternateView}
        emptyState={emptyState}
      />

      {!isLoading && totalCount > 0 && (
        <CampaignsPagination
          startIndex={startIndex}
          endIndex={endIndex}
          totalCount={totalCount}
          pageNumbers={pageNumbers}
          visibleCurrentPage={visibleCurrentPage}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={updateItemsPerPage}
        />
      )}

      <NewCampaignModal open={modalOpen} onOpenChange={setModalOpen} onSubmit={handleCreateCampaign} />

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
    sectionLabel: "Campanhas",
    versionBadge: "v1",
    title: "{count} campanhas",
    subtitle: "",
    sortPrefix: "Ordenar",
    newCampaign: "Nova campanha",
    searchPlaceholder: "",
    searchAriaLabel: "",
    filtersAria: "",
    statusChipPrefix: "Status",
    platformChipPrefix: "Plataforma",
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
      viewMode="list"
    />
  );
}
