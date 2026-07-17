import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import ActiveBrandSwitcher from "./ActiveBrandSwitcher";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/hooks/use-active-client-profile", () => ({
  useActiveClientProfile: vi.fn(),
}));

const mockUseActiveClientProfile = vi.mocked(useActiveClientProfile);
const profiles = [
  { id: "one", name: "Brand One" },
  { id: "two", name: "Brand Two" },
];

describe("ActiveBrandSwitcher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a named non-interactive label for one profile", () => {
    mockUseActiveClientProfile.mockReturnValue({
      profiles: [profiles[0]],
      activeProfile: profiles[0],
      activeClientProfileId: "one",
      requiresSelection: false,
      isLoading: false,
      selectProfile: vi.fn(),
    } as ReturnType<typeof useActiveClientProfile>);

    render(<ActiveBrandSwitcher />);

    expect(screen.getByLabelText("activeBrand")).toHaveTextContent("Brand One");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders an accessible combobox and selects a profile", () => {
    const selectProfile = vi.fn();
    mockUseActiveClientProfile.mockReturnValue({
      profiles,
      activeProfile: null,
      activeClientProfileId: null,
      requiresSelection: true,
      isLoading: false,
      selectProfile,
    } as ReturnType<typeof useActiveClientProfile>);

    render(<ActiveBrandSwitcher />);

    fireEvent.change(screen.getByRole("combobox", { name: "activeBrand" }), {
      target: { value: "two" },
    });
    expect(selectProfile).toHaveBeenCalledWith("two");
  });
});
