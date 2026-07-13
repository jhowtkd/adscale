import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { StrictMode, useEffect } from "react";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { useCampaignsPage } from "./useCampaignsPage";
import { fetchTemplate, TemplateLoadError } from "@/lib/hooks/use-templates";
import { toast } from "sonner";

const replaceMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mutateMock = vi.fn();
const materializeMutateMock = vi.fn();
const materializePendingRef = { current: false };

vi.mock("@/lib/hooks/use-campaigns", () => ({
  useCampaigns: () => ({
    campaigns: [],
    totalCount: 0,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useCreateCampaign: () => ({ mutate: mutateMock, isPending: false }),
  useUpdateCampaigns: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteCampaigns: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDuplicateCampaign: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/lib/hooks/use-templates", async () => {
  class TemplateLoadError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "TemplateLoadError";
      this.status = status;
    }
  }
  return {
    fetchTemplate: vi.fn(),
    materializeTemplate: vi.fn(),
    useMaterializeTemplate: () => ({
      mutate: materializeMutateMock,
      isPending: materializePendingRef.current,
    }),
    TemplateLoadError,
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockFetchTemplate = vi.mocked(fetchTemplate);

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

function makeTemplate(id: string) {
  return {
    id,
    workspaceId: "ws-1",
    name: "Black Friday",
    description: null,
    client: "Acme",
    product: "Course",
    objective: "Leads",
    audience: "Founders",
    platforms: ["meta_feed"],
    tone: "direct",
    offer: "20% off",
    constraints: null,
    notes: null,
    generationMode: "art_variation" as const,
    creativeLevel: "balanced",
    styleIntensity: "medium",
    ctaVariants: ["Buy now"],
    targetFormats: ["1:1"],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("useCampaignsPage search sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replaceMock.mockReset();
    mockFetchTemplate.mockReset();
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

describe("useCampaignsPage template materialization states", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mutateMock.mockReset();
    materializeMutateMock.mockReset();
    materializePendingRef.current = false;
    mockFetchTemplate.mockReset();
    vi.mocked(toast.error).mockReset();
    window.history.replaceState(null, "", "/campaigns");
  });

  it("stays in loading without opening modal until GET resolves", async () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
    let resolveFetch!: (value: ReturnType<typeof makeTemplate>) => void;
    mockFetchTemplate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const searchParams = createSearchParams({ new: "1", templateId: id });
    const { result } = renderHook(() => useCampaignsPage(searchParams));

    await waitFor(() => {
      expect(mockFetchTemplate).toHaveBeenCalledWith(id);
    });
    expect(result.current.templateLoadState).toBe("loading");
    expect(result.current.modalOpen).toBe(false);

    await act(async () => {
      resolveFetch(makeTemplate(id));
    });

    await waitFor(() => {
      expect(result.current.templateLoadState).toBe("ready");
      expect(result.current.modalOpen).toBe(true);
    });
  });

  it("maps 404 to not_found without opening modal", async () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2";
    mockFetchTemplate.mockRejectedValue(new TemplateLoadError(404, "notFound"));

    const searchParams = createSearchParams({ templateId: id });
    const { result } = renderHook(() => useCampaignsPage(searchParams));

    await waitFor(() => {
      expect(result.current.templateLoadState).toBe("not_found");
    });
    expect(result.current.modalOpen).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });

  it("maps non-404 failures to error and supports retry", async () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3";
    mockFetchTemplate
      .mockRejectedValueOnce(new TemplateLoadError(500, "boom"))
      .mockResolvedValueOnce(makeTemplate(id));

    const searchParams = createSearchParams({ templateId: id });
    const { result } = renderHook(() => useCampaignsPage(searchParams));

    await waitFor(() => {
      expect(result.current.templateLoadState).toBe("error");
    });
    expect(result.current.modalOpen).toBe(false);

    await act(async () => {
      result.current.retryTemplateLoad();
    });

    await waitFor(() => {
      expect(result.current.templateLoadState).toBe("ready");
      expect(result.current.modalOpen).toBe(true);
    });
    expect(mockFetchTemplate).toHaveBeenCalledTimes(2);
  });

  it("dismiss clears templateId from the URL", async () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4";
    mockFetchTemplate.mockResolvedValue(makeTemplate(id));
    const searchParams = createSearchParams({ new: "1", templateId: id });
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    const { result } = renderHook(() => useCampaignsPage(searchParams));

    await waitFor(() => {
      expect(result.current.templateLoadState).toBe("ready");
    });

    act(() => {
      result.current.dismissTemplateFlow();
    });

    expect(result.current.modalOpen).toBe(false);
    expect(result.current.templateLoadState).toBe("idle");
    const nextUrl = String(replaceStateSpy.mock.calls.at(-1)?.[2] ?? "");
    expect(nextUrl).not.toContain("templateId=");
    expect(nextUrl).not.toContain("new=");
    replaceStateSpy.mockRestore();
  });

  it("ignores stale responses after unmount (race)", async () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5";
    let resolveFetch!: (value: ReturnType<typeof makeTemplate>) => void;
    mockFetchTemplate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const searchParams = createSearchParams({ templateId: id });
    const { result, unmount } = renderHook(() => useCampaignsPage(searchParams));

    await waitFor(() => {
      expect(mockFetchTemplate).toHaveBeenCalled();
    });
    expect(result.current.templateLoadState).toBe("loading");
    unmount();

    await act(async () => {
      resolveFetch(makeTemplate(id));
    });

    expect(result.current.templateLoadState).toBe("loading");
  });

  it("create failure keeps template params until dismiss", async () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6";
    mockFetchTemplate.mockResolvedValue(makeTemplate(id));
    materializeMutateMock.mockImplementation((_payload, opts) => {
      opts?.onError?.(new Error("create failed"));
    });

    const searchParams = createSearchParams({ templateId: id });
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useCampaignsPage(searchParams));

    await waitFor(() => {
      expect(result.current.modalOpen).toBe(true);
    });

    const callsBeforeCreate = replaceStateSpy.mock.calls.length;
    act(() => {
      result.current.handleCreateCampaign({
        name: "X",
        client: "Y",
        clientProfileId: null,
      });
    });

    expect(materializeMutateMock).toHaveBeenCalledWith(
      { templateId: id, name: "X", client: "Y" },
      expect.any(Object)
    );
    expect(mutateMock).not.toHaveBeenCalled();
    expect(result.current.modalOpen).toBe(true);
    expect(replaceStateSpy.mock.calls.length).toBe(callsBeforeCreate);
    replaceStateSpy.mockRestore();
  });

  it("Usar template calls materialize mutation not createCampaign", async () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8";
    mockFetchTemplate.mockResolvedValue(makeTemplate(id));
    materializeMutateMock.mockImplementation((_payload, opts) => {
      opts?.onSuccess?.({
        campaign: { id: "camp-from-template", name: "From Template" },
        canonical: { id: "campaign:camp-from-template" },
      });
    });

    const searchParams = createSearchParams({ templateId: id });
    const { result } = renderHook(() => useCampaignsPage(searchParams));

    await waitFor(() => {
      expect(result.current.modalOpen).toBe(true);
    });

    act(() => {
      result.current.handleCreateCampaign({
        name: "From Template",
        client: "Acme",
        clientProfileId: null,
      });
    });

    expect(materializeMutateMock).toHaveBeenCalledWith(
      { templateId: id, name: "From Template", client: "Acme" },
      expect.any(Object)
    );
    expect(mutateMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/campaigns/camp-from-template");
  });

  it("allows only one materialize when handleCreateCampaign is called twice synchronously", async () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9";
    mockFetchTemplate.mockResolvedValue(makeTemplate(id));
    materializePendingRef.current = false;
    materializeMutateMock.mockImplementation(() => {
      // Do not invoke onSuccess — keep in-flight until second click is evaluated.
    });

    const searchParams = createSearchParams({ templateId: id });
    const { result } = renderHook(() => useCampaignsPage(searchParams));

    await waitFor(() => {
      expect(result.current.modalOpen).toBe(true);
    });

    expect(result.current.createPending).toBe(false);

    act(() => {
      result.current.handleCreateCampaign({
        name: "Dup",
        client: "Acme",
        clientProfileId: null,
      });
      result.current.handleCreateCampaign({
        name: "Dup",
        client: "Acme",
        clientProfileId: null,
      });
    });

    expect(materializeMutateMock).toHaveBeenCalledTimes(1);
    expect(materializeMutateMock).toHaveBeenCalledWith(
      { templateId: id, name: "Dup", client: "Acme" },
      expect.any(Object)
    );
  });

  it("refetches the same templateId after Strict Mode remount", async () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7";
    const resolvers: Array<(value: ReturnType<typeof makeTemplate>) => void> =
      [];
    mockFetchTemplate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );

    const searchParams = createSearchParams({ templateId: id });
    const latest = {
      current: null as ReturnType<typeof useCampaignsPage> | null,
    };

    // renderHook does not remount effects under StrictMode in this setup;
    // RTL render + createRoot does (mount → cleanup → remount).
    function Probe() {
      const page = useCampaignsPage(searchParams);
      useEffect(() => {
        latest.current = page;
      });
      return (
        <div
          data-testid="template-load-state"
          data-state={page.templateLoadState}
          data-modal={page.modalOpen ? "1" : "0"}
        />
      );
    }

    const { getByTestId } = render(
      <StrictMode>
        <Probe />
      </StrictMode>
    );

    await waitFor(() => {
      expect(mockFetchTemplate.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(getByTestId("template-load-state")).toHaveAttribute(
      "data-state",
      "loading"
    );

    await act(async () => {
      resolvers.at(-1)?.(makeTemplate(id));
    });

    await waitFor(() => {
      expect(getByTestId("template-load-state")).toHaveAttribute(
        "data-state",
        "ready"
      );
      expect(getByTestId("template-load-state")).toHaveAttribute(
        "data-modal",
        "1"
      );
    });
    expect(latest.current?.templateLoadState).toBe("ready");
  });
});
