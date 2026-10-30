import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch: fetchMock }));

import { creativeProductionKey, useCreativeProduction } from "./use-creative-production";

describe("useCreativeProduction", () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it("revalidates a stale cached listing once on mount", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(creativeProductionKey("ws", "brand", "campaign"), {
      pages: [{ production: [], nextCursor: null }], pageParams: [null],
    }, { updatedAt: Date.now() - 60_000 });
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const view = renderHook(() => useCreativeProduction({
      workspaceId: "ws", clientProfileId: "brand", campaignId: "campaign", enabled: true, isProducing: false,
    }), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finish(new Response(JSON.stringify({ production: [], nextCursor: null }))));
    await waitFor(() => expect(view.result.current.isFetchedAfterMount).toBe(true));
    view.unmount();
    queryClient.clear();
  });

  it("refreshes when generation starts and finishes", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ production: [], nextCursor: null })));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const view = renderHook(({ isProducing }) => useCreativeProduction({
      workspaceId: "ws", clientProfileId: "brand", campaignId: "campaign", enabled: true, isProducing,
    }), { wrapper, initialProps: { isProducing: false } });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view.rerender({ isProducing: true });
    await waitFor(() => expect(view.result.current.isFetching).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    view.rerender({ isProducing: false });
    await waitFor(() => expect(view.result.current.isFetching).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    view.unmount();
    queryClient.clear();
  });

  it("scopes requested kinds in both the URL and cache", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ production: [], nextCursor: null })));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const view = renderHook(() => useCreativeProduction({
      workspaceId: "ws", clientProfileId: "brand", campaignId: "campaign", enabled: true, isProducing: false,
      kinds: ["output", "slide"],
    }), { wrapper });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(new URL(String(fetchMock.mock.calls[0][0]), "http://test").searchParams.get("kinds"))
      .toBe("output,slide");
    expect(queryClient.getQueryData(creativeProductionKey("ws", "brand", "campaign"))).toBeUndefined();
    view.unmount();
    queryClient.clear();
  });

  it("consulta uma nova campanha sem reaproveitar a chave anterior", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ production: [], nextCursor: null })));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const view = renderHook(({ campaignId }) => useCreativeProduction({
      workspaceId: "ws",
      clientProfileId: "brand",
      campaignId,
      enabled: true,
      isProducing: false,
    }), { wrapper, initialProps: { campaignId: "campaign-a" } });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    view.rerender({ campaignId: "campaign-b" });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      String(url).includes("campaignId=campaign-b"))).toBe(true));
    expect(creativeProductionKey("ws", "brand", "campaign-a"))
      .not.toEqual(creativeProductionKey("ws", "brand", "campaign-b"));
    expect(fetchMock.mock.calls.every(([, init]) => init.signal instanceof AbortSignal)).toBe(true);
    view.unmount();
    queryClient.clear();
  });

  it("descarta a resposta atrasada do escopo anterior", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    let finishA!: (response: Response) => void;
    fetchMock.mockImplementation((url: string) => url.includes("campaignId=A")
      ? new Promise<Response>((resolve) => { finishA = resolve; })
      : Promise.resolve(new Response(JSON.stringify({ production: [{ id: "B" }], nextCursor: null }))));
    const view = renderHook(({ campaignId }) => useCreativeProduction({
      workspaceId: "ws",
      clientProfileId: "brand",
      campaignId,
      enabled: true,
      isProducing: false,
    }), { wrapper, initialProps: { campaignId: "A" } });
    await waitFor(() => expect(finishA).toBeTypeOf("function"));
    view.rerender({ campaignId: "B" });
    await waitFor(() => expect(view.result.current.items.map((item) => item.id)).toEqual(["B"]));
    await act(async () => {
      finishA(new Response(JSON.stringify({ production: [{ id: "A" }], nextCursor: null })));
    });
    await waitFor(() => expect(view.result.current.items.map((item) => item.id)).toEqual(["B"]));
    view.unmount();
    queryClient.clear();
  });
});
