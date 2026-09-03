import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/store", () => ({
  useAppStore: vi.fn(() => vi.fn(() => undefined)),
}));

vi.mock("next-intl", () => ({
  useTranslations: vi.fn((namespace: string) => (key: string) => {
    if (namespace === "settings") {
      const labels: Record<string, string> = {
        "brandKit.workspaceSelector.title": "Select a client profile",
        "brandKit.workspaceSelector.description":
          "Your account has more than one client profile. Select which profile to use in Brand Kit to continue.",
        "brandKit.workspaceSelector.placeholder": "Select a profile",
        "brandKit.workspaceSelector.confirm": "Use this profile",
        "brandKit.workspaceSelector.cancel": "Cancel",
        "brandKit.workspaceSelector.retryFailed":
          "Could not load the Brand Kit with the selected profile. Try again.",
        "brandKit.title": "Brand Kit",
        "brandKit.subtitle": "Manage brand kit",
        "brandKit.extract": "Extract",
        "brandKit.logoEmpty": "Click or drop the logo",
      };
      return labels[key] ?? key;
    }
    if (namespace === "common") {
      const labels: Record<string, string> = {
        error: "Error",
        save: "Save",
        success: "Success",
        loading: "Loading",
        remove: "remove",
      };
      return labels[key] ?? key;
    }
    if (namespace === "campaign.pilotSidebar") {
      const labels: Record<string, string> = {
        newClientTitle: "Who is this campaign for?",
        newClientDescription: "Enter the client name to create a profile.",
        clientNameLabel: "Client name",
        clientNamePlaceholder: "e.g. Acme",
        existingClientLabel: "Or link an existing client",
        createClientProfile: "Create client",
        saving: "Saving…",
        toastProfileCreatedAndLinked: "Profile created and linked.",
        toastProfileCreateFailed: "Could not create the profile.",
      };
      return labels[key] ?? key;
    }
    return key;
  }),
}));

vi.mock("@/components/animations/MotionBoundary", () => ({
  m: {
    div: ({ children, ...props }: { children?: React.ReactNode; [k: string]: unknown }) => (
      <div {...(props as Record<string, unknown>)}>{children}</div>
    ),
  },
  useReducedMotion: () => false,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
    size,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    size?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
    >
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/ConfirmDialog", () => ({
  default: () => null,
}));

vi.mock("next/image", () => ({
  default: () => null,
}));

const {
  MockBrandKitAmbiguousError,
  MockBrandKitProfileNotFoundError,
} = vi.hoisted(() => {
  class MockBrandKitAmbiguousError extends Error {
    availableWorkspaces: { id: string; name: string }[];
    constructor(message: string, availableWorkspaces: { id: string; name: string }[]) {
      super(message);
      this.name = "BrandKitAmbiguousError";
      this.availableWorkspaces = availableWorkspaces;
    }
  }
  class MockBrandKitProfileNotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "BrandKitProfileNotFoundError";
    }
  }
  return { MockBrandKitAmbiguousError, MockBrandKitProfileNotFoundError };
});

const useBrandKitMock = vi.fn();
const useClientProfilesMock = vi.fn();
const useActiveClientProfileMock = vi.fn();
const selectProfileMock = vi.fn();
const useCreateClientProfileMock = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const useUpdateBrandKitMock = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const useExtractBrandKitMock = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const useUploadLogoMock = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const useClearBrandKitMock = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: () => useClientProfilesMock(),
  useCreateClientProfile: () => useCreateClientProfileMock(),
}));
vi.mock("@/lib/hooks/use-active-client-profile", () => ({
  useActiveClientProfile: () => useActiveClientProfileMock(),
}));

vi.mock("@/lib/hooks/use-brand-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks/use-brand-kit")>();
  return {
    ...actual,
    useBrandKit: (...args: unknown[]) => useBrandKitMock(...args),
    useUpdateBrandKit: () => useUpdateBrandKitMock(),
    useExtractBrandKit: () => useExtractBrandKitMock(),
    useUploadLogo: () => useUploadLogoMock(),
    useClearBrandKit: () => useClearBrandKitMock(),
    BrandKitAmbiguousError: MockBrandKitAmbiguousError,
    BrandKitProfileNotFoundError: MockBrandKitProfileNotFoundError,
  };
});

import BrandKitTab from "./BrandKitTab";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function BrandKitTestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  BrandKitTestWrapper.displayName = "BrandKitTestWrapper";
  return BrandKitTestWrapper;
}

const PROFILES = [
  { id: "profile-a", name: "Acme" },
  { id: "profile-b", name: "Beta Corp" },
];

