import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-client";
import {
  CANONICAL_WORKS_QUERY_KEY,
  canonicalWorksRefetchInterval,
  invalidateCanonicalWorks,
  useCanonicalWorks,
} from "./use-canonical-works";
import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

const mockApiFetch = vi.mocked(apiFetch);

const work = (state: CanonicalWorkSummary["state"]) => ({ state } as CanonicalWorkSummary);

describe("canonical works polling", () => {
  it("polls while a work can change asynchronously and stops when the feed is settled", () => {
    expect(canonicalWorksRefetchInterval(undefined)).toBe(false);
    expect(canonicalWorksRefetchInterval([work("generating")])).toBe(5_000);
    expect(canonicalWorksRefetchInterval([work("reviewing")])).toBe(false);
    expect(canonicalWorksRefetchInterval([work("approved"), work("failed")])).toBe(false);
  });

  it("refreshes a changing work through the same canonical query", async () => {
    const responses = ["generating", "reviewing"].map(
      (state) => new Response(JSON.stringify({ works: [work(state as CanonicalWorkSummary["state"])] }), { status: 200 }),
    );
    mockApiFetch.mockImplementation(async () => responses.shift()!);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    const { result } = renderHook(() => useCanonicalWorks(), { wrapper });
    await waitFor(() => expect(result.current.data?.[0]?.state).toBe("generating"));

    await act(async () => {
      await client.refetchQueries({ queryKey: ["canonical-works"] });
    });

    await waitFor(() => expect(result.current.data?.[0]?.state).toBe("reviewing"));
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it("requests a bounded page and appends the next page via cursor", async () => {
    const responses = [
      new Response(JSON.stringify({ works: [work("approved")], nextCursor: "c1" }), { status: 200 }),
      new Response(JSON.stringify({ works: [work("failed")], nextCursor: null }), { status: 200 }),
    ];
    mockApiFetch.mockImplementation(async () => responses.shift()!);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    const { result } = renderHook(() => useCanonicalWorks(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(mockApiFetch).toHaveBeenCalledWith("/api/creative-work?limit=24");
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(mockApiFetch).toHaveBeenCalledWith("/api/creative-work?limit=24&cursor=c1");
    expect(result.current.hasNextPage).toBe(false);
  });
});

describe("canonical works by brand (spec 2026-10-07 §3)", () => {
  const named = (name: string) => ({ name, state: "approved" } as CanonicalWorkSummary);
  const clientWith = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapperFor = (client: QueryClient) => {
    function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client }, children);
    }
    return Wrapper;
  };
  /** The feed answers per brand, as the route does: each brand has its own works. */
  const answerPerBrand = (nextCursorFor: Record<string, string | null> = {}) =>
    mockApiFetch.mockImplementation(async (url) => {
      const brand = /clientProfileId=([^&]+)/.exec(String(url))?.[1] ?? "all";
      return new Response(JSON.stringify({ works: [named(`obras de ${brand}`)], nextCursor: nextCursorFor[brand] ?? null }), { status: 200 });
    });

  it("asks for the brand's works, and keeps the brand on the next page request", async () => {
    mockApiFetch.mockReset();
    answerPerBrand({ "brand-1": "c1" });
    const { result } = renderHook(() => useCanonicalWorks({ clientProfileId: "brand-1" }), { wrapper: wrapperFor(clientWith()) });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(mockApiFetch).toHaveBeenCalledWith("/api/creative-work?limit=24&clientProfileId=brand-1");

    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(mockApiFetch).toHaveBeenCalledWith("/api/creative-work?limit=24&cursor=c1&clientProfileId=brand-1");
  });

  it("asks for no brand when none is given or the brand is null", async () => {
    mockApiFetch.mockReset();
    answerPerBrand();
    const { result } = renderHook(() => useCanonicalWorks({ clientProfileId: null }), { wrapper: wrapperFor(clientWith()) });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith("/api/creative-work?limit=24");
  });

  it("keeps one cache entry per brand: switching brand fetches again and never shows the other brand's works", async () => {
    mockApiFetch.mockReset();
    answerPerBrand();
    const client = clientWith();
    const { result, rerender } = renderHook(
      ({ brand }: { brand: string | null }) => useCanonicalWorks({ clientProfileId: brand }),
      { wrapper: wrapperFor(client), initialProps: { brand: "brand-1" as string | null } },
    );
    await waitFor(() => expect(result.current.data?.[0]?.name).toBe("obras de brand-1"));

    rerender({ brand: "brand-2" });
    // The other brand's works are not served while the new brand loads.
    expect(result.current.data?.some((w) => w.name === "obras de brand-1") ?? false).toBe(false);
    await waitFor(() => expect(result.current.data?.[0]?.name).toBe("obras de brand-2"));
    expect(mockApiFetch).toHaveBeenCalledWith("/api/creative-work?limit=24&clientProfileId=brand-2");

    // Back to the first brand: its own entry, not the second brand's.
    rerender({ brand: "brand-1" });
    expect(result.current.data?.[0]?.name).toBe("obras de brand-1");

    const keys = client.getQueryCache().findAll({ queryKey: CANONICAL_WORKS_QUERY_KEY }).map((q) => q.queryKey);
    expect(keys).toEqual(expect.arrayContaining([[...CANONICAL_WORKS_QUERY_KEY, "brand-1"], [...CANONICAL_WORKS_QUERY_KEY, "brand-2"]]));
  });

  it("keeps the workspace-wide feed apart from any brand's, and one invalidation reaches every entry", async () => {
    mockApiFetch.mockReset();
    answerPerBrand();
    const client = clientWith();
    const wrapper = wrapperFor(client);
    const all = renderHook(() => useCanonicalWorks(), { wrapper });
    const one = renderHook(() => useCanonicalWorks({ clientProfileId: "brand-1" }), { wrapper });
    await waitFor(() => expect(all.result.current.data?.[0]?.name).toBe("obras de all"));
    await waitFor(() => expect(one.result.current.data?.[0]?.name).toBe("obras de brand-1"));

    await act(async () => {
      await invalidateCanonicalWorks(client);
    });

    // Both observers are active, so both entries were refetched by the prefix invalidation (2 + 2 requests).
    expect(mockApiFetch).toHaveBeenCalledTimes(4);
    expect(mockApiFetch.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      "/api/creative-work?limit=24",
      "/api/creative-work?limit=24&clientProfileId=brand-1",
    ]));
  });
});
