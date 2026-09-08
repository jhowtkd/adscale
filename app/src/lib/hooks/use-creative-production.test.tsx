import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch: fetchMock }));

import { creativeProductionKey, useCreativeProduction } from "./use-creative-production";

describe("useCreativeProduction", () => {
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
