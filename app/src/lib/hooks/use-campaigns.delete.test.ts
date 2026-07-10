import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";
import { useDeleteCampaign } from "./use-campaigns";

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
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["workspace", "campaign-count"] });
  });
});
