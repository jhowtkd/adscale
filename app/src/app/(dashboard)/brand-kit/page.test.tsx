import { render, screen } from "@testing-library/react";
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
  default: () => <select aria-label="active-brand" />,
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
  BrandVoiceSection: ({ clientProfileId }: { clientProfileId: string }) => (
    <div data-testid={`brand-voice-${clientProfileId}`} />
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

  it("renders foundation, training assets, and voice in one window without tabs", () => {
    render(<BrandKitPage />);

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByTestId("brand-foundation")).toBeInTheDocument();
    expect(screen.getByTestId("brand-assets-profile-a")).toBeInTheDocument();
    expect(screen.getByTestId("brand-voice-profile-a")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("brandTraining.trainedBadge");
    expect(useBrandTrainingStatusMock).toHaveBeenCalledWith("profile-a");
  });
});
