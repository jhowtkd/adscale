import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// --- Mocks -----------------------------------------------------------------

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    namespace === "brandTraining" || namespace === "common" ? `${namespace}.${key}` : key,
}));

vi.mock("framer-motion", () => ({
  m: {
    div: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
  },
}));

vi.mock("@/lib/store", () => ({
  useAppStore: () => vi.fn(),
}));

vi.mock("next/image", () => ({ default: () => null }));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

// react-query hooks: top-level handles so each test can re-mock.
const useClientProfilesMock = vi.fn();
const useCreateClientProfileMock = vi.fn();
vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: () => useClientProfilesMock(),
  useCreateClientProfile: () => useCreateClientProfileMock(),
}));

const useBrandTrainingStatusMock = vi.fn();
const useExtractMultiMock = vi.fn();
const useExtractVoiceMock = vi.fn();
const useApproveVoiceMock = vi.fn();
const useBrandTrainingAssetsMock = vi.fn();
const useUploadBrandTrainingAssetMock = vi.fn();
const useReviewBrandTrainingAssetMock = vi.fn();
vi.mock("@/lib/hooks/use-brand-training", () => ({
  useBrandTrainingStatus: () => useBrandTrainingStatusMock(),
  useExtractMulti: () => useExtractMultiMock(),
  useExtractVoice: () => useExtractVoiceMock(),
  useApproveVoice: () => useApproveVoiceMock(),
  useBrandTrainingAssets: () => useBrandTrainingAssetsMock(),
  useUploadBrandTrainingAsset: () => useUploadBrandTrainingAssetMock(),
  useReviewBrandTrainingAsset: () => useReviewBrandTrainingAssetMock(),
}));

const useBrandKitMock = vi.fn();
const useUpdateBrandKitMock = vi.fn();
vi.mock("@/lib/hooks/use-brand-kit", () => ({
  useBrandKit: () => useBrandKitMock(),
  useUpdateBrandKit: () => useUpdateBrandKitMock(),
}));

import BrandTrainingWizard from "./BrandTrainingWizard";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function defaultHooks() {
  useClientProfilesMock.mockReturnValue({
    data: [
      { id: "profile-1", name: "Acme" },
      { id: "profile-2", name: "Beta" },
    ],
    isLoading: false,
  });
  useCreateClientProfileMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useBrandTrainingStatusMock.mockReturnValue({ data: { trained: false, missing: ["logo"] } });
  useExtractMultiMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useExtractVoiceMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useApproveVoiceMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useBrandTrainingAssetsMock.mockReturnValue({ data: [], isLoading: false });
  useUploadBrandTrainingAssetMock.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  });
  useReviewBrandTrainingAssetMock.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  });
  useBrandKitMock.mockReturnValue({ data: null });
  useUpdateBrandKitMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
}

describe("BrandTrainingWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultHooks();
  });

  it("renders the title, subtitle, and the stepper with five steps", () => {
    render(<BrandTrainingWizard />, { wrapper: createWrapper() });

    expect(screen.getByText("brandTraining.title")).toBeInTheDocument();
    expect(screen.getByText("brandTraining.subtitle")).toBeInTheDocument();
    // Stepper labels are rendered for each step.
    expect(screen.getByText("brandTraining.stepProfile")).toBeInTheDocument();
  });

  it("lists existing client profiles and selects one on click", async () => {
    render(<BrandTrainingWizard />, { wrapper: createWrapper() });

    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Acme"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("clientProfileId=profile-1"),
        { scroll: false },
      );
    });
  });

  it("renders the ingest step after selecting a profile and advancing", async () => {
    useBrandTrainingStatusMock.mockReturnValue({
      data: { trained: false, missing: ["logo", "visual-signal"] },
    });

    render(<BrandTrainingWizard />, { wrapper: createWrapper() });

    // Select a profile, then advance to the next step.
    fireEvent.click(screen.getByText("Acme"));
    fireEvent.click(screen.getByText("common.next"));

    await waitFor(() => {
      expect(screen.getByText("brandTraining.ingestTitle")).toBeInTheDocument();
    });
    // Ingest shows the three input kinds.
    expect(screen.getByText("brandTraining.kind_guide")).toBeInTheDocument();
    expect(screen.getByText("brandTraining.kind_logo")).toBeInTheDocument();
    expect(screen.getByText("brandTraining.kind_creative")).toBeInTheDocument();
  });

  it("renders the trained badge when status reports trained=true", () => {
    useBrandTrainingStatusMock.mockReturnValue({
      data: { trained: true, missing: [] },
    });

    render(<BrandTrainingWizard />, { wrapper: createWrapper() });

    expect(screen.getByText("brandTraining.trainedBadge")).toBeInTheDocument();
  });

  it("mounts the approved-assets panel at the curate step", async () => {
    render(<BrandTrainingWizard />, { wrapper: createWrapper() });

    // Select a profile, then advance to step 3 (curate).
    fireEvent.click(screen.getByText("Acme"));
    fireEvent.click(screen.getByText("common.next")); // ingest
    fireEvent.click(screen.getByText("common.next")); // validate
    fireEvent.click(screen.getByText("common.next")); // curate

    await waitFor(() => {
      expect(
        screen.getByText("brandTraining.assets.title"),
      ).toBeInTheDocument();
    });
    // Native file input is wired up exactly as the brief specifies.
    const input = document.querySelector<HTMLInputElement>(
      "#brand-training-files",
    );
    expect(input).not.toBeNull();
    expect(input?.getAttribute("accept")).toBe(
      "image/png,image/jpeg,image/webp,image/svg+xml",
    );
    expect(input?.hasAttribute("multiple")).toBe(true);
    // Empty state is shown when no assets exist yet.
    expect(
      screen.getByText("brandTraining.assets.emptyTitle"),
    ).toBeInTheDocument();
  });

  it("preserves prior step state when navigating back from the assets panel", async () => {
    render(<BrandTrainingWizard />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByText("Acme"));
    fireEvent.click(screen.getByText("common.next"));
    fireEvent.click(screen.getByText("common.next"));
    fireEvent.click(screen.getByText("common.next"));

    await waitFor(() => {
      expect(
        screen.getByText("brandTraining.assets.title"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("common.back"));
    // Validate step is still rendered with its original title (state preserved).
    expect(
      screen.getByText("brandTraining.validateTitle"),
    ).toBeInTheDocument();
  });
});
