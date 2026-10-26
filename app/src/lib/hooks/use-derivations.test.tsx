import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  derivationsPollInterval,
  hasPendingDerivationWork,
  useDerivations,
  type Derivation,
} from "./use-derivations";
import { summarizeCampaignDerivations } from "@/lib/campaign-derivation-summary";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

describe("Derivation dual-verdict types", () => {
  it("accepts olharVerdict and exportStatus on derivation payloads", () => {
    const derivation: Partial<Derivation> = {
      olharVerdict: {
        value: "quase",
        axes: { figura: 2, gestalt: 2, voz: 2, convite: 2 },
        whatWorks: ["Clear focal figure"],
        whatBlocks: ["CTA competes with headline"],
        directionNote: "Simplify lower third.",
        source: "quality_gate",
        evaluatedAt: "2026-06-19T00:00:00.000Z",
      },
      exportStatus: {
        value: "ok",
        issues: [],
        setupIssues: [],
        evaluatedAt: "2026-06-19T00:00:00.000Z",
      },
    };

    expect(derivation.olharVerdict?.value).toBe("quase");
    expect(derivation.exportStatus?.value).toBe("ok");
  });
});

describe("hasPendingDerivationWork", () => {
  it("keeps polling completed previews until quality gating finishes", () => {
    const preview = {
      id: "preview-1",
      status: "completed",
      isPreview: true,
      scoreStatus: "computed",
      qualityGatedAt: null,
    } as unknown as Derivation;

    expect(hasPendingDerivationWork([preview])).toBe(true);
    expect(
      hasPendingDerivationWork([
        { ...preview, qualityGatedAt: new Date("2026-07-14T00:00:00Z") },
      ])
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #503: paginated Peças, polling, and selection by id
// ---------------------------------------------------------------------------

const noPending = { hasPendingWork: false } as never;
const pending = { hasPendingWork: true } as never;

describe("derivationsPollInterval (D6)", () => {
  it("is off without a summary or without pending work", () => {
    expect(derivationsPollInterval(null, 0, 1_000)).toBe(false);
    expect(derivationsPollInterval(undefined, 0, 1_000)).toBe(false);
    expect(derivationsPollInterval(noPending, 0, 1_000)).toBe(false);
    expect(derivationsPollInterval(noPending, 0, 1_000_000)).toBe(false);
  });

  it("is on with pending work and backs off 3 s / 5 s / 10 s", () => {
    expect(derivationsPollInterval(pending, 0, 0)).toBe(3000);
    expect(derivationsPollInterval(pending, 0, 29_999)).toBe(3000);
    expect(derivationsPollInterval(pending, 0, 30_000)).toBe(5000);
    expect(derivationsPollInterval(pending, 0, 119_999)).toBe(5000);
    expect(derivationsPollInterval(pending, 0, 120_000)).toBe(10000);
    expect(derivationsPollInterval(pending, 0, 3_600_000)).toBe(10000);
  });
});

const CAMPAIGN = "camp-1";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PAGE = 5;

type SrvRow = Record<string, unknown> & { id: string; status: string };
function makeRow(n: number, over: Partial<SrvRow> = {}): SrvRow {
  return {
    id: uuid(n),
    campaignId: CAMPAIGN,
    workspaceId: "ws-1",
    status: "completed",
    scoreStatus: "analyzed",
    isPreview: false,
    outputKey: `out/${n}`,
    imageUrl: `https://signed.test/${n}`,
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 100 - n)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 100 - n)).toISOString(),
    ...over,
  };
}

/** A tiny in-memory stand-in for the route: pages of PAGE rows, `cursor` = id of the last row seen, `ids=`. */
function createServer(count: number) {
  const srv = {
    rows: Array.from({ length: count }, (_, i) => makeRow(i + 1)), // newest first
    produceSurface: null as unknown,
    calls: [] as string[],
  };
  mockApiFetch.mockImplementation((async (path: string, init?: { method?: string }) => {
    srv.calls.push(`${init?.method ?? "GET"} ${path.replace(`/api/campaigns/${CAMPAIGN}/derivations`, "")}`);
    const url = new URL(`http://x${path}`);
    const ids = url.searchParams.get("ids");
    if (ids) {
      const wanted = new Set(ids.split(","));
      return { ok: true, json: async () => ({ derivations: srv.rows.filter((r) => wanted.has(r.id)) }) } as Response;
    }
    const cursor = url.searchParams.get("cursor");
    const start = cursor ? srv.rows.findIndex((r) => r.id === cursor) + 1 : 0;
    const slice = srv.rows.slice(start, start + PAGE);
    const next = start + PAGE < srv.rows.length ? slice[slice.length - 1]!.id : null;
    const body: Record<string, unknown> = { derivations: slice, nextCursor: next };
    if (!cursor) {
      body.summary = summarizeCampaignDerivations(srv.rows as never);
      body.produceSurface = srv.produceSurface;
    }
    return { ok: true, json: async () => body } as Response;
  }) as never);
  return srv;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}
function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
const idsOf = (list: { id: string }[] | undefined) => (list ?? []).map((d) => d.id);
const listCalls = (srv: { calls: string[] }) => srv.calls.filter((c) => c.startsWith("GET") && !c.includes("ids="));
const idsCalls = (srv: { calls: string[] }) => srv.calls.filter((c) => c.includes("ids="));

describe("useDerivations: pages, refetch and selection by id (#503)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads page 1 with the summary over every Peça and advances with fetchNextPage", async () => {
    createServer(12);
    const { result } = renderHook(() => useDerivations(CAMPAIGN, { enablePolling: false }), { wrapper: wrapperFor(makeClient()) });
    await waitFor(() => expect(result.current.data).toHaveLength(PAGE));
    expect(result.current.summary?.total).toBe(12);
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => { await result.current.fetchNextPage(); });
    await waitFor(() => expect(result.current.data).toHaveLength(2 * PAGE));
    await act(async () => { await result.current.fetchNextPage(); });
    await waitFor(() => expect(result.current.data).toHaveLength(12));
    expect(result.current.hasNextPage).toBe(false);
    expect(idsOf(result.current.data)).toEqual(Array.from({ length: 12 }, (_, i) => uuid(i + 1)));
  });

  it("a refetch fetches the loaded pages again, in order, and shows a status change on a loaded Peça", async () => {
    const srv = createServer(12);
    const { result } = renderHook(() => useDerivations(CAMPAIGN, { enablePolling: false }), { wrapper: wrapperFor(makeClient()) });
    await waitFor(() => expect(result.current.data).toHaveLength(PAGE));
    await act(async () => { await result.current.fetchNextPage(); });
    await waitFor(() => expect(result.current.data).toHaveLength(2 * PAGE));
    srv.calls.length = 0;

    srv.rows = srv.rows.map((r) => (r.id === uuid(7) ? { ...r, status: "approved" } : r));
    await act(async () => { await result.current.refetch(); });

    expect(listCalls(srv)).toEqual(["GET ", `GET ?cursor=${encodeURIComponent(uuid(PAGE))}`]);
    await waitFor(() => expect(result.current.data?.find((d) => d.id === uuid(7))?.status).toBe("approved"));
    expect(result.current.data).toHaveLength(2 * PAGE);
    expect(result.current.summary?.approvedIds).toEqual([uuid(7)]);
  });

  it("a selectedId on an unloaded page is resolved with ?ids= and survives fetchNextPage and a refetch", async () => {
    const srv = createServer(14);
    const target = uuid(8); // page 2
    const { result } = renderHook(() => useDerivations(CAMPAIGN, { enablePolling: false, selectedIds: [target, null, undefined] }), {
      wrapper: wrapperFor(makeClient()),
    });
    await waitFor(() => expect(idsOf(result.current.resolvedDerivations)).toEqual([target]));
    expect(idsOf(result.current.data)).not.toContain(target);
    expect(idsCalls(srv)).toEqual([`GET ?ids=${target}`]);

    // Once page 2 loads, the Peça is in `data` (a loaded row wins) and nothing is duplicated.
    await act(async () => { await result.current.fetchNextPage(); });
    await waitFor(() => expect(idsOf(result.current.data)).toContain(target));
    const known = [...idsOf(result.current.data), ...idsOf(result.current.resolvedDerivations)];
    expect(known.filter((id) => id === target)).toHaveLength(1);

    // A refetch that pushes it out of the loaded pages (a newer Peça shifts the cursor window) keeps it reachable.
    srv.rows = [makeRow(2000, { createdAt: new Date(Date.UTC(2026, 9, 3)).toISOString() }), ...srv.rows.map((r) => (r.id === target ? { ...r, status: "approved" } : r))];
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => {
      const all = [...(result.current.data ?? []), ...result.current.resolvedDerivations];
      expect(all.filter((d) => d.id === target)).toHaveLength(1);
      expect(all.find((d) => d.id === target)?.status).toBe("approved");
    });
  });

  it("a selection loaded on page 1 that a refetch pushes out of the loaded pages stays reachable through ?ids=", async () => {
    const srv = createServer(14);
    const target = uuid(3); // on page 1
    const { result } = renderHook(() => useDerivations(CAMPAIGN, { enablePolling: false, selectedIds: [target] }), {
      wrapper: wrapperFor(makeClient()),
    });
    await waitFor(() => expect(idsOf(result.current.data)).toContain(target));
    // A selection is always resolved by ids= (so a refetch cannot lose it), but a loaded row wins: no duplicate.
    await waitFor(() => expect(idsCalls(srv)).toHaveLength(1));
    expect(result.current.resolvedDerivations).toEqual([]);

    // Seven newer Peças push it to page 2 of the new window; only page 1 is loaded.
    srv.rows = [...Array.from({ length: 7 }, (_, i) => makeRow(3000 + i, { createdAt: new Date(Date.UTC(2026, 9, 3, 0, 0, i)).toISOString() })), ...srv.rows];
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(idsOf(result.current.resolvedDerivations)).toEqual([target]));
    expect(idsOf(result.current.data)).not.toContain(target);
  });

  it("an activePreviewId outside the loaded pages is resolved by ids=; the approved Peça is known by id only", async () => {
    const approved = uuid(13);
    const preview = uuid(12);
    const srv = createServer(14);
    srv.rows = srv.rows.map((r) => (r.id === approved ? { ...r, status: "approved" } : r.id === preview ? { ...r, isPreview: true } : r));
    srv.produceSurface = { activePreviewId: preview, batchCreditBreakdown: null, batchCreditEstimate: 0, showPreviewGate: true, shouldAutoContinuePreview: false };
    const { result } = renderHook(() => useDerivations(CAMPAIGN, { enablePolling: false }), { wrapper: wrapperFor(makeClient()) });
    await waitFor(() => expect(idsOf(result.current.resolvedDerivations)).toEqual([preview]));
    expect(result.current.summary?.approvedIds[0]).toBe(approved);
    // Review S1: nothing renders the approved Peça yet, so it costs no ids= request.
    expect(idsCalls(srv)).toEqual([`GET ?ids=${preview}`]);
    expect(idsOf(result.current.data)).not.toContain(approved);
  });

  it("an approved Peça outside the loaded pages causes no ids= request", async () => {
    const srv = createServer(14);
    srv.rows = srv.rows.map((r) => (r.id === uuid(13) ? { ...r, status: "approved" } : r));
    const { result } = renderHook(() => useDerivations(CAMPAIGN, { enablePolling: false }), { wrapper: wrapperFor(makeClient()) });
    await waitFor(() => expect(result.current.summary?.approvedIds).toEqual([uuid(13)]));
    expect(idsCalls(srv)).toEqual([]);
    expect(result.current.resolvedDerivations).toEqual([]);
  });
});

