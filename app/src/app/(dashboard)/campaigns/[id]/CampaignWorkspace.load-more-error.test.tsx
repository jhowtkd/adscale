/**
 * A failed "Carregar mais" of the Peças, seen by the whole page (#503, review F1). The real facade and the
 * real useDerivations run over a mocked apiFetch: the failure stays a grid-level notice next to the button,
 * and the page-level error banner (whose retry would refetch only the loaded pages) does not appear.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ failNextPage: true, failFirstPage: false, calls: [] as string[] }));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    t.has = () => true;
    return t;
  },
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "camp-1" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/campaigns/camp-1",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("@/lib/store", () => {
  const state = { setCurrentPageTitle: vi.fn(), addToast: vi.fn() };
  return { useAppStore: (selector: (s: typeof state) => unknown) => selector(state) };
});
vi.mock("@/components/mission-insights/MissionInsightProvider", () => ({ useMissionInsightOptional: () => null }));
vi.mock("@/lib/hooks/use-canonical-works", () => ({
  useCanonicalWorks: () => ({ data: [], isLoading: false }),
  invalidateCanonicalWorks: vi.fn(),
  invalidateWorkListProjections: vi.fn(),
}));
const idle = vi.hoisted(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false }));
vi.mock("@/lib/hooks/use-campaigns", () => ({
  useCampaign: () => ({
    campaign: {
      id: "camp-1",
      workspaceId: "ws-1",
      name: "Campanha",
      client: "Marca",
      clientProfileId: "client-1",
      generationMode: "art_variation",
      creativeLevel: "balanced",
      ctaVariants: ["A"],
      targetFormats: ["1:1"],
      platforms: [],
      status: "completed",
      createdAt: new Date("2026-10-01T00:00:00Z"),
    },
    isLoading: false,
    isError: false,
    loadErrorKind: null,
    refetch: vi.fn(),
  }),
  useUpdateCampaign: () => idle,
  useDeleteCampaign: () => idle,
}));
vi.mock("@/lib/hooks/use-regenerate", () => ({ useRegenerateDerivation: () => idle }));
vi.mock("@/lib/hooks/use-export", () => ({ useExport: () => idle }));
vi.mock("@/lib/hooks/use-review", () => ({ useReviewDerivation: () => idle }));
vi.mock("@/lib/hooks/use-delivery-package", () => ({ useCreateDeliveryPackage: () => idle }));
vi.mock("@/lib/hooks/use-creative-qa", () => ({ useCreativeQa: () => idle }));
vi.mock("@/lib/hooks/use-plan", () => ({ useGeneratePlan: () => idle, useUpdatePlanStatus: () => idle }));
vi.mock("@/lib/hooks/use-derivation-flow", () => ({
  useDerivationFlow: () => ({
    isDerivePanelOpen: false,
    derivePanelSession: 1,
    recipePrefill: null,
    pendingOutputLearningApplication: null,
    openDerivePanel: vi.fn(),
    closeFlow: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/use-creative-inspirations", () => ({ useCreativeInspirations: () => ({ data: [], isLoading: false }) }));
vi.mock("@/lib/hooks/use-client-profiles", () => ({ useClientProfiles: () => ({ data: [], isSuccess: true }) }));
vi.mock("@/lib/hooks/use-brand-kit", () => ({
  useBrandKit: () => ({ data: null }),
  resolveBrandKitClientProfileId: () => "client-1",
  shouldFetchBrandKit: () => false,
}));
vi.mock("@/lib/hooks/use-preflight", () => ({ usePreflightScore: () => ({ data: null }) }));
vi.mock("@/lib/equipe/use-equipe", () => ({ useFreePlanAccount: () => null }));
vi.mock("@/components/assistant/CampaignAssistantDrawer", () => ({ CampaignAssistantPanel: () => null }));
vi.mock("@/components/workspace/DeliveryPackageModal", () => ({ default: () => null }));
vi.mock("@/components/workspace/DerivationReviewSheet", () => ({ default: () => null }));
vi.mock("@/components/workspace/StrategyRecipePanel", () => ({ default: () => null }));
vi.mock("@/components/campaigns/ClientProfileLinkControl", () => ({ default: () => null }));
vi.mock("@/components/campaigns/PlatformsDrawer", () => ({ default: () => null }));
vi.mock("@/components/feedback/ContextualFeedbackButton", () => ({ default: () => null }));
vi.mock("@/components/campaigns/OutputLearningRecommendationCard", () => ({ default: () => null }));
vi.mock("@/components/billing/FreePlanCta", () => ({ FreePlanCta: () => null }));
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api-client";
import { summarizeCampaignDerivations } from "@/lib/campaign-derivation-summary";
import Page from "./page";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number) => ({
  id: uuid(n),
  campaignId: "camp-1",
  workspaceId: "ws-1",
  status: "completed",
  scoreStatus: "analyzed",
  isPreview: false,
  outputKey: `out/${n}`,
  imageUrl: `https://signed.test/${n}`,
  variantIndex: n,
  createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 100 - n)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 100 - n)).toISOString(),
});
const ROWS = [row(1), row(2), row(3)];
const json = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>
  );
}

describe("CampaignWorkspacePage: a failed Carregar mais of the Peças", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.failNextPage = true;
    hoisted.failFirstPage = false;
    hoisted.calls = [];
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      hoisted.calls.push(path);
      const url = new URL(`http://x${path}`);
      if (url.searchParams.get("view") === "production") return json(200, { production: [], nextCursor: null });
      if (url.pathname.endsWith("/assets")) {
        return json(200, { assets: [], nextCursor: null, featured: { base: null, linked: null }, total: 0 });
      }
      if (url.searchParams.get("ids")) return json(200, { derivations: [] });
      if (url.searchParams.get("cursor")) {
        return hoisted.failNextPage ? json(500, { error: "boom", code: "internalError" }) : json(200, { derivations: [row(4)], nextCursor: null });
      }
      if (hoisted.failFirstPage) return json(500, { error: "boom", code: "internalError" });
      return json(200, {
        derivations: ROWS,
        nextCursor: "next-1",
        produceSurface: null,
        summary: summarizeCampaignDerivations([...ROWS, row(4)]),
      });
    }) as never);
  });

  it("shows the inline notice next to the button, not the page-level banner", async () => {
    renderPage();
    const button = await screen.findByTestId("campaign-pieces-load-more");
    expect(screen.getAllByRole("img")).toHaveLength(3);

    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText("common.error")).toBeInTheDocument());

    // The loaded Peças stay, the button stays for another try, and no page-level banner appears.
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByTestId("campaign-pieces-load-more")).toBeInTheDocument();
    expect(screen.queryByText("campaign.errors.server.title")).not.toBeInTheDocument();
    expect(screen.queryByText("campaign.errors.unknown.title")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "campaign.errors.retry" })).not.toBeInTheDocument();

    // Trying again from the grid loads the page that failed.
    hoisted.failNextPage = false;
    fireEvent.click(screen.getByTestId("campaign-pieces-load-more"));
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(4));
    expect(screen.queryByText("common.error")).not.toBeInTheDocument();
  });

  it("a failed first page still shows the page-level banner", async () => {
    hoisted.failFirstPage = true;
    renderPage();
    expect(await screen.findByText("campaign.errors.server.title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "campaign.errors.retry" })).toBeInTheDocument();
  });
});
