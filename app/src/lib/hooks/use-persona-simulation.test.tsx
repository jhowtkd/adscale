import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  usePersonaSimulation,
  useCreatePersonaSimulation,
} from "./use-persona-simulation";

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

function createWrapper(queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const mockResults = {
  skeptical_buyer: {
    understands: "The product saves time",
    rejects: "Vague claims without proof",
    wants: "A free trial",
    wouldClick: false,
    rationale: "Needs more social proof",
  },
  warm_lead: {
    understands: "The discount is 50%",
    rejects: "Hidden fees",
    wants: "To buy now",
    wouldClick: true,
    rationale: "Offer is compelling",
  },
  financial_decision_maker: {
    understands: "ROI in 3 months",
    rejects: "No pricing info",
    wants: "A demo call",
    wouldClick: true,
    rationale: "Clear value proposition",
  },
  beginner: {
    understands: "It's easy to use",
    rejects: "Technical jargon",
    wants: "A tutorial",
    wouldClick: false,
    rationale: "Needs simpler messaging",
  },
};

describe("usePersonaSimulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches from GET endpoint when enabled", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          simulation: { id: "sim-1", sourceType: "derivation", sourceId: "creative-1", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
          results: mockResults,
          stale: false,
        }),
    } as unknown as Response);

    const { result } = renderHook(
      () => usePersonaSimulation("derivation", "creative-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/creatives/creative-1/persona-simulation?sourceType=derivation"
    );
    expect(result.current.data?.results).toEqual(mockResults);
  });

  it("does not fetch when sourceId is null", () => {
    renderHook(() => usePersonaSimulation("derivation", null), {
      wrapper: createWrapper(),
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "derivationNotFound" }),
    } as unknown as Response);

    const { result } = renderHook(
      () => usePersonaSimulation("derivation", "creative-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect((result.current.error as Error)?.message).toBe("derivationNotFound");
  });
});

describe("useCreatePersonaSimulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/creatives/:id/persona-simulation", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          simulation: { id: "sim-1", sourceType: "derivation", sourceId: "creative-1", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
          results: mockResults,
          cached: false,
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useCreatePersonaSimulation(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      sourceType: "derivation",
      sourceId: "creative-1",
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/creatives/creative-1/persona-simulation",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "derivation" }),
      }
    );
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "generationFailed" }),
    } as unknown as Response);

    const { result } = renderHook(() => useCreatePersonaSimulation(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({
        sourceType: "derivation",
        sourceId: "creative-1",
      })
    ).rejects.toThrow("generationFailed");

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it("invalidates persona-simulation query on success", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          simulation: { id: "sim-1", sourceType: "derivation", sourceId: "creative-1", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
          results: mockResults,
          cached: false,
        }),
    } as unknown as Response);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreatePersonaSimulation(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      sourceType: "derivation",
      sourceId: "creative-1",
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["persona-simulation", "derivation", "creative-1"],
    });
  });
});
