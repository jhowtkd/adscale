import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockMutateAsync = vi.fn();
const mockUpdateCampaign = vi.fn();
const mockGoToTrabalho = vi.fn();
const mockReplace = vi.fn();
let searchParamsQuery = "";
// Ticket 11, part 2: what the page knows about the free plan. undefined = still loading, null = classic or paid.
let freePlan: { accountId: string } | null | undefined = null;

// Mutable pieces for the style-material tests (#503, D7).
const hoisted = vi.hoisted(() => ({
  workspace: {} as Record<string, unknown>,
  assets: { data: [] as Array<Record<string, unknown>>, featured: null as unknown },
  byIdsCalls: [] as Array<{ campaignId: string; ids: string[] }>,
  byIdsResult: undefined as Array<Record<string, unknown>> | undefined,
  sheetProps: [] as Array<Record<string, unknown>>,
}));

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
  useSearchParams: () => new URLSearchParams(searchParamsQuery),
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}));

vi.mock("@/lib/store", () => ({
  useAppStore: () => vi.fn(),
}));

vi.mock("@/lib/hooks/use-creative-production", () => ({
  useCreativeProduction: () => ({ data: undefined, isLoading: false }),
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
    derivationSummary: null,
    loadedDerivations: [],
    hasMoreDerivations: false,
    loadMoreDerivations: vi.fn(),
    loadingMoreDerivations: false,
    loadMoreDerivationsFailed: false,
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
    goToTrabalho: mockGoToTrabalho,
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
    ...hoisted.workspace,
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
  useCampaignAssets: () => ({ data: hoisted.assets.data, featured: hoisted.assets.featured, isLoading: false }),
  useCampaignAssetsByIds: (campaignId: string, ids: string[]) => {
    hoisted.byIdsCalls.push({ campaignId, ids });
    return { data: ids.length > 0 ? hoisted.byIdsResult : undefined };
  },
}));

vi.mock("@/lib/hooks/use-creative-inspirations", () => ({
  useCreativeInspirations: () => ({ data: [], isLoading: false }),
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
  useUpdateCampaign: () => ({ mutateAsync: mockUpdateCampaign, isPending: false }),
}));

vi.mock("@/lib/hooks/use-assistant-threads", () => ({
  useCreateAssistantThread: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    error: null,
  }),
}));

vi.mock("@/lib/equipe/use-equipe", () => ({ useFreePlanAccount: () => freePlan }));
vi.mock("@/components/billing/FreePlanCta", () => ({
  FreePlanCta: ({ accountId, intro }: { accountId: string; intro?: string }) => (
    <div data-testid="free-plan-cta" data-account-id={accountId}>{intro}</div>
  ),
}));

vi.mock("@/components/assistant/AssistantChatCore", () => ({
  default: ({ threadId }: { threadId: string | null }) => (
    <div data-testid="assistant-chat-core" data-thread-id={threadId ?? ""} />
  ),
}));

