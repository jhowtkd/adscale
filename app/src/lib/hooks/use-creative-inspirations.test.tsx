import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api-client";
import { useCreativeInspirations } from "./use-creative-inspirations";

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe("useCreativeInspirations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads only the requested active-brand view", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ inspirations: [{ id: "template-1", source: "template" }] }),
    } as Response);

    const { result } = renderHook(() => useCreativeInspirations("brand 1"), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([{ id: "template-1", source: "template" }]));
    expect(apiFetch).toHaveBeenCalledWith("/api/creative-work?view=inspirations&clientProfileId=brand%201&limit=24");
  });

  it("stays disabled without an active brand", () => {
    renderHook(() => useCreativeInspirations(null), { wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("flattens catalog pages and follows nextCursor", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ inspirations: [{ id: "a", source: "template" }], nextCursor: "c2" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ inspirations: [{ id: "b", source: "curated" }], nextCursor: null }),
      } as Response);

    const { result } = renderHook(() => useCreativeInspirations("brand 1"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: "a", source: "template" }]));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data).toEqual([
      { id: "a", source: "template" },
      { id: "b", source: "curated" },
    ]));
    expect(apiFetch).toHaveBeenLastCalledWith(
      "/api/creative-work?view=inspirations&clientProfileId=brand%201&limit=24&cursor=c2",
    );
  });
});
