"use client";

// The REAL Library page rendering the REAL LibraryV6View, with only the hooks mocked. The page tests
// capture the view's props, so they cannot see what the identity card actually renders.

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useWorkspaceAssetsMock = vi.fn();
const useActiveClientProfileMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const fn = ((key: string) => `${namespace}:${key}`) as unknown as Record<string, unknown>;
    (fn as { raw: (key: string) => string }).raw = (key: string) => `${namespace}:${key}`;
    return fn;
  },
}));
vi.mock("@/lib/hooks/use-workspace-assets", () => ({
  useWorkspaceAssets: (...args: unknown[]) => useWorkspaceAssetsMock(...args),
  useDeleteWorkspaceAsset: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-piece-favorite", () => ({
  useLibraryFavorites: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useSetPieceFavorite: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/use-active-client-profile", () => ({ useActiveClientProfile: (...args: unknown[]) => useActiveClientProfileMock(...args) }));
vi.mock("@/lib/hooks/use-brand-kit", () => ({ useBrandKit: () => ({ data: undefined }) }));
vi.mock("@/lib/equipe/use-equipe", () => ({
  useEquipeAccounts: () => ({ data: { accounts: [] }, isLoading: false }),
  useEquipeAccountState: () => ({ data: { documents: [] }, isLoading: false }),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import LibraryPage from "./page";

const PROFILE_ID = "profile-1";
type Row = { id: string; name: string; key: string; metadata?: Record<string, unknown> | null; tags?: string[] | null };
const asset = (r: Row) => ({
  id: r.id, workspaceId: "ws-1", clientProfileId: PROFILE_ID, name: r.name, key: r.key, type: "image/png", size: 1, width: null, height: null,
  tags: r.tags ?? null, aiDescription: null, source: "brand_upload", metadata: r.metadata ?? null,
  createdAt: "2026-09-30T00:00:00.000Z", updatedAt: "2026-09-30T00:00:00.000Z", url: `/api/workspace/assets/${r.id}/file`,
});

function arrange(profile: { logoAssetKey: string | null }, rows: Row[]) {
  vi.clearAllMocks();
  useActiveClientProfileMock.mockReturnValue({
    profiles: [{ id: PROFILE_ID, name: "Acme" }],
    activeClientProfileId: PROFILE_ID,
    activeProfile: { id: PROFILE_ID, name: "Acme", brandColors: [], brandFonts: [], ...profile },
    requiresSelection: false, isLoading: false, isError: false, selectProfile: vi.fn(),
  });
  useWorkspaceAssetsMock.mockImplementation((options: { kind?: string }) => ({
    // the identity query returns the most recent logo-kind row first; the gallery query returns everything
    data: { assets: rows.map(asset), total: rows.length, ...(options.kind ? {} : {}) },
    isLoading: false, isFetching: false, isError: false, fetchNextPage: vi.fn(),
  }));
  render(<LibraryPage />);
  const identity = screen.getByRole("region", { name: "Identidade" });
  const headerLogo = within(identity).queryByRole("img", { name: "Acme" });
  const gallery = screen.queryByTestId("library-bento");
  return { headerLogoSrc: headerLogo?.getAttribute("src") ?? null, galleryText: gallery?.textContent ?? "" };
}

const CURRENT: Row = { id: "current", name: "Logo atual", key: "workspaces/ws-1/brand-kit/current.png", metadata: { kind: "brand_logo" } };
const REPLACED: Row = { id: "old", name: "Logo antigo", key: "workspaces/ws-1/brand-kit/old.png", metadata: { kind: "brand_logo" } };
const PHOTO: Row = { id: "photo", name: "Foto", key: "workspaces/ws-1/assets/photo.png", metadata: { category: "product" } };

describe("LibraryPage with the real view: the identity card shows only the brand's current logo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("current logo in the identity card; the replaced logo and the photo stay in the gallery; the current logo does not repeat there", () => {
    const { headerLogoSrc, galleryText } = arrange({ logoAssetKey: CURRENT.key }, [CURRENT, REPLACED, PHOTO]);
    expect(headerLogoSrc).toContain("/api/workspace/assets/current/file");
    expect(galleryText).toContain("Logo antigo");
    expect(galleryText).toContain("Foto");
    expect(galleryText).not.toContain("Logo atual");
  });

  it("Brand Kit cleared (no logoAssetKey) while a REPLACED logo row still exists: the identity card must not present it as the brand's logo", () => {
    const { headerLogoSrc, galleryText } = arrange({ logoAssetKey: null }, [REPLACED, PHOTO]);
    expect(galleryText).toContain("Logo antigo");      // still reachable (and deletable) in the gallery
    expect(headerLogoSrc).toBeNull();                   // but not shown as the current logo
  });

  it("a brand that never had a logoAssetKey does not get a heuristic 'logo-looking' asset as its logo either", () => {
    const { headerLogoSrc } = arrange({ logoAssetKey: null }, [
      { id: "legacy", name: "logo-cliente.png", key: "workspaces/ws-1/assets/logo-cliente.png", metadata: null }, PHOTO,
    ]);
    expect(headerLogoSrc).toBeNull();
  });
});
