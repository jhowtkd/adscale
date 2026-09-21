import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-client";
import { canonicalWorksRefetchInterval, useCanonicalWorks } from "./use-canonical-works";
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
