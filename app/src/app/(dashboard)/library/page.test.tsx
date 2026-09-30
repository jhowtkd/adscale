"use client";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useWorkspaceAssetsMock = vi.fn();
const useDeleteWorkspaceAssetMock = vi.fn();
const useLibraryFavoritesMock = vi.fn();
const useSetPieceFavoriteMock = vi.fn();
const useActiveClientProfileMock = vi.fn();
const useEquipeAccountsMock = vi.fn();
const useEquipeAccountStateMock = vi.fn();
const useBrandKitMock = vi.fn();
const invalidateQueriesMock = vi.fn();
const ACTIVE_PROFILE_ID = "profile-1";
const ACTIVE_ACCOUNT_ID = "account-1";
let capturedViewProps: {
  activeFilter: string;
  logoImageUrl?: string;
  shownCount: number;
  assets: Array<{ id: string; name: string }>;
  emptyState?: React.ReactNode;
  onFilterChange: (value: "all" | "favorite") => void;
  onSearchChange: (value: string) => void;
  renderAssetActions?: (asset: { id: string; name: string }) => React.ReactNode;
} | null = null;

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const fn = ((key: string) => `${namespace}:${key}`) as unknown as Record<string, unknown>;
    (fn as { raw: (key: string) => string }).raw = (key: string) => `${namespace}:${key}`;
    return fn;
  },
}));

vi.mock("@/lib/hooks/use-workspace-assets", () => ({
  useWorkspaceAssets: (...args: unknown[]) => useWorkspaceAssetsMock(...args),
  useDeleteWorkspaceAsset: (...args: unknown[]) => useDeleteWorkspaceAssetMock(...args),
}));

vi.mock("@/lib/hooks/use-piece-favorite", () => ({
  useLibraryFavorites: (...args: unknown[]) => useLibraryFavoritesMock(...args),
  useSetPieceFavorite: (...args: unknown[]) => useSetPieceFavoriteMock(...args),
}));

vi.mock("@/lib/hooks/use-active-client-profile", () => ({
  useActiveClientProfile: (...args: unknown[]) => useActiveClientProfileMock(...args),
}));

vi.mock("@/lib/equipe/use-equipe", () => ({
  useEquipeAccounts: (...args: unknown[]) => useEquipeAccountsMock(...args),
  useEquipeAccountState: (...args: unknown[]) => useEquipeAccountStateMock(...args),
}));

vi.mock("@/lib/hooks/use-brand-kit", () => ({
  useBrandKit: (...args: unknown[]) => useBrandKitMock(...args),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/components/library/v6/LibraryV6View", () => ({
  default: (props: {
    activeFilter: string;
    assets: Array<{ id: string; name: string }>;
    emptyState?: React.ReactNode;
    onFilterChange: (value: string) => void;
    onSearchChange: (value: string) => void;
    renderAssetActions?: (asset: { id: string; name: string }) => React.ReactNode;
  }) => {
    capturedViewProps = props as typeof capturedViewProps & object;
    return (
      <div data-testid="library-view">
        <span data-testid="active-filter">{props.activeFilter}</span>
        <span data-testid="asset-count">{props.assets.length}</span>
        {props.emptyState ?? null}
        {props.assets.map((asset) => (
          <div key={asset.id} data-testid={`asset-${asset.id}`}>
            {asset.name}
            {props.renderAssetActions?.(asset)}
          </div>
        ))}
      </div>
    );
  },
}));

import LibraryPage from "./page";

const favoriteItems = [
  {
    id: "fav-1",
    outputId: "output-1",
    workItemId: "work-1",
    name: "Peça matrículas",
    createdAt: "2026-09-10T12:00:00.000Z",
    downloadHref: "/api/creative-work/work-1/outputs/output-1/download",
  },
  {
    id: "fav-2",
    outputId: "output-2",
    workItemId: "work-2",
    name: "Peça rematrícula",
    createdAt: "2026-09-11T12:00:00.000Z",
    downloadHref: "/api/creative-work/work-2/outputs/output-2/download",
  },
];

