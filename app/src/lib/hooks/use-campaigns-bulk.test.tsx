import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useBulkCampaignActions, useCampaign, useCampaigns } from "./use-campaigns";
import { apiFetch } from "@/lib/api-client";
import { invalidateWorkListProjections } from "@/lib/hooks/use-canonical-works";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/hooks/use-canonical-works", () => ({ invalidateWorkListProjections: vi.fn() }));

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("campaign hooks", () => {
  it("keeps the mapped campaign array stable across unrelated renders", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ campaigns: [{ id: "c1", name: "One", createdAt: "2026-01-01", updatedAt: "2026-01-01" }], totalCount: 1 }),
    } as Response);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(() => useCampaigns(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.campaigns).toHaveLength(1));
    const mapped = result.current.campaigns;
    rerender();
    expect(result.current.campaigns).toBe(mapped);
  });

  it("keeps the mapped campaign detail stable across unrelated renders", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ campaign: { id: "c1", name: "One", createdAt: "2026-01-01", updatedAt: "2026-01-01" } }),
    } as Response);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(() => useCampaign("c1"), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.campaign?.id).toBe("c1"));
    const mapped = result.current.campaign;
    rerender();
    expect(result.current.campaign).toBe(mapped);
  });

  it("limits a bulk delete to four concurrent requests and invalidates once after partial failure", async () => {
    vi.clearAllMocks();
    let active = 0;
    let peak = 0;
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active--;
      return { ok: !String(url).endsWith("/2"), json: async () => ({ error: "Failed" }) } as Response;
    });
    vi.mocked(invalidateWorkListProjections).mockResolvedValue([]);
    const client = new QueryClient();
    const { result } = renderHook(() => useBulkCampaignActions(), { wrapper: wrapper(client) });
    const failedIds = await act(() => result.current.mutateAsync({ ids: ["1", "2", "3", "4", "5", "6"], action: "delete" }));
    expect(failedIds).toEqual(["2"]);
    expect(peak).toBe(4);
    expect(apiFetch).toHaveBeenCalledTimes(6);
    expect(invalidateWorkListProjections).toHaveBeenCalledOnce();
  });
});
