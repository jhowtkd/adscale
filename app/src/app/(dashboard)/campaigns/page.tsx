"use client";

import EmptyState from "@/components/ui/EmptyState";
import { AlertCircle, ImageOff, Search } from "lucide-react";

import dynamic from "next/dynamic";

import CampaignsHeader from "@/components/campaigns/CampaignsHeader";
import CampaignsBulkActionsBar from "@/components/campaigns/CampaignsBulkActionsBar";
import CampaignsFilterToolbar from "@/components/campaigns/CampaignsFilterToolbar";
import CampaignsListView from "@/components/campaigns/CampaignsListView";
import CampaignsGridView from "@/components/campaigns/CampaignsGridView";
import CampaignsPagination from "@/components/campaigns/CampaignsPagination";
import DeleteCampaignDialog from "@/components/campaigns/DeleteCampaignDialog";
import TableSkeleton from "@/components/campaigns/TableSkeleton";
import GridSkeleton from "@/components/campaigns/GridSkeleton";

import { useCampaignsPage } from "@/components/campaigns/useCampaignsPage";

const NewCampaignModal = dynamic(() => import("@/components/campaigns/NewCampaignModal"), {
  ssr: false,
  loading: () => null,
});

const SaveTemplateModal = dynamic(() => import("@/components/templates/SaveTemplateModal"), {
  ssr: false,
  loading: () => null,
});

export default function CampaignsListPage() {
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
  } = useCampaignsPage();

  return (
    <div className="max-w-7xl mx-auto">
      <CampaignsHeader count={totalCount} onNewCampaign={() => setModalOpen(true)} />

      <div className="mt-5 animate-fade-in" style={{ animationDelay: "80ms" }}>
        <CampaignsBulkActionsBar
          selectedCount={selectedIds.size}
          onArchive={handleBulkArchive}
          onDelete={handleBulkDelete}
          onCancel={() => setSelectedIds(new Set())}
        />

        <CampaignsFilterToolbar
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
      </div>

      <div className="mt-5">
        {isLoading ? (
          viewMode === "list" ? <TableSkeleton /> : <GridSkeleton />
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
        ) : viewMode === "list" ? (
          <CampaignsListView
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
        ) : (
          <CampaignsGridView campaigns={campaigns} />
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

      <DeleteCampaignDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        campaignName={campaigns.find((c) => c.id === deleteTarget)?.name ?? ""}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />
    </div>
  );
}