describe("useDerivations: polling follows summary.hasPendingWork (D6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

  it("polls the loaded pages every 3 s while pending and stops when the summary says there is no pending work", async () => {
    const srv = createServer(8);
    srv.rows = srv.rows.map((r) => (r.id === uuid(7) ? { ...r, status: "processing", scoreStatus: "pending" } : r)); // pending Peça NOT on page 1
    const { result } = renderHook(() => useDerivations(CAMPAIGN), { wrapper: wrapperFor(makeClient()) });
    await tick(0);
    expect(result.current.summary?.hasPendingWork).toBe(true);
    expect(idsOf(result.current.data)).not.toContain(uuid(7)); // the polling decision does not depend on the loaded pages

    srv.calls.length = 0;
    await tick(3000);
    expect(listCalls(srv).length).toBe(1);
    await tick(3000);
    expect(listCalls(srv).length).toBe(2);

    srv.rows = srv.rows.map((r) => (r.id === uuid(7) ? { ...r, status: "completed", scoreStatus: "analyzed" } : r));
    await tick(3000); // this poll reads the new summary
    await tick(50);
    expect(result.current.summary?.hasPendingWork).toBe(false);
    srv.calls.length = 0;
    await tick(120_000);
    expect(srv.calls).toEqual([]);
  });

  it("backs off 3 s, then 5 s after 30 s, then 10 s after 120 s of pending work, and restarts when work returns", async () => {
    const srv = createServer(8);
    srv.rows = srv.rows.map((r, i) => (i === 0 ? { ...r, status: "processing", scoreStatus: "pending" } : r));
    const { result } = renderHook(() => useDerivations(CAMPAIGN, { selectedIds: [uuid(7)] }), { wrapper: wrapperFor(makeClient()) });
    await tick(0);
    expect(result.current.summary?.hasPendingWork).toBe(true);

    const start = Date.now();
    const pageTimes: number[] = [];
    const idsTimes: number[] = [];
    srv.calls.length = 0;
    for (let t = 0; t < 150_000; t += 1000) {
      const pages = listCalls(srv).length;
      const ids = idsCalls(srv).length;
      await tick(1000);
      if (listCalls(srv).length > pages) pageTimes.push(Date.now() - start);
      if (idsCalls(srv).length > ids) idsTimes.push(Date.now() - start);
    }
    const gaps = (times: number[]) => times.slice(1).map((t, i) => [times[i]!, t - times[i]!] as const);
    const pageGaps = gaps(pageTimes);
    // Before 30 s every 3 s; from 30 s every 5 s; from 120 s every 10 s.
    expect(pageGaps.filter(([at]) => at < 27_000).every(([, gap]) => gap === 3000)).toBe(true);
    expect(pageGaps.filter(([at]) => at >= 30_000 && at < 120_000).every(([, gap]) => gap === 5000)).toBe(true);
    expect(pageGaps.filter(([at]) => at >= 120_000).every(([, gap]) => gap === 10_000)).toBe(true);
    expect(pageGaps.some(([at]) => at >= 120_000)).toBe(true);
    // 10 polls at 3 s + 18 at 5 s + 3 at 10 s, instead of 50 at 3 s.
    expect(pageTimes).toHaveLength(31);
    // The selection's ids= follows the same cadence.
    expect(gaps(idsTimes).filter(([at]) => at >= 120_000).every(([, gap]) => gap === 10_000)).toBe(true);

    // The work ends: polling stops. It comes back: the backoff restarts at 3 s.
    srv.rows = srv.rows.map((r, i) => (i === 0 ? { ...r, status: "completed", scoreStatus: "analyzed" } : r));
    await tick(10_000);
    await tick(50);
    expect(result.current.summary?.hasPendingWork).toBe(false);
    srv.rows = srv.rows.map((r, i) => (i === 0 ? { ...r, status: "queued", scoreStatus: "pending" } : r));
    await act(async () => { await result.current.refetch(); });
    srv.calls.length = 0;
    await tick(9_000);
    expect(listCalls(srv).length).toBe(3);
  });

  it("does not poll without pending work, nor with enablePolling=false", async () => {
    const calm = createServer(8);
    const first = renderHook(() => useDerivations(CAMPAIGN), { wrapper: wrapperFor(makeClient()) });
    await tick(0);
    calm.calls.length = 0;
    await tick(60_000);
    expect(calm.calls).toEqual([]);
    first.unmount();

    const busy = createServer(8);
    busy.rows = busy.rows.map((r, i) => (i === 0 ? { ...r, status: "queued", scoreStatus: "pending" } : r));
    renderHook(() => useDerivations(CAMPAIGN, { enablePolling: false }), { wrapper: wrapperFor(makeClient()) });
    await tick(0);
    busy.calls.length = 0;
    await tick(60_000);
    expect(busy.calls).toEqual([]);
  });

  it("the ids= query of a selection rides the polling cycle; the preview does not", async () => {
    // Selection on page 2, pending work exists.
    const withSelection = createServer(8);
    withSelection.rows = withSelection.rows.map((r, i) => (i === 0 ? { ...r, status: "processing", scoreStatus: "pending" } : r));
    const first = renderHook(() => useDerivations(CAMPAIGN, { selectedIds: [uuid(7)] }), { wrapper: wrapperFor(makeClient()) });
    await tick(0);
    expect(idsCalls(withSelection)).toHaveLength(1);
    withSelection.calls.length = 0;
    await tick(9_000);
    expect(idsCalls(withSelection).length).toBeGreaterThanOrEqual(2);
    first.unmount();

    // Only an active preview outside the pages: fetched once, no interval.
    const withPreview = createServer(8);
    withPreview.rows = withPreview.rows.map((r, i) =>
      i === 0 ? { ...r, status: "processing", scoreStatus: "pending" } : r.id === uuid(7) ? { ...r, isPreview: true } : r
    );
    withPreview.produceSurface = { activePreviewId: uuid(7), batchCreditBreakdown: null, batchCreditEstimate: 0, showPreviewGate: false, shouldAutoContinuePreview: false };
    renderHook(() => useDerivations(CAMPAIGN), { wrapper: wrapperFor(makeClient()) });
    await tick(0);
    expect(idsCalls(withPreview)).toHaveLength(1);
    withPreview.calls.length = 0;
    await tick(9_000);
    expect(listCalls(withPreview).length).toBeGreaterThanOrEqual(2); // the pages keep polling
    // The ids= key does not change while polling, so a refetch of the pages alone does not refetch it.
    expect(idsCalls(withPreview)).toEqual([]);
  });
});
