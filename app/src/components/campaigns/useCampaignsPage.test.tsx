import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCampaignsPage } from "./useCampaignsPage";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/hooks/use-campaigns", () => ({
  useCampaigns: () => ({
    campaigns: [],
    totalCount: 0,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useCreateCampaign: () => ({ mutate: vi.fn() }),
  useUpdateCampaigns: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteCampaigns: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDuplicateCampaign: () => ({ mutate: vi.fn() }),
}));

function createSearchParams(initialQuery = "") {
  let query = initialQuery;
  return {
    get: (name: string) => (name === "q" ? query || null : null),
    toString: () => (query ? `q=${encodeURIComponent(query)}` : ""),
    setQuery: (next: string) => {
      query = next;
    },
  };
}

describe("useCampaignsPage search sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replaceMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("preserves newer pending search text when URL catches up to an older applied value", () => {
    const searchParams = createSearchParams();

    const { result, rerender } = renderHook(() => useCampaignsPage(searchParams));

    act(() => {
      result.current.handleSearchChange("abc");
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    act(() => {
      result.current.handleSearchChange("abcd");
    });

    expect(result.current.searchInput).toBe("abcd");

    act(() => {
      searchParams.setQuery("abc");
      rerender();
      rerender();
    });

    expect(result.current.searchInput).toBe("abcd");
  });

  it("clears pending search on external URL navigation", () => {
    const searchParams = createSearchParams("foo");

    const { result, rerender } = renderHook(() => useCampaignsPage(searchParams));

    act(() => {
      result.current.handleSearchChange("bar");
    });

    act(() => {
      searchParams.setQuery("legacy");
      rerender();
    });

    expect(result.current.searchInput).toBe("legacy");
  });
});
