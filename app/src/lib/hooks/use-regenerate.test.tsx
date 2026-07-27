import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { useRegenerateDerivation } from "./use-regenerate";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/store", () => ({
  useAppStore: (sel: (s: { addToast: () => void }) => unknown) =>
    sel({ addToast: vi.fn() }),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider
          locale="pt-BR"
          messages={{
            toast: {
              regenerationQueued: "ok",
              regenerationFailed: "fail",
            },
          }}
        >
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
  };
}

describe("useRegenerateDerivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses Idempotency-Key after transport loss and rotates after HTTP error", async () => {
    mockApiFetch
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "generationWorkerUnavailable" }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ derivation: { id: "d2" } }),
      } as unknown as Response);

    const { result } = renderHook(() => useRegenerateDerivation("src-1"), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync({})).rejects.toThrow("network down");

    await expect(result.current.mutateAsync({})).rejects.toThrow(
      "generationWorkerUnavailable",
    );

    const key1 = (
      mockApiFetch.mock.calls[0]?.[1] as { headers: Record<string, string> }
    ).headers["Idempotency-Key"];
    const key2 = (
      mockApiFetch.mock.calls[1]?.[1] as { headers: Record<string, string> }
    ).headers["Idempotency-Key"];
    expect(key1).toBe(key2);

    await result.current.mutateAsync({});
    const key3 = (
      mockApiFetch.mock.calls[2]?.[1] as { headers: Record<string, string> }
    ).headers["Idempotency-Key"];
    expect(key3).not.toBe(key1);
  });
});
