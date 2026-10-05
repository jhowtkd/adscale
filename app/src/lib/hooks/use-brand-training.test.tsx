import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-client";
import {
  brandTrainingAssetsKey,
  useBrandTrainingAssets,
  type BrandTrainingAssetRecord,
} from "./use-brand-training";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

const PROFILE_ID = "profile-1";

function asset(reviewStatus: BrandTrainingAssetRecord["reviewStatus"]): BrandTrainingAssetRecord {
  return {
    id: "reference-1",
    clientProfileId: PROFILE_ID,
    assetKey: "workspaces/workspace-1/reference.png",
    label: "Logo",
    reviewStatus,
    reviewedAt: null,
    reviewedByUserId: null,
    createdAt: "2026-10-05T12:00:00.000Z",
    asset: { id: "asset-1", key: "workspaces/workspace-1/reference.png", type: "image/png" },
    url: "https://assets.example.com/reference.png",
  };
}

describe("useBrandTrainingAssets review status invalidation", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["analysis_failed", 1],
    ["pending_approval", 1],
    ["approved", 0],
    ["archived", 0],
  ] as const)("pending_analysis becoming %s invalidates training-status %s time(s)", async (reviewStatus, count) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
    });
    const assetsKey = brandTrainingAssetsKey(PROFILE_ID);
    const statusKey = ["brand-training-status", PROFILE_ID];
    queryClient.setQueryData(assetsKey, [asset("pending_analysis")]);
    queryClient.setQueryData(statusKey, { needsReview: false });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result, rerender, unmount } = renderHook(() => useBrandTrainingAssets(PROFILE_ID), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    expect(invalidateQueries).not.toHaveBeenCalled();

    await act(async () => {
      queryClient.setQueryData(assetsKey, [asset(reviewStatus)]);
    });
    await waitFor(() => expect(result.current.data?.[0]?.reviewStatus).toBe(reviewStatus));

    expect(invalidateQueries).toHaveBeenCalledTimes(count);
    if (count) expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: statusKey });
    expect(queryClient.getQueryState(statusKey)?.isInvalidated).toBe(count === 1);
    // A render with the same list must not invalidate a second time.
    rerender();
    expect(invalidateQueries).toHaveBeenCalledTimes(count);
    expect(apiFetch).not.toHaveBeenCalled();
    unmount();
    queryClient.clear();
  });
});
