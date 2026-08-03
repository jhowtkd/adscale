import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useClientProfiles,
  useCreateClientProfile,
  useClientProfileMemory,
  useClientReferences,
  useSaveDerivationAsReference,
} from "./use-client-profiles";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

function createWrapper(
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useClientProfiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/client-profiles", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          profiles: [{ id: "p1", name: "Acme", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useClientProfiles(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });

    expect(mockApiFetch).toHaveBeenCalledWith("/api/client-profiles");
  });
});

describe("useCreateClientProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          profile: { id: "p1", name: "Acme", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        }),
    } as unknown as Response);
  });

  it("posts profile input and invalidates client-profiles", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateClientProfile(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ name: "Acme" });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/client-profiles",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Acme" }),
      })
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["client-profiles"],
    });
  });
});

describe("useClientReferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches references only when a profile exists", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          references: [{ id: "r1", label: "Hero", createdAt: new Date().toISOString() }],
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useClientReferences("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/client-profiles/p1/references"
    );
  });

  it("does not fetch when profile id is null", () => {
    const { result } = renderHook(() => useClientReferences(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe("useClientProfileMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches learned memory for a selected profile", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          enabled: true,
          items: [{ text: "Acme favors direct CTAs.", source: "fact" }],
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useClientProfileMemory("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data?.items).toHaveLength(1);
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/client-profiles/p1/memory"
    );
  });

  it("does not fetch memory when profile id is null", () => {
    const { result } = renderHook(() => useClientProfileMemory(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe("useSaveDerivationAsReference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          reference: { id: "r1", label: "Hero", createdAt: new Date().toISOString() },
        }),
    } as unknown as Response);
  });

  it("posts to save-reference endpoint and invalidates references", async () => {
    const { result } = renderHook(() => useSaveDerivationAsReference(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      derivationId: "d1",
      clientProfileId: "p1",
      label: "Winner",
      kind: "style",
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/derivations/d1/save-reference",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          clientProfileId: "p1",
          label: "Winner",
          kind: "style",
        }),
      })
    );
  });
});
