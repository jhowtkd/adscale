import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";
import { useBulkCampaigns, useCampaign, useCampaigns, useDeleteCampaign, type Campaign } from "./use-campaigns";

const mockApiFetch = vi.mocked(apiFetch);

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useDeleteCampaign", () => {
  it("awaits campaign and dashboard invalidations before settling", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    let resolveDelete: (() => void) | undefined;
    const deleteGate = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });

    mockApiFetch.mockImplementation(async () => {
      await deleteGate;
      return new Response(null, { status: 204 });
    });

    const { result } = renderHook(() => useDeleteCampaign(), {
      wrapper: createWrapper(queryClient),
    });

    let mutationSettled = false;
    result.current.mutate("camp-1", {
      onSettled: () => {
        mutationSettled = true;
      },
    });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });

    expect(mutationSettled).toBe(false);
    expect(invalidateSpy).not.toHaveBeenCalled();

    resolveDelete?.();

    await waitFor(() => {
      expect(mutationSettled).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["campaigns"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["canonical-works"] });
  });
});

describe("campaign list work", () => {
  it("keeps the mapped campaign list stable across unrelated rerenders", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["campaigns", {}], {
      campaigns: [{ id: "camp-1", createdAt: new Date(), updatedAt: new Date() } as Campaign],
      totalCount: 1,
    });
    const { result, rerender } = renderHook(() => useCampaigns(), {
      wrapper: createWrapper(queryClient),
    });
    const first = result.current.campaigns;

    rerender();

    expect(result.current.campaigns).toBe(first);
  });

  it("keeps the detail campaign stable for derivation mapping", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["campaigns", "camp-1"], {
      id: "camp-1", createdAt: new Date(), updatedAt: new Date(),
    } as Campaign);
    const { result, rerender } = renderHook(() => useCampaign("camp-1"), {
      wrapper: createWrapper(queryClient),
    });
    const first = result.current.campaign;

    rerender();

    expect(result.current.campaign).toBe(first);
  });

  it("limits bulk requests, preserves failures and invalidates projections once", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let active = 0;
    let peak = 0;
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (input) => {
      active++;
      peak = Math.max(peak, active);
      await gate;
      active--;
      if (String(input).endsWith("/bad")) {
        return Response.json({ error: "failed" }, { status: 500 });
      }
      return new Response(null, { status: 204 });
    });

    const { result } = renderHook(() => useBulkCampaigns(), {
      wrapper: createWrapper(queryClient),
    });
    const pending = result.current.mutateAsync({
      ids: ["a", "b", "bad", "d", "e"],
      action: "delete",
    });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));
    expect(peak).toBe(3);
    expect(invalidateSpy).not.toHaveBeenCalled();

    release?.();
    expect(await pending).toEqual({
      succeededIds: ["a", "b", "d", "e"],
      failedIds: ["bad"],
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(5);
    expect(peak).toBe(3);
    expect(invalidateSpy).toHaveBeenCalledTimes(3);
  });
});
