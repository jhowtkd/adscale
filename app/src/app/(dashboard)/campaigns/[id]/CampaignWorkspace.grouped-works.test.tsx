/**
 * The Peças of the Trabalhos grouped in a Campanha (#786), seen by the whole page. The real hooks
 * (useCreativeProduction, useDerivations, useCampaignAssets) run over a mocked apiFetch: the grid reads the
 * Campanha's own listing, never the workspace-wide canonical feed, and "Carregar mais" walks the three sources.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ failWorksNextPage: false, failWorksFirstPage: false, calls: [] as string[] }));

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
  imageUrl: `https://signed.test/d${n}`,
  variantIndex: n,
  createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 100 - n)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 100 - n)).toISOString(),
});
const asset = (n: number) => ({ id: `asset-${n}`, url: `https://signed.test/a${n}`, role: `Material ${n}`, type: "image" });
const output = (n: number) => ({
  id: `output:${n}`,
  kind: "output",
  workId: `work-${n}`,
  campaignId: "camp-1",
  title: `Trabalho ${n}`,
  format: "1:1",
  previewUrl: `https://signed.test/w${n}`,
  reviewHref: `/campaigns/camp-1?creativeWork=work-${n}`,
  createdAt: "2026-09-01T00:00:00.000Z",
  deckId: null,
  position: null,
});
// The workspace-wide feed's first page: 24 Trabalhos newer than the grouped one, none of them in this Campanha.
const newerWork = (n: number) => ({
  id: `creative_work:newer-${n}`,
  originKind: "creative_work",
  originId: `newer-${n}`,
  origin: "quick_tool",
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  name: `Recente ${n}`,
  state: "reviewing",
  updatedAt: new Date(Date.UTC(2026, 9, 10, 0, n)).toISOString(),
  resumable: true,
  resumeHref: `/creative-work/newer-${n}`,
  previewHref: `https://signed.test/newer-${n}`,
  previewAlt: `Recente ${n}`,
  resultCount: 1,
  nextAction: "review",
});
const json = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

/** Which source a request belongs to, plus whether it asks for a next page. */
const sourceOf = (path: string) => {
  const url = new URL(`http://x${path}`);
  const cursor = url.searchParams.get("cursor");
  if (url.pathname === "/api/creative-work" && !url.searchParams.get("view")) return "canonical";
  if (url.searchParams.get("view") === "production") {
    return url.searchParams.get("campaignId") ? (cursor ? "works:next" : "works") : "brand";
  }
  if (url.pathname.endsWith("/assets")) return cursor ? "assets:next" : "assets";
  if (url.searchParams.get("ids")) return "ids";
  return cursor ? "derivations:next" : "derivations";
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>
  );
}

function mockApi({ workNext = false }: { workNext?: boolean } = {}) {
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    hoisted.calls.push(path);
    switch (sourceOf(path)) {
      case "canonical":
        return json(200, { works: Array.from({ length: 24 }, (_, n) => newerWork(n + 1)), nextCursor: "feed-next" });
      case "brand":
        return json(200, { production: [], nextCursor: null });
      case "works":
        if (hoisted.failWorksFirstPage) return json(500, { error: "boom", code: "internalError" });
        return json(200, { production: [output(1)], nextCursor: workNext ? "w-next" : null });
      case "works:next":
        if (hoisted.failWorksNextPage) return json(500, { error: "boom", code: "internalError" });
        return json(200, { production: [output(2)], nextCursor: null });
      case "assets":
        return json(200, { assets: [asset(1)], nextCursor: "a-next", featured: { base: null, linked: null }, total: 2 });
      case "assets:next":
        return json(200, { assets: [asset(1), asset(2)], nextCursor: null, featured: { base: null, linked: null }, total: 2 });
      case "ids":
        return json(200, { derivations: [] });
      case "derivations:next":
        return json(200, { derivations: [row(4)], nextCursor: null });
      default:
        return json(200, {
          derivations: [row(1), row(2), row(3)],
          nextCursor: "d-next",
          produceSurface: null,
          summary: summarizeCampaignDerivations([row(1), row(2), row(3), row(4)]),
        });
    }
  }) as never);
}

