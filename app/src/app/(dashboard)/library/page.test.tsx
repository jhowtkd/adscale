"use client";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useWorkspaceAssetsMock = vi.fn();
const useDeleteWorkspaceAssetMock = vi.fn();
const useLibraryFavoritesMock = vi.fn();
const useSetPieceFavoriteMock = vi.fn();
const invalidateQueriesMock = vi.fn();
let capturedViewProps: {
  activeFilter: string;
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
  });

  it("loads favorites only under the favorites filter with download and unfavorite actions", () => {
    const setFavorite = { mutate: vi.fn(), isPending: false };
    useSetPieceFavoriteMock.mockReturnValue(setFavorite);
    render(<LibraryPage />);

    expect(useLibraryFavoritesMock).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("active-filter")).toHaveTextContent("all");

    act(() => capturedViewProps!.onFilterChange("favorite"));

    expect(useLibraryFavoritesMock).toHaveBeenLastCalledWith(true);
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
