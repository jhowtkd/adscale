import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockMutateAsync = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, string>) => {
    const base = namespace ? `${namespace}.${key}` : key;
    if (!values) return base;
    return Object.entries(values).reduce(
      (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
      base
    );
  },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "camp-1" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/store", () => ({
  useAppStore: () => vi.fn(),
}));

vi.mock("@/lib/hooks/use-campaign-workspace", () => ({
  useCampaignWorkspace: () => ({
    campaign: {
      id: "camp-1",
      name: "Test Campaign",
      status: "draft",
      client: "Acme",
      clientProfileId: "client-1",
      workspaceId: "ws-1",
      platforms: [],
      createdAt: new Date("2026-01-01"),
    },
    workspaceId: "ws-1",
    isLoading: false,
    isError: false,
    loadErrorKind: null,
    refetchCampaign: vi.fn(),
    isDerivationsError: false,
    derivationsErrorKind: null,
    refetchDerivations: vi.fn(),
    allDerivations: [],
    reviewDerivationId: null,
    regenerateDialog: null,
    handleCloseReview: vi.fn(),
    handleConfirmRegenerate: vi.fn(),
    handleCloseRegenerateDialog: vi.fn(),
    handleRequestRegenerate: vi.fn(),
    approvedDerivation: null,
    workspaceState: "setup",
    isGenerating: false,
    savingReferenceId: null,
    deliveryModalOpen: false,
    selectedDeliverySource: null,
    handleDeliveryModalOpenChange: vi.fn(),
    goToSetup: vi.fn(),
    goToTrabalho: vi.fn(),
    savePilot: vi.fn(),
    handleGenerateDerivations: vi.fn(),
    configureAndGenerate: vi.fn(),
    handleRestyle: vi.fn(),
    handleSaveAsReference: vi.fn(),
    hasActivePreview: false,
    previewDerivation: null,
    showPreviewGate: false,
    approvePreviewToBatch: vi.fn(),
    handlePreview: vi.fn(),
    handleDownloadDerivation: vi.fn(),
    handleRegenerateDerivation: vi.fn(),
    handleApproveDerivation: vi.fn(),
    handleRejectDerivation: vi.fn(),
    handleReviewDecision: vi.fn(),
    handleRunQa: vi.fn(),
    handleCreateDeliveryPackage: vi.fn(),
    handleConfirmDeliveryPackage: vi.fn(),
    handleDownloadDeliverySource: vi.fn(),
    handleExportDerivation: vi.fn(),
    handleDelete: vi.fn(),
    handleDeleteClick: vi.fn(),
    showDeleteDialog: false,
    setShowDeleteDialog: vi.fn(),
    creativeQaPending: false,
    creativeQaVariables: null,
    reviewPending: false,
    reviewVariables: null,
    regeneratePending: false,
    regenerateVariables: null,
    createDerivationsPending: false,
    exportPending: false,
    deliveryPackagePending: false,
    generatePlanPending: false,
    updatePlanStatusPending: false,
  }),
}));

vi.mock("@/lib/hooks/use-derivation-flow", () => ({
  useDerivationFlow: () => ({
    isDerivePanelOpen: false,
    derivePanelSession: 1,
    recipePrefill: null,
    pendingOutputLearningApplication: null,
    setPendingOutputLearningApplication: vi.fn(),
    openDerivePanel: vi.fn(),
    closeFlow: vi.fn(),
  }),
}));

vi.mock("@/lib/hooks/use-assets", () => ({
  useUploadAsset: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCampaignAssets: () => ({ data: [] }),
}));

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: () => ({ data: [], isSuccess: true }),
}));

vi.mock("@/lib/hooks/use-brand-kit", () => ({
  useBrandKit: () => ({ data: null }),
  resolveBrandKitClientProfileId: () => "client-1",
  shouldFetchBrandKit: () => false,
}));

vi.mock("@/lib/hooks/use-preflight", () => ({
  usePreflightScore: () => ({ data: null }),
}));

vi.mock("@/lib/hooks/use-campaigns", () => ({
  useUpdateCampaign: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/hooks/use-assistant-threads", () => ({
  useCreateAssistantThread: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    error: null,
  }),
}));

vi.mock("@/components/assistant/AssistantChatCore", () => ({
  default: ({ threadId }: { threadId: string | null }) => (
    <div data-testid="assistant-chat-core" data-thread-id={threadId ?? ""} />
  ),
}));

// Avoid loading heavy dynamically-imported client components.
vi.mock("@/components/workspace/DeliveryPackageModal", () => ({ default: () => null }));
vi.mock("@/components/workspace/DerivationReviewSheet", () => ({ default: () => null }));

// Components that pull provider/DB context we don't want in this layout test.
vi.mock("@/components/feedback/ContextualFeedbackButton", () => ({
  default: () => null,
}));
vi.mock("@/components/campaigns/ClientProfileLinkControl", () => ({
  default: () => null,
}));
vi.mock("@/components/campaigns/OutputLearningRecommendationCard", () => ({
  default: () => null,
}));
vi.mock("@/components/workspace/PilotUploadPanel", () => ({
  default: () => null,
}));
vi.mock("@/components/workspace/GuidedBriefingPanel", () => ({
  default: () => null,
}));
vi.mock("@/components/workspace/PilotSidebar", () => ({
  default: () => null,
}));
vi.mock("@/components/workspace/DerivationGrid", () => ({
  default: () => null,
}));
vi.mock("@/components/workspace/StrategyRecipePanel", () => ({
  default: () => null,
}));
vi.mock("@/components/workspace/ClientApprovalPackagePanel", () => ({
  default: () => null,
}));
vi.mock("@/components/workspace/WorkspaceActionBar", () => ({
  default: () => null,
}));
vi.mock("@/components/campaigns/PlatformsDrawer", () => ({
  default: () => null,
}));

import Page from "./page";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Page />
    </QueryClientProvider>
  );
}

describe("CampaignWorkspacePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({ id: "thread-default-1" });
  });

  it("renders the assistant chat panel by default (not behind a toggle)", async () => {
    renderPage();

    // The chat panel must be present in the document immediately, without the
    // user having to click an "open assistant" button first.
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        clientProfileId: "client-1",
        campaignId: "camp-1",
        isDefault: true,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("assistant-chat-core")).toBeInTheDocument();
    });
  });

  it("does not render an open-assistant toggle button", () => {
    renderPage();

    // The Sheet trigger / open-assistant button no longer exists.
    expect(
      screen.queryByRole("button", { name: /open assistant/i })
    ).not.toBeInTheDocument();
  });
});
