import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// --- Mocks -----------------------------------------------------------------

const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    namespace.startsWith("brandTraining") || namespace === "common" ? `${namespace}.${key}` : key,
}));

vi.mock("@/components/animations/MotionBoundary", () => ({
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
const useActiveClientProfileMock = vi.fn();
const selectProfileMock = vi.fn();
vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: () => useClientProfilesMock(),
  useCreateClientProfile: () => useCreateClientProfileMock(),
}));
vi.mock("@/lib/hooks/use-active-client-profile", () => ({
  useActiveClientProfile: () => useActiveClientProfileMock(),
}));

const useBrandTrainingStatusMock = vi.fn();
const useExtractMultiMock = vi.fn();
const useExtractVoiceMock = vi.fn();
const useApproveVoiceMock = vi.fn();
const useBrandTrainingAssetsMock = vi.fn();
const useUploadBrandTrainingAssetMock = vi.fn();
const useReviewBrandTrainingAssetMock = vi.fn();
const useBrandFontsMock = vi.fn();
const useUploadBrandFontMock = vi.fn();
const useReviewBrandFontMock = vi.fn();
const useBrandKnowledgeMock = vi.fn();
const useReviewBrandKnowledgeClaimMock = vi.fn();
const usePublishBrandKnowledgeMock = vi.fn();
vi.mock("@/lib/hooks/use-brand-training", () => ({
  useBrandTrainingStatus: (...args: unknown[]) => useBrandTrainingStatusMock(...args),
  useExtractMulti: () => useExtractMultiMock(),
  useExtractVoice: () => useExtractVoiceMock(),
  useApproveVoice: () => useApproveVoiceMock(),
  useBrandTrainingAssets: () => useBrandTrainingAssetsMock(),
  useUploadBrandTrainingAsset: () => useUploadBrandTrainingAssetMock(),
  useReviewBrandTrainingAsset: () => useReviewBrandTrainingAssetMock(),
  useBrandFonts: () => useBrandFontsMock(),
  useUploadBrandFont: () => useUploadBrandFontMock(),
  useReviewBrandFont: () => useReviewBrandFontMock(),
  useBrandKnowledge: () => useBrandKnowledgeMock(),
  useReviewBrandKnowledgeClaim: () => useReviewBrandKnowledgeClaimMock(),
  usePublishBrandKnowledge: () => usePublishBrandKnowledgeMock(),
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
  useActiveClientProfileMock.mockReturnValue({
    activeClientProfileId: "profile-2",
    profiles: [
      { id: "profile-1", name: "Acme" },
      { id: "profile-2", name: "Beta" },
    ],
    selectProfile: selectProfileMock,
  });
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
  useBrandFontsMock.mockReturnValue({ data: [], isLoading: false });
  useUploadBrandFontMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useReviewBrandFontMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useBrandKnowledgeMock.mockReturnValue({
    data: { claims: [], conflicts: [], versions: [], activeVersion: null },
    isLoading: false,
  });
  useReviewBrandKnowledgeClaimMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  usePublishBrandKnowledgeMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useBrandKitMock.mockReturnValue({ data: null });
  useUpdateBrandKitMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
}

describe("BrandTrainingWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    defaultHooks();
  });

  it("renders the title, subtitle, and the stepper with five steps", () => {
    render(<BrandTrainingWizard />, { wrapper: createWrapper() });

    expect(screen.getByText("brandTraining.title")).toBeInTheDocument();
    expect(screen.getByText("brandTraining.subtitle")).toBeInTheDocument();
    // Stepper labels are rendered for each step.
    expect(screen.getByText("brandTraining.stepProfile")).toBeInTheDocument();
    expect(useBrandTrainingStatusMock).toHaveBeenCalledWith("profile-2");
  });

  it("lists existing client profiles and selects one on click", async () => {
    render(<BrandTrainingWizard />, { wrapper: createWrapper() });

    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Acme"));

    await waitFor(() => {
      expect(selectProfileMock).toHaveBeenCalledWith("profile-1");
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

  it("ignores a removed profile id from the query and keeps the active brand", () => {
    mockSearchParams = new URLSearchParams("clientProfileId=profile-removed");

    render(<BrandTrainingWizard />, { wrapper: createWrapper() });

    expect(useBrandTrainingStatusMock).toHaveBeenCalledWith("profile-2");
    expect(selectProfileMock).not.toHaveBeenCalled();
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

  it("shows real font upload and distinguishes font names from approved files", () => {
    render(<BrandTrainingWizard />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByText("common.next"));
    fireEvent.click(screen.getByText("common.next"));

    expect(screen.getByText("brandTraining.fonts.title")).toBeInTheDocument();
    expect(screen.getByText("brandTraining.fonts.generativeNotice")).toBeInTheDocument();
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

    render(<BrandTrainingWizard />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByText("common.next"));
    fireEvent.click(screen.getByText("common.next"));

    expect(screen.getByText("brandTraining.fonts.statusPending")).toBeInTheDocument();
    fireEvent.click(screen.getByText("brandTraining.fonts.approveReview"));
    expect(mutate).toHaveBeenCalledWith(
      { assetKey: "fonts/pending.ttf", reviewStatus: "approved" },
      expect.any(Object),
    );
  });
});