beforeEach(() => {
  useBrandKitMock.mockReset();
  useBrandKitMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  });
  useClientProfilesMock.mockReturnValue({
    data: PROFILES,
    isSuccess: true,
    isLoading: false,
  });
  useActiveClientProfileMock.mockReturnValue({
    profiles: PROFILES,
    activeClientProfileId: null,
    isLoading: false,
    selectProfile: selectProfileMock,
  });
});

describe("BrandKitTab — workspace selector", () => {
  it("renders the profile selector when multiple client profiles exist", () => {
    render(<BrandKitTab />, { wrapper: createWrapper() });

    expect(screen.getByText("Select a client profile")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your account has more than one client profile. Select which profile to use in Brand Kit to continue."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Acme" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Beta Corp" })).toBeInTheDocument();
    expect(screen.getByLabelText("Client name")).toBeInTheDocument();
    expect(useBrandKitMock).toHaveBeenCalledWith(undefined, { enabled: false });
  });

  it("promotes the selected Brand Kit profile to the global active brand", async () => {
    render(<BrandKitTab />, { wrapper: createWrapper() });

    const select = screen.getByRole("combobox", {
      name: "Select a profile",
    }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "profile-a" } });

    const confirm = screen.getByRole("button", { name: "Use this profile" });
    fireEvent.click(confirm);

    await waitFor(() => expect(selectProfileMock).toHaveBeenCalledWith("profile-a"));
  });

  it("opens the Brand Kit for the global active brand", () => {
    useActiveClientProfileMock.mockReturnValue({
      profiles: PROFILES,
      activeClientProfileId: "profile-b",
      isLoading: false,
      selectProfile: selectProfileMock,
    });

    render(<BrandKitTab />, { wrapper: createWrapper() });

    expect(useBrandKitMock).toHaveBeenCalledWith("profile-b", { enabled: true });
    expect(screen.queryByText("Select a client profile")).not.toBeInTheDocument();
  });

  it("does not render the selector for generic errors on single-profile workspaces", () => {
    useClientProfilesMock.mockReturnValue({
      data: [{ id: "profile-only", name: "Solo" }],
      isSuccess: true,
      isLoading: false,
    });
    useActiveClientProfileMock.mockReturnValue({
      profiles: [{ id: "profile-only", name: "Solo" }],
      activeClientProfileId: "profile-only",
      isLoading: false,
      selectProfile: selectProfileMock,
    });
    useBrandKitMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network failure"),
    });

    render(<BrandKitTab />, { wrapper: createWrapper() });

    expect(screen.queryByText("Select a client profile")).not.toBeInTheDocument();
    expect(screen.getByText("Network failure")).toBeInTheDocument();
  });
});

describe("BrandKitTab — identity occupancy", () => {
  beforeEach(() => {
    useActiveClientProfileMock.mockReturnValue({
      profiles: [{ id: "profile-only", name: "Solo" }],
      activeClientProfileId: "profile-only",
      isLoading: false,
      selectProfile: selectProfileMock,
    });
    useBrandKitMock.mockReturnValue({
      data: {
        name: "Acme",
        description: "Seed",
        logoUrl: "/logo.png",
        logoAssetKey: "logo-1",
        brandColors: ["#00C853"],
        brandFonts: ["Inter"],
        visualNotes: "",
        toneNotes: "warm",
        toneOfVoice: "direct",
        prohibitedElements: "none",
        requiredElements: "logo",
        constraints: "",
      },
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  it("keeps logo and colors on identity and moves voice fields off the stage", async () => {
    const { container, rerender } = render(<BrandKitTab />, { wrapper: createWrapper() });

    expect(screen.getByTestId("brand-kit-identity")).toBeVisible();
    expect(screen.getByRole("button", { name: "remove" })).toBeInTheDocument();
    expect(container.querySelector("[class*='border-dashed']")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Brand Kit" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("brandKit.toneOfVoice")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("brandKit.fonts")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "remove #00C853" })).toBeInTheDocument());

    rerender(<BrandKitTab stage="voice" />);
    expect(screen.getByTestId("brand-kit-voice")).toBeVisible();
    expect(screen.getByLabelText("brandKit.toneOfVoice")).toBeVisible();
    expect(screen.queryByTestId("brand-kit-identity")).not.toBeInTheDocument();

    rerender(<BrandKitTab stage="fonts" />);
    expect(screen.getByTestId("brand-kit-fonts")).toBeVisible();
    expect(screen.queryByLabelText("brandKit.toneOfVoice")).not.toBeInTheDocument();
    expect(screen.queryByText("brandKit.fonts")).not.toBeInTheDocument();
  });
});
