import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCampaignsPage } from "./useCampaignsPage";

const replaceMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
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
  useUpdateCampaigns: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteCampaigns: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDuplicateCampaign: () => ({ mutate: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function createSearchParams(initial: Record<string, string> = {}) {
  const params = { ...initial };
  return {
    get: (name: string) => params[name] ?? null,
    toString: () => new URLSearchParams(params).toString(),
    setQuery: (next: string) => {
      if (next) params.q = next;
      else delete params.q;
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
    const searchParams = createSearchParams({ q: "foo" });

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

describe("useCampaignsPage legacy creation redirect", () => {
  beforeEach(() => {
    vi.useRealTimers();
    replaceMock.mockReset();
    pushMock.mockReset();
  });

  it("replaces campaigns?new=1 with the focused operational composer", async () => {
    renderHook(() => useCampaignsPage(createSearchParams({ new: "1" })));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/?compose=1");
    });
  });

  it("preserves only valid composer intents while dropping campaign filters", async () => {
    renderHook(() =>
      useCampaignsPage(
        createSearchParams({
          new: "1",
          intent: "single",
          q: "summer",
          templateId: "legacy-template",
        })
      )
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/?compose=1&intent=single");
    });
  });

  it("routes the list CTA to the same composer", () => {
    const { result } = renderHook(() => useCampaignsPage(createSearchParams()));

    act(() => result.current.startNewWork());

    expect(pushMock).toHaveBeenCalledWith("/?compose=1");
  });
});