// Avoid loading heavy dynamically-imported client components.
vi.mock("@/components/workspace/DeliveryPackageModal", () => ({ default: () => null }));
vi.mock("@/components/workspace/DerivationReviewSheet", () => ({
  default: (props: Record<string, unknown>) => {
    hoisted.sheetProps.push(props);
    return null;
  },
}));

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
  default: ({ onComplete }: { onComplete: (briefing: Record<string, string>) => void }) => (
    <button
      type="button"
      onClick={() =>
        onComplete({
          product: "Coffee combo",
          offer: "Same-day delivery",
          objective: "Increase afternoon orders",
          audience: "People in the neighborhood",
          platforms: "Instagram, Facebook",
          ctaText: "Order now",
          constraints: "No unsupported claims",
        })
      }
    >
      Complete briefing
    </button>
  ),
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
    hoisted.workspace = {};
    hoisted.assets = { data: [], featured: null };
    hoisted.byIdsCalls = [];
    hoisted.byIdsResult = undefined;
    hoisted.sheetProps = [];
    searchParamsQuery = "";
    freePlan = null;
    mockMutateAsync.mockResolvedValue({ id: "thread-default-1" });
    mockUpdateCampaign.mockResolvedValue(undefined);
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

  it("keeps the mobile workspace view selection accessible", async () => {
    renderPage();

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());

    const gridTab = screen.getByRole("radio", { name: "campaign.workspace.gridTab" });
    const chatTab = screen.getByRole("radio", { name: "campaign.workspace.chatTab" });
    expect(gridTab).toHaveAttribute("aria-checked", "true");

    fireEvent.click(chatTab);
    expect(chatTab).toHaveAttribute("aria-checked", "true");
  });

  it("continues a campaign grouping by creating a piece on Palco", () => {
    renderPage();

    expect(screen.getByRole("link", { name: "campaign.v6.newPiece" })).toHaveAttribute(
      "href",
      "/creative-work/new?mode=arte&compose=1&campaignId=camp-1",
    );
    expect(screen.getByTestId("campaign-pieces-empty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete briefing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "campaign.v6.stageBriefing" })).not.toBeInTheDocument();
  });

  it("sends a piece overlay to the Peça route instead of nesting resume on Campanha", async () => {
    searchParamsQuery = "creativeWork=work-9";
    renderPage();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/creative-work/work-9");
    });
    expect(screen.queryByTestId("campaign-pieces-empty")).not.toBeInTheDocument();
  });

  describe("the campaign assistant and the free plan (ticket 11, part 2)", () => {
    it("on the free plan: no assistant panel, no thread is created, and the plan request takes its place", async () => {
      freePlan = { accountId: "acc-free" };
      renderPage();

      const cta = screen.getByTestId("free-plan-cta");
      expect(cta).toHaveAttribute("data-account-id", "acc-free");
      expect(cta).toHaveTextContent("billing.conversion.freePlan.campaignAssistant");
      expect(screen.queryByTestId("assistant-chat-core")).not.toBeInTheDocument();
      expect(mockMutateAsync).not.toHaveBeenCalled();
      // The rest of the page is still there.
      expect(screen.getByTestId("campaign-pieces-empty")).toBeInTheDocument();
    });

    it("on a paid or classic workspace (null): the panel as before, and no plan request", async () => {
      freePlan = null;
      renderPage();

      await waitFor(() => expect(screen.getByTestId("assistant-chat-core")).toBeInTheDocument());
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("free-plan-cta")).not.toBeInTheDocument();
    });

    it("while the plan is unknown: neither the panel nor the request (no flash), no thread is created, the page renders", () => {
      freePlan = undefined;
      renderPage();

      expect(screen.queryByTestId("assistant-chat-core")).not.toBeInTheDocument();
      expect(screen.queryByTestId("free-plan-cta")).not.toBeInTheDocument();
      expect(mockMutateAsync).not.toHaveBeenCalled();
      expect(screen.getByTestId("campaign-pieces-empty")).toBeInTheDocument();
    });

    it("the panel does not appear when the plan becomes known as free after loading", async () => {
      freePlan = undefined;
      const { rerender } = renderPage();
      expect(screen.queryByTestId("assistant-chat-core")).not.toBeInTheDocument();

      freePlan = { accountId: "acc-free" };
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <Page />
        </QueryClientProvider>
      );

      expect(screen.getByTestId("free-plan-cta")).toBeInTheDocument();
      expect(screen.queryByTestId("assistant-chat-core")).not.toBeInTheDocument();
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe("the style material of the Peça in review (#503, D7)", () => {
    const reviewing = (styleAssetId: string | null) => {
      const derivation = { id: "d-1", campaignId: "camp-1", status: "completed", styleAssetId, imageUrl: "https://x/d-1" };
      hoisted.workspace = { reviewDerivationId: "d-1", allDerivations: [derivation], loadedDerivations: [derivation] };
    };
    const lastSheet = () => hoisted.sheetProps.at(-1) as Record<string, unknown> | undefined;
    const asset = (id: string) => ({ id, campaignId: "camp-1", role: "style_reference", url: `https://x/${id}` });

    it("a style material outside the loaded pages is resolved by id and reaches the sheet", async () => {
      reviewing("style-far");
      hoisted.assets = { data: [asset("a-1"), asset("a-2")], featured: null };
      hoisted.byIdsResult = [asset("style-far")];
      renderPage();

      await waitFor(() => expect(lastSheet()?.styleAsset).toEqual(asset("style-far")));
      expect(hoisted.byIdsCalls.some((c) => c.campaignId === "camp-1" && c.ids.join() === "style-far")).toBe(true);
      expect(lastSheet()?.open).toBe(true);
    });

    it("a style material on a loaded page is used as is, without the ids= lookup", async () => {
      reviewing("a-2");
      hoisted.assets = { data: [asset("a-1"), asset("a-2")], featured: null };
      hoisted.byIdsResult = [asset("other")];
      renderPage();

      await waitFor(() => expect(lastSheet()?.styleAsset).toEqual(asset("a-2")));
      expect(hoisted.byIdsCalls.every((c) => c.ids.length === 0)).toBe(true);
    });

    it("no styleAssetId: no lookup and no style material", async () => {
      reviewing(null);
      hoisted.assets = { data: [asset("a-1")], featured: null };
      renderPage();

      await waitFor(() => expect(lastSheet()).toBeDefined());
      expect(lastSheet()?.styleAsset).toBeNull();
      expect(hoisted.byIdsCalls.every((c) => c.ids.length === 0)).toBe(true);
    });

    it("an id the server does not return (other Campanha or removed) leaves the style material empty", async () => {
      reviewing("style-gone");
      hoisted.assets = { data: [asset("a-1")], featured: null };
      hoisted.byIdsResult = [];
      renderPage();

      await waitFor(() => expect(hoisted.byIdsCalls.some((c) => c.ids.join() === "style-gone")).toBe(true));
      expect(lastSheet()?.styleAsset).toBeNull();
    });

    it("the base asset comes from featured.base, which covers every material, before assets[0]", async () => {
      reviewing(null);
      hoisted.assets = { data: [asset("a-1")], featured: { base: { ...asset("base-far"), role: "base" }, linked: null } };
      renderPage();

      await waitFor(() => expect((lastSheet()?.baseAsset as { id?: string } | null)?.id).toBe("base-far"));
    });

    it("without featured.base the sheet falls back to assets[0]", async () => {
      reviewing(null);
      hoisted.assets = { data: [asset("a-1"), asset("a-2")], featured: { base: null, linked: null } };
      renderPage();

      await waitFor(() => expect((lastSheet()?.baseAsset as { id?: string } | null)?.id).toBe("a-1"));
    });
  });
});
