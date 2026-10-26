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

const hoisted = vi.hoisted(() => ({
  workspace: {} as Record<string, unknown>,
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

vi.mock("@/lib/hooks/use-canonical-works", () => ({
  useCanonicalWorks: () => ({ data: [], isLoading: false }),
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
    workspaceState: "setup",
    isGenerating: false,
    goToSetup: vi.fn(),
    goToTrabalho: mockGoToTrabalho,
    handleDelete: vi.fn(),
    handleDeleteClick: vi.fn(),
    showDeleteDialog: false,
    setShowDeleteDialog: vi.fn(),
    ...hoisted.workspace,
  }),
}));

vi.mock("@/lib/hooks/use-assets", () => ({
  useUploadAsset: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCampaignAssets: () => ({ data: [], featured: null, isLoading: false }),
}));

vi.mock("@/lib/hooks/use-creative-inspirations", () => ({
  useCreativeInspirations: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: () => ({ data: [], isSuccess: true }),
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
});
