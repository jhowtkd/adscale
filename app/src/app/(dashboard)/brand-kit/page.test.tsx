import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useActiveClientProfileMock = vi.fn();
const useBrandTrainingStatusMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock("@/lib/hooks/use-active-client-profile", () => ({
  useActiveClientProfile: () => useActiveClientProfileMock(),
}));

vi.mock("@/lib/hooks/use-brand-training", () => ({
  useBrandTrainingStatus: (...args: unknown[]) => useBrandTrainingStatusMock(...args),
}));

vi.mock("@/components/layout/ActiveBrandSwitcher", () => ({
  default: () => <button type="button" aria-label="active-brand" />,
}));

vi.mock("@/components/settings/BrandKitTab", () => ({
  default: () => <div data-testid="brand-foundation" />,
}));

vi.mock("@/components/brand-training/BrandTrainingAssets", () => ({
  BrandTrainingAssets: ({ clientProfileId }: { clientProfileId: string }) => (
    <div data-testid={`brand-assets-${clientProfileId}`} />
  ),
}));

vi.mock("@/components/brand-training/BrandTrainingWizard", () => ({
  BrandFontFiles: ({ clientProfileId }: { clientProfileId: string }) => (
    <div data-testid={`brand-fonts-${clientProfileId}`} />
  ),
  BrandVoiceSection: ({ clientProfileId }: { clientProfileId: string }) => (
    <div data-testid={`brand-voice-${clientProfileId}`} />
  ),
}));

vi.mock("@/components/brand-training/BrandKnowledgeReview", () => ({
  BrandKnowledgeReview: ({ clientProfileId }: { clientProfileId: string }) => (
    <div data-testid={`brand-knowledge-${clientProfileId}`} />
  ),
}));

import BrandKitPage from "./page";

describe("BrandKitPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActiveClientProfileMock.mockReturnValue({
      activeClientProfileId: "profile-a",
      profiles: [{ id: "profile-a", name: "Acme" }],
    });
    useBrandTrainingStatusMock.mockReturnValue({
      data: { trained: true, missing: [] },
    });
  });

  it("keeps Palco chrome and switches one kit panel at a time", () => {
    render(<BrandKitPage />);

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByTestId("brand-kit-strip").className).toContain("rounded-full");
    expect(screen.getByRole("radiogroup", { name: "brandTraining.kitNavAria" }).className).toContain(
      "flex-nowrap",
    );
    expect(screen.getByTestId("brand-foundation")).toBeInTheDocument();
    expect(screen.queryByTestId("brand-assets-profile-a")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("brandTraining.trainedBadge");
    expect(useBrandTrainingStatusMock).toHaveBeenCalledWith("profile-a");

    fireEvent.click(screen.getByRole("radio", { name: "brandTraining.kitSections.assets" }));
    expect(screen.getByTestId("brand-foundation")).not.toBeVisible();
    expect(screen.getByTestId("brand-assets-profile-a")).toBeVisible();
  });
});