describe("LibraryPage favorites filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedViewProps = null;
    useWorkspaceAssetsMock.mockReturnValue({
      data: { assets: [], total: 0 },
      isLoading: false,
      isFetching: false,
      isError: false,
    });
    useDeleteWorkspaceAssetMock.mockReturnValue({ mutateAsync: vi.fn() });
    useLibraryFavoritesMock.mockReturnValue({
      data: favoriteItems,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSetPieceFavoriteMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useActiveClientProfileMock.mockReturnValue({
      profiles: [{ id: ACTIVE_PROFILE_ID, name: "Acme" }],
      activeProfile: { id: ACTIVE_PROFILE_ID, name: "Acme" },
      activeClientProfileId: ACTIVE_PROFILE_ID,
      requiresSelection: false,
      isLoading: false,
      isError: false,
      selectProfile: vi.fn(),
    });
    useEquipeAccountsMock.mockReturnValue({
      data: { accounts: [{ id: ACTIVE_ACCOUNT_ID, clientProfileId: ACTIVE_PROFILE_ID }] },
      isLoading: false,
    });
    useEquipeAccountStateMock.mockReturnValue({
      data: { documents: [], handoff: undefined },
      isLoading: false,
    });
    useBrandKitMock.mockReturnValue({ data: undefined, isLoading: false });
  });

  it("loads favorites only under the favorites filter with download and unfavorite actions", () => {
    const setFavorite = { mutate: vi.fn(), isPending: false };
    useSetPieceFavoriteMock.mockReturnValue(setFavorite);
    render(<LibraryPage />);

    expect(useLibraryFavoritesMock).toHaveBeenCalledWith(false, ACTIVE_PROFILE_ID);
    expect(screen.getByTestId("active-filter")).toHaveTextContent("all");

    act(() => capturedViewProps!.onFilterChange("favorite"));

    expect(useLibraryFavoritesMock).toHaveBeenLastCalledWith(true, ACTIVE_PROFILE_ID);
    expect(screen.getByTestId("asset-output-1")).toHaveTextContent("Peça matrículas");
    expect(screen.getByTestId("asset-output-2")).toHaveTextContent("Peça rematrícula");
    const downloads = screen.getAllByRole("link", { name: "dashboard.home.composer.results:download" });
    expect(downloads).toHaveLength(2);
    expect(downloads[0]).toHaveAttribute("href", "/api/creative-work/work-1/outputs/output-1/download");
    expect(downloads[1]).toHaveAttribute("href", "/api/creative-work/work-2/outputs/output-2/download");

    fireEvent.click(screen.getAllByRole("button", { name: "dashboard.home.composer.results:unfavorite" })[0]!);
    expect(setFavorite.mutate).toHaveBeenCalledWith({ workId: "work-1", outputId: "output-1", next: false });
  });

  it("searches favorites by piece name", async () => {
    render(<LibraryPage />);
    act(() => capturedViewProps!.onFilterChange("favorite"));
    expect(screen.getByTestId("asset-count")).toHaveTextContent("2");

    act(() => capturedViewProps!.onSearchChange("rematrícula"));

    await waitFor(() => expect(screen.getByTestId("asset-count")).toHaveTextContent("1"));
    expect(screen.getByTestId("asset-output-2")).toHaveTextContent("Peça rematrícula");
    expect(screen.queryByTestId("asset-output-1")).not.toBeInTheDocument();
  });

  it("shows an empty state without favorites", () => {
    useLibraryFavoritesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<LibraryPage />);
    act(() => capturedViewProps!.onFilterChange("favorite"));

    expect(screen.getByText("library:v6.favoritesEmptyTitle")).toBeInTheDocument();
    expect(screen.getByText("library:v6.favoritesEmptyDescription")).toBeInTheDocument();
  });

  it("retries loading favorites after an error", () => {
    const refetch = vi.fn();
    useLibraryFavoritesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    render(<LibraryPage />);
    act(() => capturedViewProps!.onFilterChange("favorite"));

    fireEvent.click(screen.getByRole("button", { name: "common:retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});

describe("LibraryPage (ticket 07): scoped to the active brand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedViewProps = null;
    useWorkspaceAssetsMock.mockReturnValue({
      data: { assets: [], total: 0 },
      isLoading: false,
      isFetching: false,
      isError: false,
    });
    useDeleteWorkspaceAssetMock.mockReturnValue({ mutateAsync: vi.fn() });
    useLibraryFavoritesMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useSetPieceFavoriteMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useEquipeAccountsMock.mockReturnValue({
      data: { accounts: [{ id: ACTIVE_ACCOUNT_ID, clientProfileId: ACTIVE_PROFILE_ID }] },
      isLoading: false,
    });
    useEquipeAccountStateMock.mockReturnValue({ data: { documents: [], handoff: undefined }, isLoading: false });
    useBrandKitMock.mockReturnValue({ data: undefined, isLoading: false });
  });

  it("queries the workspace assets and documents scoped to the active brand", () => {
    useActiveClientProfileMock.mockReturnValue({
      profiles: [{ id: ACTIVE_PROFILE_ID, name: "Acme" }],
      activeProfile: { id: ACTIVE_PROFILE_ID, name: "Acme" },
      activeClientProfileId: ACTIVE_PROFILE_ID,
      requiresSelection: false, isLoading: false, isError: false, selectProfile: vi.fn(),
    });

    render(<LibraryPage />);

    expect(useWorkspaceAssetsMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientProfileId: ACTIVE_PROFILE_ID, enabled: true }),
    );
    expect(useEquipeAccountStateMock).toHaveBeenCalledWith(ACTIVE_ACCOUNT_ID);
  });

  it("never queries workspace assets for a brand before one is selected, and asks the person to pick one", () => {
    useActiveClientProfileMock.mockReturnValue({
      profiles: [{ id: ACTIVE_PROFILE_ID, name: "Acme" }, { id: "profile-2", name: "Outra marca" }],
      activeProfile: null,
      activeClientProfileId: null,
      requiresSelection: true, isLoading: false, isError: false, selectProfile: vi.fn(),
    });

    render(<LibraryPage />);

    expect(useWorkspaceAssetsMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientProfileId: undefined, enabled: false }),
    );
    // No account resolves without an active brand, so the account-state query never fires.
    expect(useEquipeAccountStateMock).toHaveBeenCalledWith(null);
    expect(screen.getByText("library:brand.selectBrand")).toBeInTheDocument();
  });

  it("keeps the profile logo visible when it is outside the first gallery page", () => {
    useActiveClientProfileMock.mockReturnValue({ activeClientProfileId: ACTIVE_PROFILE_ID,
      activeProfile: { id: ACTIVE_PROFILE_ID, name: "Acme", logoAssetKey: "brand/logo.png" }, isLoading: false });
    useWorkspaceAssetsMock.mockImplementation((options: { kind?: string }) => ({
      data: { assets: options.kind === "identity" ? [{ key: "brand/logo.png", type: "image/png", url: "/logo-file" }] : [], total: 30 },
      isLoading: false, isFetching: false, isError: false,
    }));
    render(<LibraryPage />);
    expect(useWorkspaceAssetsMock).toHaveBeenCalledWith(expect.objectContaining({ clientProfileId: ACTIVE_PROFILE_ID, kind: "identity", limit: 1 }));
    expect(capturedViewProps?.logoImageUrl).toBe("/logo-file");
  });

  it("shows no logo for a brand without logoAssetKey, even when an old logo asset is still in the Library", () => {
    // Removing the logo in Brand Kit only clears the profile key: the old file stays in the Library.
    useActiveClientProfileMock.mockReturnValue({ activeClientProfileId: ACTIVE_PROFILE_ID,
      activeProfile: { id: ACTIVE_PROFILE_ID, name: "Acme", logoAssetKey: null }, isLoading: false });
    useWorkspaceAssetsMock.mockImplementation((options: { kind?: string }) => ({
      data: { assets: options.kind === "identity" ? [{ key: "brand/old-logo.png", type: "image/png", url: "/old-logo-file" }] : [], total: 1 },
      isLoading: false, isFetching: false, isError: false,
    }));
    render(<LibraryPage />);
    expect(capturedViewProps?.logoImageUrl).toBeUndefined();
  });

  it("shows only the identity asset whose key is the brand's logoAssetKey, never another one", () => {
    useActiveClientProfileMock.mockReturnValue({ activeClientProfileId: ACTIVE_PROFILE_ID,
      activeProfile: { id: ACTIVE_PROFILE_ID, name: "Acme", logoAssetKey: "brand/current-logo.png" }, isLoading: false });
    useWorkspaceAssetsMock.mockImplementation((options: { kind?: string }) => ({
      data: { assets: options.kind === "identity" ? [
        { key: "brand/old-logo.png", type: "image/png", url: "/old-logo-file" },
        { key: "brand/current-logo.png", type: "image/png", url: "/current-logo-file" },
      ] : [], total: 2 },
      isLoading: false, isFetching: false, isError: false,
    }));
    render(<LibraryPage />);
    expect(capturedViewProps?.logoImageUrl).toBe("/current-logo-file");
  });

  it("keeps legacy image MIME values visible while font rows still count toward pagination", () => {
    useActiveClientProfileMock.mockReturnValue({ activeClientProfileId: ACTIVE_PROFILE_ID,
      activeProfile: { id: ACTIVE_PROFILE_ID, name: "Acme" }, isLoading: false });
    const base = { tags: [], size: 1, createdAt: "2026-09-01", source: "upload", url: "/file", clientProfileId: null };
    useWorkspaceAssetsMock.mockImplementation((options: { kind?: string }) => ({
      data: { assets: options.kind === "identity" ? [] : [
        { ...base, id: "legacy-image", name: "Imagem antiga", type: "image" },
        { ...base, id: "font", name: "Fonte", type: "font/woff2" },
      ], total: 30 }, isLoading: false, isFetching: false, isError: false,
    }));
    render(<LibraryPage />);
    expect(capturedViewProps?.assets.map(asset => asset.id)).toEqual(["legacy-image"]);
    expect(capturedViewProps?.shownCount).toBe(2);
  });
});

