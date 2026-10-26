/**
 * The facade over the paged Peças (#503): counts, the stage and the generating flag come from the server
 * summary, never from the loaded pages, and a failed "Carregar mais" is not a page-level error.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/store", () => {
  const state = { setCurrentPageTitle: vi.fn(), addToast: vi.fn() };
  return { useAppStore: (selector: (s: typeof state) => unknown) => selector(state) };
});

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
  useDeleteCampaign: () => idle,
}));

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

describe("useCampaignWorkspace: summary and paging (#503)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts, stage and isGenerating come from the summary", async () => {
    const srv = createServer(14);
    srv.rows[10] = { ...srv.rows[10]!, status: "queued", scoreStatus: "pending" }; // outside page 1
    const { result } = renderWorkspace();
    await waitFor(() => expect(result.current.derivationSummary?.total).toBe(14));
    expect(result.current.loadedDerivations).toHaveLength(PAGE);
    expect(result.current.isGenerating).toBe(true); // the queued Peça is not loaded
    expect(result.current.workspaceState).toBe("trabalho"); // promoted by summary.total, not by the loaded count
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
    // Review F1: a failed next page is not a page-level error.
    expect(result.current.isDerivationsError).toBe(false);
  });
});
