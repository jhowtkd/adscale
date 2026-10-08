import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CampaignsListPage from "./page";

// Spec 2026-10-07 §3: Criações lists the rail's active brand; outside the rail the list is the whole workspace.
const useCanonicalWorks = vi.hoisted(() => vi.fn());
const useActiveBrand = vi.hoisted(() => vi.fn());

vi.mock("@/lib/hooks/use-canonical-works", () => ({ useCanonicalWorks }));
vi.mock("@/lib/brands/active-brand-context", () => ({ useActiveBrand }));
vi.mock("@/lib/hooks/use-campaigns", () => ({ useCampaigns: () => ({ campaigns: [], isLoading: false }) }));
vi.mock("@/lib/equipe/use-equipe", () => ({ useEquipeEnabled: () => false }));
vi.mock("@/components/equipe/EquipeEmptyScreen", () => ({ default: () => null }));
vi.mock("@/components/campaigns/useCampaignsPage", () => {
  const translate = Object.assign((key: string) => key, { has: () => false });
  return {
    useCampaignsPage: () => ({
      campaigns: [], totalCount: 0, isLoading: false, isError: false, error: null, viewMode: "list", setViewMode: vi.fn(),
      statusFilter: "all", platformFilter: "all", sortOption: "newest", selectedIds: new Set(), setSelectedIds: vi.fn(),
      setCurrentPage: vi.fn(), itemsPerPage: 10, searchInput: "", handleSearchChange: vi.fn(), deleteTarget: null,
      setDeleteTarget: vi.fn(), updateStatusFilter: vi.fn(), updatePlatformFilter: vi.fn(), updateSortOption: vi.fn(),
      updateItemsPerPage: vi.fn(), clearFilters: vi.fn(), totalPages: 1, visibleCurrentPage: 1, hasActiveFilters: false,
      toggleSelect: vi.fn(), handleDuplicate: vi.fn(), handleArchive: vi.fn(), handleDelete: vi.fn(),
      handleBulkArchive: vi.fn(), handleBulkDelete: vi.fn(), bulkActionPending: false, startIndex: 0, endIndex: 0,
      pageNumbers: [], t: translate, tc: translate, te: translate,
    }),
  };
});
vi.mock("@/components/campaigns/v6/build-campaigns-v6-labels", () => ({ buildCampaignsV6Labels: () => ({}) }));
vi.mock("@/components/campaigns/v6/CampaignsV6View", () => ({ default: () => null }));
vi.mock("@/components/campaigns/CampaignsBulkActionsBar", () => ({ default: () => null }));
vi.mock("@/components/campaigns/CampaignsPagination", () => ({ default: () => null }));
vi.mock("@/components/ui/ConfirmDialog", () => ({ default: () => null }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}));

describe("Criações page: which works it lists", () => {
  beforeEach(() => {
    useCanonicalWorks.mockReset();
    useCanonicalWorks.mockReturnValue({
      data: [], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(),
    });
    useActiveBrand.mockReset();
  });

  it("asks for the active brand's works in the rail", () => {
    useActiveBrand.mockReturnValue({ id: "brand-1", name: "Marca 1" });
    render(<CampaignsListPage />);
    expect(useCanonicalWorks).toHaveBeenCalledWith({ clientProfileId: "brand-1" });
    expect(useCanonicalWorks).not.toHaveBeenCalledWith({ clientProfileId: null });
  });

  it("keeps the whole workspace outside the rail (no provider)", () => {
    useActiveBrand.mockReturnValue(undefined);
    render(<CampaignsListPage />);
    expect(useCanonicalWorks).toHaveBeenCalledWith({ clientProfileId: null });
  });

  it("keeps the whole workspace in the rail while the workspace has no brand yet", () => {
    useActiveBrand.mockReturnValue(null);
    render(<CampaignsListPage />);
    expect(useCanonicalWorks).toHaveBeenCalledWith({ clientProfileId: null });
  });
});