// Independent review (PR 610, R4): a logo the old brand-kit producer wrote to
// client_profiles.logoAssetKey but never materialized as a workspace_asset
// row must still render, using the profile's authoritative key directly.
it("review: displays an existing profile logo when the old logo producer has no workspace asset row", () => {
  useActiveClientProfileMock.mockReturnValue({ activeClientProfileId: ACTIVE_PROFILE_ID, activeProfile: { id: ACTIVE_PROFILE_ID, name: "Acme", logoAssetKey: "workspaces/ws-1/brand-kit/old-logo.png" }, isLoading: false });
  useWorkspaceAssetsMock.mockReturnValue({ data: { assets: [], total: 0 }, isLoading: false, isFetching: false, isError: false });
  useLibraryFavoritesMock.mockReturnValue({ data: [], isLoading: false, isError: false });
  useDeleteWorkspaceAssetMock.mockReturnValue({ mutateAsync: vi.fn() });
  useSetPieceFavoriteMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useEquipeAccountsMock.mockReturnValue({ data: { accounts: [] }, isLoading: false });
  useEquipeAccountStateMock.mockReturnValue({ data: { documents: [] }, isLoading: false });
  useBrandKitMock.mockReturnValue({
    data: { id: ACTIVE_PROFILE_ID, logoAssetKey: "workspaces/ws-1/brand-kit/old-logo.png", logoUrl: "https://cdn.example.com/old-logo.png" },
    isLoading: false,
  });
  render(<LibraryPage />);
  expect(capturedViewProps?.logoImageUrl).toBeTruthy();
});
