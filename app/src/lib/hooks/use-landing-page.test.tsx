import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useGenerateLandingPage } from "./use-landing-page";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/store", () => ({
  useAppStore: vi.fn((fn: (s: { addToast: ReturnType<typeof vi.fn> }) => unknown) =>
    fn({ addToast: vi.fn() })
  ),
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

describe("useGenerateLandingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "open").mockImplementation(() => null);
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          landingPage: { id: "lp-1", status: "completed", title: "LP", htmlKey: "key.html" },
          downloadUrl: "https://cdn.example.com/lp.html",
          expiresAt: new Date().toISOString(),
        }),
    } as unknown as Response);
  });

  it("posts to landing page endpoint", async () => {
    const { result } = renderHook(() => useGenerateLandingPage(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ derivationId: "derivation-id" });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/derivations/derivation-id/landing-page",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  it("opens returned downloadUrl on success", async () => {
    const { result } = renderHook(() => useGenerateLandingPage(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ derivationId: "derivation-id" });

    expect(window.open).toHaveBeenCalledWith("https://cdn.example.com/lp.html", "_blank");
  });

  it("shows error toast on failure", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "generationFailed" }),
    } as unknown as Response);

    const { result } = renderHook(() => useGenerateLandingPage(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ derivationId: "derivation-id" })
    ).rejects.toThrow("generationFailed");

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
