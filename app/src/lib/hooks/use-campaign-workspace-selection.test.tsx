/**
 * Selection by id through the facade (#503, D7). Nothing in the UI calls handlePreview today (#790), so the
 * flow is exercised at hook level: the selected / approved / preview Peça must resolve by `ids=` when it is not
 * on a loaded page and stay stable across "Carregar mais", a refetch and polling.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/campaigns/camp-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/store", () => {
  const state = { setCurrentPageTitle: vi.fn(), addToast: vi.fn() };
  return { useAppStore: (selector: (s: typeof state) => unknown) => selector(state) };
});
vi.mock("@/components/mission-insights/MissionInsightProvider", () => ({ useMissionInsightOptional: () => null }));
vi.mock("@/lib/hooks/use-canonical-works", () => ({
  invalidateCanonicalWorks: vi.fn(),
  invalidateWorkListProjections: vi.fn(),
}));

const stableCampaign = vi.hoisted(() => ({
  id: "camp-1",
  workspaceId: "ws-1",
  name: "Campanha",
  generationMode: "art_variation",
  creativeLevel: "balanced",
  ctaVariants: ["A"],
  targetFormats: ["1:1"],
  status: "ready",
}));
const idle = vi.hoisted(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false }));
vi.mock("@/lib/hooks/use-campaigns", () => ({
  useCampaign: () => ({ campaign: stableCampaign, isLoading: false, isError: false, loadErrorKind: null, refetch: vi.fn() }),
  useUpdateCampaign: () => idle,
  useDeleteCampaign: () => idle,
}));
vi.mock("@/lib/hooks/use-regenerate", () => ({ useRegenerateDerivation: () => idle }));
vi.mock("@/lib/hooks/use-export", () => ({ useExport: () => idle }));
vi.mock("@/lib/hooks/use-review", () => ({ useReviewDerivation: () => idle }));
vi.mock("@/lib/hooks/use-delivery-package", () => ({ useCreateDeliveryPackage: () => idle }));
vi.mock("@/lib/hooks/use-creative-qa", () => ({ useCreativeQa: () => idle }));
vi.mock("./use-plan", () => ({ useGeneratePlan: () => idle, useUpdatePlanStatus: () => idle }));
vi.mock("@/lib/hooks/use-regenerate", () => ({ useRegenerateDerivation: () => idle }));

import { apiFetch } from "@/lib/api-client";
import { summarizeCampaignDerivations } from "@/lib/campaign-derivation-summary";
import { useCampaignWorkspace } from "./use-campaign-workspace";

const mockApiFetch = vi.mocked(apiFetch);
const CAMPAIGN = "camp-1";
const PAGE = 5;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type SrvRow = Record<string, unknown> & { id: string; status: string };
const makeRow = (n: number, over: Partial<SrvRow> = {}): SrvRow => ({
  id: uuid(n),
  campaignId: CAMPAIGN,
  workspaceId: "ws-1",
  status: "completed",
  scoreStatus: "analyzed",
  isPreview: false,
  outputKey: `out/${n}`,
  imageUrl: `https://signed.test/${n}`,
  variantIndex: n,
  createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 1000 - n)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 1000 - n)).toISOString(),
  ...over,
});

function createServer(count: number) {
  const srv = {
    rows: Array.from({ length: count }, (_, i) => makeRow(i + 1)),
    produceSurface: null as unknown,
    failCursor: false,
    calls: [] as string[],
  };
  mockApiFetch.mockImplementation((async (path: string) => {
    srv.calls.push(path.replace(`/api/campaigns/${CAMPAIGN}/derivations`, "") || "/");
    const url = new URL(`http://x${path}`);
    const ids = url.searchParams.get("ids");
    if (ids) {
      const wanted = new Set(ids.split(","));
      return { ok: true, json: async () => ({ derivations: srv.rows.filter((r) => wanted.has(r.id)) }) } as Response;
    }
    const cursor = url.searchParams.get("cursor");
    if (cursor && srv.failCursor) return { ok: false, status: 500, json: async () => ({ error: "boom" }) } as Response;
    const start = cursor ? srv.rows.findIndex((r) => r.id === cursor) + 1 : 0;
    const slice = srv.rows.slice(start, start + PAGE);
    const body: Record<string, unknown> = {
      derivations: slice,
      nextCursor: start + PAGE < srv.rows.length ? slice[slice.length - 1]!.id : null,
    };
    if (!cursor) {
      body.summary = summarizeCampaignDerivations(srv.rows as never);
      body.produceSurface = srv.produceSurface;
    }
    return { ok: true, json: async () => body } as Response;
  }) as never);
  return srv;
}

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return renderHook(() => useCampaignWorkspace(CAMPAIGN, false), {
    wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
const ids = (list: { id: string }[]) => list.map((d) => d.id);
const countOf = (list: { id: string }[], id: string) => list.filter((d) => d.id === id).length;

describe("useCampaignWorkspace: selection by id (#503)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handlePreview on a Peça of page 2 resolves it by ids=, outside loadedDerivations", async () => {
    const srv = createServer(14);
    const { result } = renderWorkspace();
    await waitFor(() => expect(result.current.loadedDerivations).toHaveLength(PAGE));
    const target = uuid(8);

    act(() => result.current.handlePreview(target));
    expect(result.current.reviewDerivationId).toBe(target);
    await waitFor(() => expect(ids(result.current.allDerivations)).toContain(target));
    expect(srv.calls.some((c) => c.startsWith("?ids=") && c.includes(target))).toBe(true);
    expect(ids(result.current.loadedDerivations)).not.toContain(target);
    const card = result.current.allDerivations.find((d) => d.id === target)!;
    expect(card.campaignId).toBe(CAMPAIGN);
    expect(card.status).toBe("completed");
    // The counts do not depend on what is loaded.
    expect(result.current.derivationSummary?.total).toBe(14);
  });

  it("stays stable (one copy, same Peça) after Carregar mais, a refetch and polling", async () => {
    const srv = createServer(14);
    srv.rows[0] = { ...srv.rows[0]!, status: "processing", scoreStatus: "pending" }; // pending work keeps the polling on
    const { result } = renderWorkspace();
    await waitFor(() => expect(result.current.loadedDerivations).toHaveLength(PAGE));
    const target = uuid(8);
    act(() => result.current.handlePreview(target));
    await waitFor(() => expect(ids(result.current.allDerivations)).toContain(target));

    // Carregar mais: the Peça becomes part of the loaded pages and is not duplicated.
    await act(async () => { await result.current.loadMoreDerivations(); });
    await waitFor(() => expect(ids(result.current.loadedDerivations)).toContain(target));
    expect(countOf(result.current.allDerivations, target)).toBe(1);
    expect(result.current.reviewDerivationId).toBe(target);

    // A refetch that pushes it out of the loaded pages: still one copy and still reachable.
    // (A bare refetch() of the pages does not refresh the ids= query; the polling tick or an
    // invalidation does, covered by the polling test below.)
    srv.rows = [
      ...Array.from({ length: 9 }, (_, i) => makeRow(5000 + i, { createdAt: new Date(Date.UTC(2026, 9, 3, 0, 0, i)).toISOString() })),
      ...srv.rows.map((r) => (r.id === target ? { ...r, status: "approved" } : r)),
    ];
    await act(async () => { await result.current.refetchDerivations(); });
    await waitFor(() => expect(ids(result.current.loadedDerivations)).not.toContain(target));
    expect(countOf(result.current.allDerivations, target)).toBe(1);
    expect(result.current.reviewDerivationId).toBe(target);
  });

  it("keeps the selection through the polling cycle", async () => {
    vi.useFakeTimers();
    try {
      const srv = createServer(14);
      srv.rows[0] = { ...srv.rows[0]!, status: "processing", scoreStatus: "pending" };
      const { result } = renderWorkspace();
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      const target = uuid(9);
      act(() => result.current.handlePreview(target));
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });
      expect(ids(result.current.allDerivations)).toContain(target);

      srv.rows = srv.rows.map((r) => (r.id === target ? { ...r, status: "approved" } : r));
      await act(async () => { await vi.advanceTimersByTimeAsync(7_000); });
      expect(result.current.allDerivations.find((d) => d.id === target)?.status).toBe("approved");
      expect(countOf(result.current.allDerivations, target)).toBe(1);
      expect(result.current.reviewDerivationId).toBe(target);
    } finally {
      vi.useRealTimers();
    }
  });

  it("approvedDerivation outside the loaded pages is resolved and stays the first approved Peça", async () => {
    const srv = createServer(14);
    srv.rows = srv.rows.map((r) => (r.id === uuid(13) ? { ...r, status: "approved" } : r));
    const { result } = renderWorkspace();
    await waitFor(() => expect(result.current.approvedDerivation?.id).toBe(uuid(13)));
    expect(ids(result.current.loadedDerivations)).not.toContain(uuid(13));
    expect(result.current.derivationSummary?.approvedCount).toBe(1);

    await act(async () => { await result.current.loadMoreDerivations(); });
    await act(async () => { await result.current.refetchDerivations(); });
    await waitFor(() => expect(result.current.approvedDerivation?.id).toBe(uuid(13)));
    expect(countOf(result.current.allDerivations, uuid(13))).toBeLessThanOrEqual(1);
  });

  it("previewDerivation (produceSurface.activePreviewId) outside the loaded pages is resolved", async () => {
    const srv = createServer(14);
    srv.rows = srv.rows.map((r) => (r.id === uuid(12) ? { ...r, isPreview: true } : r));
    srv.produceSurface = {
      activePreviewId: uuid(12), showPreviewGate: true, shouldAutoContinuePreview: false,
      batchCreditBreakdown: null, batchCreditEstimate: 0,
    };
    const { result } = renderWorkspace();
    await waitFor(() => expect(result.current.previewDerivation?.id).toBe(uuid(12)));
    expect(result.current.hasActivePreview).toBe(true);
    expect(result.current.showPreviewGate).toBe(true);
    expect(ids(result.current.loadedDerivations)).not.toContain(uuid(12));
  });

  it("the delivery source stays resolved after a refetch pushes it out of the loaded pages", async () => {
    const srv = createServer(14);
    const { result } = renderWorkspace();
    await waitFor(() => expect(result.current.loadedDerivations).toHaveLength(PAGE));
    act(() => result.current.handleCreateDeliveryPackage(uuid(2)));
    expect(result.current.deliveryModalOpen).toBe(true);
    await waitFor(() => expect(result.current.selectedDeliverySource?.id).toBe(uuid(2)));

    srv.rows = [
      ...Array.from({ length: 9 }, (_, i) => makeRow(6000 + i, { createdAt: new Date(Date.UTC(2026, 9, 3, 0, 0, i)).toISOString() })),
      ...srv.rows,
    ];
    await act(async () => { await result.current.refetchDerivations(); });
    await waitFor(() => expect(ids(result.current.loadedDerivations)).not.toContain(uuid(2)));
    expect(result.current.selectedDeliverySource?.id).toBe(uuid(2));
  });

  it("closing the review clears the selection; counts, stage and isGenerating come from the summary", async () => {
    const srv = createServer(14);
    srv.rows[10] = { ...srv.rows[10]!, status: "queued", scoreStatus: "pending" }; // outside page 1
    const { result } = renderWorkspace();
    await waitFor(() => expect(result.current.derivationSummary?.total).toBe(14));
    expect(result.current.isGenerating).toBe(true); // the queued Peça is not loaded
    expect(result.current.workspaceState).toBe("trabalho"); // promoted by summary.total, not by the loaded count
    act(() => result.current.handlePreview(uuid(8)));
    act(() => result.current.handleCloseReview());
    expect(result.current.reviewDerivationId).toBeNull();
  });

  it("flags a failed Carregar mais without losing the loaded pages", async () => {
    const srv = createServer(14);
    const { result } = renderWorkspace();
    await waitFor(() => expect(result.current.loadedDerivations).toHaveLength(PAGE));
    expect(result.current.hasMoreDerivations).toBe(true);
    srv.failCursor = true;
    await act(async () => { await result.current.loadMoreDerivations(); });
    await waitFor(() => expect(result.current.loadMoreDerivationsFailed).toBe(true));
    expect(result.current.loadedDerivations).toHaveLength(PAGE);
    // Review F1: a failed next page is not a page-level error, and selection keeps resolving by ids=.
    expect(result.current.isDerivationsError).toBe(false);
    act(() => result.current.handlePreview(uuid(11)));
    await waitFor(() => expect(ids(result.current.allDerivations)).toContain(uuid(11)));
  });
});

afterEach(() => {
  vi.useRealTimers();
});
