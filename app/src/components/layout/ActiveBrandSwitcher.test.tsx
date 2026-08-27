import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import ActiveBrandSwitcher from "./ActiveBrandSwitcher";

const mocks = vi.hoisted(() => ({
  createProfile: vi.fn(),
  deleteProfile: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/hooks/use-active-client-profile", () => ({
  useActiveClientProfile: vi.fn(),
}));

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useCreateClientProfile: () => ({ mutate: mocks.createProfile, isPending: false }),
  useDeleteClientProfile: () => ({ mutate: mocks.deleteProfile, isPending: false }),
}));

const mockUseActiveClientProfile = vi.mocked(useActiveClientProfile);
const profiles = [
  { id: "one", name: "Brand One" },
  { id: "two", name: "Brand Two" },
];

describe("ActiveBrandSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createProfile.mockImplementation((_input, options) => {
      options?.onSuccess?.({ id: "three", name: "Brand Three" });
    });
  });

  it("keeps the client switcher interactive with one profile", () => {
    mockUseActiveClientProfile.mockReturnValue({
      profiles: [profiles[0]],
      activeProfile: profiles[0],
      activeClientProfileId: "one",
      requiresSelection: false,
      isLoading: false,
      selectProfile: vi.fn(),
    } as ReturnType<typeof useActiveClientProfile>);

    render(<ActiveBrandSwitcher />);

    expect(screen.getByRole("combobox", { name: "activeBrand" })).toHaveValue("one");
    expect(screen.getByRole("option", { name: "Brand One" })).toBeInTheDocument();
  });

  it("confirms deletion of the active brand", () => {
    mockUseActiveClientProfile.mockReturnValue({
      profiles: [profiles[0]],
      activeProfile: profiles[0],
      activeClientProfileId: "one",
      requiresSelection: false,
      isLoading: false,
      selectProfile: vi.fn(),
    } as ReturnType<typeof useActiveClientProfile>);

    render(<ActiveBrandSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: "deleteBrand" }));
    fireEvent.click(screen.getByRole("button", { name: "deleteBrandConfirm" }));

    expect(mocks.deleteProfile).toHaveBeenCalledWith("one", expect.any(Object));
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

  it("creates and activates a new brand from the switcher", () => {
    const selectProfile = vi.fn();
    mockUseActiveClientProfile.mockReturnValue({
      profiles,
      activeProfile: profiles[0],
      activeClientProfileId: "one",
      requiresSelection: false,
      isLoading: false,
      selectProfile,
    } as ReturnType<typeof useActiveClientProfile>);

    render(<ActiveBrandSwitcher />);

    fireEvent.change(screen.getByRole("combobox", { name: "activeBrand" }), {
      target: { value: "__new_brand__" },
    });
    expect(selectProfile).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "brandName" }), {
      target: { value: "Brand Three" },
    });
    fireEvent.click(screen.getByRole("button", { name: "createBrand" }));

    expect(mocks.createProfile).toHaveBeenCalledWith(
      { name: "Brand Three" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(selectProfile).toHaveBeenCalledWith("three");
  });

  it("offers new brand creation before the first profile exists", () => {
    mockUseActiveClientProfile.mockReturnValue({
      profiles: [],
      activeProfile: null,
      activeClientProfileId: null,
      requiresSelection: false,
      isLoading: false,
      selectProfile: vi.fn(),
    } as ReturnType<typeof useActiveClientProfile>);

    render(<ActiveBrandSwitcher />);

    expect(screen.getByRole("combobox", { name: "activeBrand" })).toBeVisible();
    expect(screen.getByRole("option", { name: "newBrand" })).toBeInTheDocument();
  });
});
