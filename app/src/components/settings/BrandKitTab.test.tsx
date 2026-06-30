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
      };
      return labels[key] ?? key;
    }
    if (namespace === "common") {
      const labels: Record<string, string> = {
        error: "Error",
        save: "Save",
        success: "Success",
        loading: "Loading",
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

vi.mock("framer-motion", () => ({
  m: {
    div: ({ children, ...props }: { children?: React.ReactNode; [k: string]: unknown }) => (
      <div {...(props as Record<string, unknown>)}>{children}</div>
    ),
  },
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
const useCreateClientProfileMock = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const useUpdateBrandKitMock = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const useExtractBrandKitMock = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const useUploadLogoMock = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const useClearBrandKitMock = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: () => useClientProfilesMock(),
  useCreateClientProfile: () => useCreateClientProfileMock(),
}));

vi.mock("@/lib/hooks/use-brand-kit", () => {
  // The mock must export the SAME class reference the component imports and
  // checks with `instanceof`, so the ambiguous error created in the test is
  // recognised as a BrandKitAmbiguousError inside the component.
  return {
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
});

describe("BrandKitTab — workspace selector on 409", () => {
  it("renders the profile selector when brand-kit load fails with BrandKitAmbiguousError", () => {
    useBrandKitMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new MockBrandKitAmbiguousError("Multiple client profiles", PROFILES),
    });

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
  });

  it("re-requests the brand kit with the selected clientProfileId on confirm", async () => {
    useBrandKitMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new MockBrandKitAmbiguousError("Multiple client profiles", PROFILES),
    });

    render(<BrandKitTab />, { wrapper: createWrapper() });

    const select = screen.getByRole("combobox", {
      name: "Select a profile",
    }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "profile-a" } });

    const confirm = screen.getByRole("button", { name: "Use this profile" });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(useBrandKitMock).toHaveBeenCalledWith("profile-a");
    });
  });

  it("does not render the selector for generic errors", () => {
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
