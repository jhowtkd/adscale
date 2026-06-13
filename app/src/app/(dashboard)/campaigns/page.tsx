"use client";

import { Suspense } from "react";
import EmptyState from "@/components/ui/EmptyState";
import { AlertCircle, ImageOff, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";

import dynamic from "next/dynamic";

import CampaignsHeader from "@/components/campaigns/CampaignsHeader";
import CampaignsBulkActionsBar from "@/components/campaigns/CampaignsBulkActionsBar";
import CampaignsFilterToolbar from "@/components/campaigns/CampaignsFilterToolbar";
const CampaignsListView = dynamic(() => import("@/components/campaigns/CampaignsListView"), {
  loading: () => <TableSkeleton />,
});

const CampaignsGridView = dynamic(() => import("@/components/campaigns/CampaignsGridView"), {
  loading: () => <GridSkeleton />,
});

const KanbanBoard = dynamic(() => import("@/components/campaigns/KanbanBoard"), {
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full size-8 border-b-2 border-primary" />
    </div>
  ),
});
import CampaignsPagination from "@/components/campaigns/CampaignsPagination";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import TableSkeleton from "@/components/campaigns/TableSkeleton";
import GridSkeleton from "@/components/campaigns/GridSkeleton";

import { useCampaignsPage } from "@/components/campaigns/useCampaignsPage";
import PageFrame from "@/components/layout/PageFrame";
import Panel from "@/components/layout/Panel";

const NewCampaignModal = dynamic(() => import("@/components/campaigns/NewCampaignModal"), {
  ssr: false,
  loading: () => null,
});

const SaveTemplateModal = dynamic(() => import("@/components/templates/SaveTemplateModal"), {
  ssr: false,
  loading: () => null,
});

export default function CampaignsListPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
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
  } = useCampaignsPage(searchParams);

  return (
    <PageFrame width="operational" className="space-y-6">
      <h1 className="sr-only">{tc("pageTitle") ?? "Campaigns"}</h1>
      <CampaignsHeader
        count={totalCount}
        isLoading={isLoading}
        onNewCampaign={() => setModalOpen(true)}
      />

      <div className="mt-5 animate-fade-in" style={{ animationDelay: "80ms" }}>
        <CampaignsBulkActionsBar
          selectedCount={selectedIds.size}
          onArchive={handleBulkArchive}
          onDelete={handleBulkDelete}
          onCancel={() => setSelectedIds(new Set())}
        />

        {isLoading ? (
          <Panel>
            <div className="border-b border-[var(--border-dim)] p-3">
              <div className="h-8 w-full max-w-[280px] animate-pulse rounded bg-[var(--surface-raised)]" />
            </div>
            {viewMode === "list" ? <TableSkeleton /> : <div className="p-5"><GridSkeleton /></div>}
          </Panel>
        ) : isError ? (
          <EmptyState
            icon={AlertCircle}
            title={tc("errorLoading")}
            description={error?.message || te("generic")}
            action={{
              label: tc("retry"),
              onClick: () => window.location.reload(),
            }}
          />
        ) : campaigns.length === 0 ? (
          <Panel>
            <CampaignsFilterToolbar
              className="border-b border-[var(--border-dim)] p-3"
              searchQuery={searchQuery}
              onSearchChange={updateSearchQuery}
              statusFilter={statusFilter}
              onStatusChange={updateStatusFilter}
              platformFilter={platformFilter}
              onPlatformChange={updatePlatformFilter}
              sortOption={sortOption}
              onSortChange={updateSortOption}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              activeFilters={activeFilters}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
            />
            <div className="p-6">
              <EmptyState
                icon={hasActiveFilters ? Search : ImageOff}
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
            </div>
          </Panel>
        ) : (
          <Panel>
            <CampaignsFilterToolbar
              className="border-b border-[var(--border-dim)] p-3"
              searchQuery={searchQuery}
              onSearchChange={updateSearchQuery}
              statusFilter={statusFilter}
              onStatusChange={updateStatusFilter}
              platformFilter={platformFilter}
              onPlatformChange={updatePlatformFilter}
              sortOption={sortOption}
              onSortChange={updateSortOption}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              activeFilters={activeFilters}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
            />
            {viewMode === "list" ? (
              <CampaignsListView
                embedded
                campaigns={campaigns}
                selectedIds={selectedIds}
                allSelected={allSelected}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
                onDuplicate={handleDuplicate}
                onArchive={handleArchive}
                onDelete={setDeleteTarget}
                onSaveAsTemplate={setSaveTemplateCampaign}
              />
            ) : viewMode === "grid" ? (
              <div className="p-5">
                <CampaignsGridView campaigns={campaigns} />
              </div>
            ) : (
              <div className="p-5">
                <KanbanBoard campaigns={campaigns} />
              </div>
            )}
          </Panel>
        )}
      </div>

      {!isLoading && !isError && totalCount > 0 && (
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

      <NewCampaignModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={handleCreateCampaign}
      />

      <SaveTemplateModal
        open={!!saveTemplateCampaign}
        onOpenChange={(open) => !open && setSaveTemplateCampaign(null)}
        campaignId={saveTemplateCampaign?.id ?? ""}
        campaignName={saveTemplateCampaign?.name ?? ""}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir campanha"
        description={`Tem certeza que deseja excluir "${campaigns.find((c) => c.id === deleteTarget)?.name ?? ""}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) void handleDelete(deleteTarget);
        }}
      />
    </PageFrame>
  );
}
