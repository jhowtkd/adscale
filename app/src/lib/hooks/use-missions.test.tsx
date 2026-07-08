import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMissions } from "./use-missions";

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

describe("useMissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches workspace missions", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          missions: [{ key: "setup", status: "active", href: "/campaigns?new=1" }],
          activeMissionKey: "setup",
          completedCount: 0,
          totalCount: 11,
          progressPercent: 0,
          lastCalculatedAt: "2026-06-06T00:00:00.000Z",
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useMissions(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.activeMissionKey).toBe("setup");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/workspace/missions", {
      timeoutMs: 30_000,
    });
  });
});
