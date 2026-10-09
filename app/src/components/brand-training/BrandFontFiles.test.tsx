import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock("@/lib/store", () => ({
  useAppStore: () => vi.fn(),
}));

const useBrandFontsMock = vi.fn();
const useUploadBrandFontMock = vi.fn();
const useReviewBrandFontMock = vi.fn();
vi.mock("@/lib/hooks/use-brand-training", () => ({
  useBrandFonts: () => useBrandFontsMock(),
  useUploadBrandFont: () => useUploadBrandFontMock(),
  useReviewBrandFont: () => useReviewBrandFontMock(),
}));

import { BrandFontFiles } from "./BrandFontFiles";

describe("BrandFontFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBrandFontsMock.mockReturnValue({ data: [], isLoading: false });
    useUploadBrandFontMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useReviewBrandFontMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("shows real font upload and distinguishes font names from approved files", () => {
    render(<BrandFontFiles clientProfileId="profile-2" />);

    expect(screen.getByText("brandTraining.fonts.generativeNotice")).toBeInTheDocument();
    expect(screen.queryByText("brandTraining.fonts.title")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "brandTraining.fonts.uploadChip" })).toBeInTheDocument();
    expect(document.querySelector<HTMLInputElement>("#brand-font-file")?.accept).toBe(
      ".ttf,.otf,font/ttf,font/otf",
    );
    expect(screen.getByRole("checkbox", { name: "brandTraining.fonts.rightsConfirmed" })).toBeInTheDocument();
  });

  it("requires an explicit human decision before a font is available", () => {
    const mutate = vi.fn();
    useBrandFontsMock.mockReturnValue({
      data: [{
        assetKey: "fonts/pending.ttf",
        family: "Pending Sans",
        source: "Contrato",
        weight: 400,
        style: "normal",
        sha256: "pending",
        reviewStatus: "pending_approval",
        uploadedAt: "2026-08-13T10:00:00.000Z",
        uploadedByUserId: "user-1",
        approvedAt: null,
        approvedByUserId: null,
      }],
      isLoading: false,
    });
    useReviewBrandFontMock.mockReturnValue({ mutate, isPending: false });

    render(<BrandFontFiles clientProfileId="profile-2" />);

    expect(screen.getByText("brandTraining.fonts.statusPending")).toBeInTheDocument();
    expect(screen.getByTestId("brand-kit-font-files").querySelector("li[class*='border']")).toBeNull();
    fireEvent.click(screen.getByText("brandTraining.fonts.approveReview"));
    expect(mutate).toHaveBeenCalledWith(
      { assetKey: "fonts/pending.ttf", reviewStatus: "approved" },
      expect.any(Object),
    );
  });
});
