import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useProgression } from "./use-progression";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useProgression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches workspace progression", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          level: {
            key: "aprendiz",
            label: "Aprendiz de Laboratorio",
            shortLabel: "Aprendiz",
            description: "Monte seu laboratorio.",
          },
          progressPercent: 0,
          completed: [],
          nextAction: {
            key: "campaign_created",
            label: "Primeira campanha",
            description: "Crie sua primeira campanha.",
            href: "/campaigns?new=1",
            blocked: false,
          },
          lastCalculatedAt: "2026-06-06T00:00:00.000Z",
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useProgression(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.level.key).toBe("aprendiz");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/workspace/progression", {
      timeoutMs: 30_000,
    });
  });
});