const grid = () => within(screen.getByTestId("campaign-pieces"));
const srcs = () => grid().getAllByRole("img").map((img) => img.getAttribute("src"));

describe("CampaignWorkspacePage: Peças of the grouped Trabalhos (#786)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.failWorksNextPage = false;
    hoisted.failWorksFirstPage = false;
    hoisted.calls = [];
  });

  it("shows a grouped Trabalho older than 24 newer Trabalhos of the workspace, without the canonical feed", async () => {
    mockApi();
    renderPage();

    const link = await screen.findByRole("link", { name: /Trabalho 1\b/ });
    expect(link).toHaveAttribute("href", "/campaigns/camp-1?creativeWork=work-1");
    expect(srcs()).toContain("https://signed.test/w1");
    expect(srcs().some((src) => src?.includes("newer-"))).toBe(false);
    expect(hoisted.calls.map(sourceOf)).not.toContain("canonical");
    // The listing is the Campanha's own: view=production scoped by brand and Campanha.
    const listing = hoisted.calls.find((path) => sourceOf(path) === "works")!;
    const params = new URL(`http://x${listing}`).searchParams;
    expect(params.get("campaignId")).toBe("camp-1");
    expect(params.get("clientProfileId")).toBe("client-1");
  });

  it("Carregar mais walks listagem, then Peças, then materiais, with no repeated tile", async () => {
    mockApi({ workNext: true });
    renderPage();
    await screen.findByRole("link", { name: /Trabalho 1\b/ });
    const cursorCalls = () => hoisted.calls.map(sourceOf).filter((source) => source.endsWith(":next"));

    fireEvent.click(await screen.findByTestId("campaign-pieces-load-more"));
    await screen.findByRole("link", { name: /Trabalho 2\b/ });
    expect(cursorCalls()).toEqual(["works:next"]);

    fireEvent.click(screen.getByTestId("campaign-pieces-load-more"));
    await waitFor(() => expect(srcs()).toContain("https://signed.test/d4"));
    expect(cursorCalls()).toEqual(["works:next", "derivations:next"]);

    fireEvent.click(screen.getByTestId("campaign-pieces-load-more"));
    await waitFor(() => expect(srcs()).toContain("https://signed.test/a2"));
    expect(cursorCalls()).toEqual(["works:next", "derivations:next", "assets:next"]);

    // w1, w2, d1-d4, a1, a2: each once.
    const all = srcs();
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(8);
    expect(screen.queryByTestId("campaign-pieces-load-more")).not.toBeInTheDocument();
    expect(hoisted.calls.map(sourceOf)).not.toContain("canonical");
  });

  it("shows the inline error when the listing's next page fails, keeping the loaded tiles", async () => {
    hoisted.failWorksNextPage = true;
    mockApi({ workNext: true });
    renderPage();
    await screen.findByRole("link", { name: /Trabalho 1\b/ });

    fireEvent.click(await screen.findByTestId("campaign-pieces-load-more"));
    await waitFor(() => expect(screen.getByText("common.error")).toBeInTheDocument());
    expect(screen.getByTestId("campaign-pieces-load-more")).toBeInTheDocument();
    expect(srcs()).toContain("https://signed.test/w1");
    expect(screen.queryByText("campaign.errors.server.title")).not.toBeInTheDocument();
  });

  it("a failed first page of the listing shows the error with a retry that loads it", async () => {
    hoisted.failWorksFirstPage = true;
    mockApi();
    renderPage();

    const retry = await screen.findByTestId("campaign-pieces-works-retry");
    expect(screen.getByText("common.errorLoadingWorks")).toBeInTheDocument();
    // No fill from the brand while the Campanha's listing is unknown.
    expect(hoisted.calls.map(sourceOf)).not.toContain("brand");

    hoisted.failWorksFirstPage = false;
    fireEvent.click(retry);
    expect(await screen.findByRole("link", { name: /Trabalho 1\b/ })).toBeInTheDocument();
    expect(screen.queryByTestId("campaign-pieces-works-retry")).not.toBeInTheDocument();
  });
});
