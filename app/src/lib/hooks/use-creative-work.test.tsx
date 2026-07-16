import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { creativeWorkRefetchInterval, useGenerateCopy } from "./use-creative-work";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/hooks/use-canonical-works", () => ({
  invalidateCanonicalWorks: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

describe("creativeWorkRefetchInterval", () => {
  it("keeps polling a partial work while any proposal is still processing", () => {
    expect(
      creativeWorkRefetchInterval({
        work: { status: "partial" },
        outputs: [{ status: "completed" }, { status: "processing" }],
      }),
    ).toBe(2000);
  });
});

describe("useGenerateCopy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        copy: { headline: "h", body: "b", cta: "c" },
        work: {
          id: "work-1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    } as Response);
  });

  it("allows copy generation to outlive the generic request timeout", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useGenerateCopy(), { wrapper });

    await act(() => result.current.mutateAsync("work-1"));

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/creative-work/work-1/copy",
      expect.objectContaining({ timeoutMs: 120_000 }),
    );
  });
});
