import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useWorkspaceSettings,
  useUpdateWorkspaceSettings,
} from "./use-workspace-settings";

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

const workspaceSettingsPayload = {
  name: "Acme Labs",
  slug: "acme-labs",
  description: "",
  industry: "",
  website: "",
  timezone: "America/New_York",
};

describe("useWorkspaceSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches workspace settings from GET /api/workspace/settings", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          name: "Acme Labs",
          slug: "acme-labs",
          description: null,
          industry: null,
          website: null,
          timezone: null,
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useWorkspaceSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiFetch).toHaveBeenCalledWith("/api/workspace/settings");
    expect(result.current.data).toEqual({
      name: "Acme Labs",
      slug: "acme-labs",
      description: "",
      industry: "",
      website: "",
      timezone: "",
    });
  });

  it("exposes canEdit when API returns it", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...workspaceSettingsPayload,
          canEdit: false,
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useWorkspaceSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.canEdit).toBe(false);
  });
});

describe("useUpdateWorkspaceSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PATCHes partial settings and invalidates workspace-settings query", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...workspaceSettingsPayload,
          name: "Renamed Labs",
        }),
    } as unknown as Response);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useUpdateWorkspaceSettings(), {
      wrapper: Wrapper,
    });

    await result.current.mutateAsync({ name: "Renamed Labs" });

    expect(mockApiFetch).toHaveBeenCalledWith("/api/workspace/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Labs" }),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["workspace-settings"],
    });
  });

  it("surfaces forbidden error on 403", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: "Access denied" }),
    } as unknown as Response);

    const { result } = renderHook(() => useUpdateWorkspaceSettings(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ name: "Blocked" })
    ).rejects.toThrow("Access denied");
  });

  it("surfaces slug conflict error on 409", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: "Slug already taken" }),
    } as unknown as Response);

    const { result } = renderHook(() => useUpdateWorkspaceSettings(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ slug: "taken-slug" })
    ).rejects.toThrow("Slug already taken");
  });
});
