import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api-client";
import { useCommercialOffers } from "./use-commercial-offers";

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe("useCommercialOffers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads only the requested brand offers", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ offers: [{ id: "offer-1", document: { product: "Pós", offer: "turma" } }] }),
    } as Response);

    const { result } = renderHook(() => useCommercialOffers("brand 1"), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([
      { id: "offer-1", document: { product: "Pós", offer: "turma" } },
    ]));
    expect(apiFetch).toHaveBeenCalledWith("/api/creative-work?view=offers&clientProfileId=brand%201&limit=24");
  });

  it("stays disabled without an active brand", () => {
    renderHook(() => useCommercialOffers(null), { wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
