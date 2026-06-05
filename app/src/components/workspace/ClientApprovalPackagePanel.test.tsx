import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ClientApprovalPackagePanel from "./ClientApprovalPackagePanel";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock("@/lib/hooks/use-approval-package", () => ({
  useApprovalPackage: vi.fn(),
  useSaveApprovalPackage: vi.fn(),
}));

vi.mock("@/lib/hooks/use-export", () => ({
  useExport: vi.fn(),
}));

vi.mock("@/lib/store", () => ({
  useAppStore: vi.fn((selector) =>
    selector({ addToast: vi.fn() })
  ),
}));

import {
  useApprovalPackage,
  useSaveApprovalPackage,
} from "@/lib/hooks/use-approval-package";
import { useExport } from "@/lib/hooks/use-export";

const mockUseApprovalPackage = vi.mocked(useApprovalPackage);
const mockUseSaveApprovalPackage = vi.mocked(useSaveApprovalPackage);
const mockUseExport = vi.mocked(useExport);

describe("ClientApprovalPackagePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSaveApprovalPackage.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useSaveApprovalPackage>);
    mockUseExport.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useExport>);
  });

  it("renders package controls when approved roots exist", () => {
    mockUseApprovalPackage.mockReturnValue({
      data: {
        campaignId: "campaign-1",
        availableRoots: [
          { id: "root-1", format: "1:1", ctaText: "Shop now" },
        ],
        selectedRootIds: ["root-1"],
        package: {
          derivationIds: ["root-1"],
          items: [
            {
              id: "root-1",
              parentId: null,
              format: "1:1",
              status: "approved",
              generationMode: "art_variation",
              variantIndex: 0,
              ctaText: "Shop now",
              creativeNote: "CTA: Shop now",
              hasOutput: true,
              isRoot: true,
            },
          ],
          notes: "",
          isStale: false,
          staleReasons: [],
        },
        shareUrl: "https://app.example.com/share/token",
        expiresAt: "2026-06-12T00:00:00.000Z",
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useApprovalPackage>);

    render(<ClientApprovalPackagePanel campaignId="campaign-1" />);

    expect(screen.getByText("clientApprovalPackage.title")).toBeInTheDocument();
    expect(screen.getByText("Shop now")).toBeInTheDocument();
    expect(screen.getByText("clientApprovalPackage.copyShareLink")).toBeInTheDocument();
  });

  it("calls save mutation when create package is clicked", () => {
    const mutate = vi.fn();
    mockUseSaveApprovalPackage.mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useSaveApprovalPackage>);
    mockUseApprovalPackage.mockReturnValue({
      data: {
        campaignId: "campaign-1",
        availableRoots: [
          { id: "root-1", format: "1:1", ctaText: "Shop now" },
        ],
        selectedRootIds: ["root-1"],
        package: {
          derivationIds: ["root-1"],
          items: [],
          notes: "",
          isStale: false,
          staleReasons: [],
        },
        shareUrl: null,
        expiresAt: null,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useApprovalPackage>);

    render(<ClientApprovalPackagePanel campaignId="campaign-1" />);

    fireEvent.click(screen.getByText("clientApprovalPackage.createPackage"));

    expect(mutate).toHaveBeenCalledWith(
      { derivationIds: ["root-1"], notes: "" },
      expect.any(Object)
    );
  });
});
