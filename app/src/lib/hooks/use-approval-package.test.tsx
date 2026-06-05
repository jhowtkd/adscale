import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useApprovalPackage,
  useSaveApprovalPackage,
} from "./use-approval-package";

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

describe("useApprovalPackage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          campaignId: "campaign-1",
          availableRoots: [{ id: "root-1" }],
          selectedRootIds: ["root-1"],
          package: { derivationIds: ["root-1"], items: [], notes: "", isStale: false, staleReasons: [] },
          shareUrl: null,
          expiresAt: null,
        }),
    } as unknown as Response);
  });

  it("loads approval package snapshot", async () => {
    const { result } = renderHook(
      () => useApprovalPackage("campaign-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/campaigns/campaign-1/approval-package"
    );
    expect(result.current.data?.availableRoots).toHaveLength(1);
  });
});

describe("useSaveApprovalPackage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          shareUrl: "https://app.example.com/share/token",
        }),
    } as unknown as Response);
  });

  it("posts selected derivations and notes", async () => {
    const { result } = renderHook(
      () => useSaveApprovalPackage("campaign-1"),
      { wrapper: createWrapper() }
    );

    await result.current.mutateAsync({
      derivationIds: ["root-1"],
      notes: "Client notes",
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/campaigns/campaign-1/approval-package",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          derivationIds: ["root-1"],
          notes: "Client notes",
        }),
      }
    );
  });
});
