import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  creativeWorkRefetchInterval,
  useAutosaveCreativeWork,
  useCreateCreativeWorkDraft,
  useGenerateCopy,
  useCreativeWork,
  useCreativeWorkSourceActions,
  useLinkCreativeWorkCampaign,
  usePrepareCreativeWork,
  useReviseOutput,
  useTriggerTriplet,
} from "./use-creative-work";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/hooks/use-canonical-works", () => ({
  invalidateCanonicalWorks: vi.fn(() => Promise.resolve()),
}));

import { apiFetch } from "@/lib/api-client";
import { invalidateCanonicalWorks } from "@/lib/hooks/use-canonical-works";

const mockApiFetch = vi.mocked(apiFetch);

function wrapperWith(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("draft mutations", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["create", useCreateCreativeWorkDraft, "/api/creative-work", "POST"],
    ["autosave", useAutosaveCreativeWork, "/api/creative-work/work-1", "PATCH"],
    ["prepare", usePrepareCreativeWork, "/api/creative-work/work-1", "PATCH"],
  ] as const)("%s invalidates list and draft detail", async (_name, hook, url, method) => {
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ work: { id: "work-1" } }) } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => hook(), { wrapper: wrapperWith(queryClient) });
    const input = _name === "create"
      ? { clientProfileId: "p", draftKey: "d", request: "r", intent: "variations" as const, format: "4:5" as const, settings: { targetFormats: [] } }
      : { workItemId: "work-1", ...(_name === "autosave" ? { request: "r", intent: "variations" as const, format: "4:5" as const, settings: { targetFormats: [] } } : {}) };
    await act(() => result.current.mutateAsync(input as never));
    expect(mockApiFetch).toHaveBeenCalledWith(url, expect.objectContaining({ method }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["creative-work"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["creative-work", "work-1"] });
    expect(invalidateCanonicalWorks).toHaveBeenCalledWith(queryClient);
  });
});

describe("creativeWorkRefetchInterval", () => {
  it("keeps polling a partial work while any proposal is still processing", () => {
    expect(
      creativeWorkRefetchInterval({
        work: { status: "partial" },
        outputs: [{ status: "completed" }, { status: "processing" }],
      }),
    ).toBe(2000);
  });
});

describe("creative source client contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hydrates server-derived source name and origin for reload", async () => {
    const now = new Date().toISOString();
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({
      work: { id: "work-1", status: "draft", createdAt: now, updatedAt: now },
      outputs: [],
      sources: [{ id: "source-1", name: "aprovada.png", origin: "approved_work", status: "ready", usage: "style", createdAt: now, updatedAt: now }],
    }) } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCreativeWork("work-1"), { wrapper: wrapperWith(queryClient) });
    await waitFor(() => expect(result.current.data?.sources[0]).toEqual(expect.objectContaining({ name: "aprovada.png", origin: "approved_work" })));
  });

  it("sends source actions only through the creative-work detail PATCH", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ source: { id: "source-1" } }) } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCreativeWorkSourceActions(), { wrapper: wrapperWith(queryClient) });
    await act(() => result.current.mutateAsync({ workItemId: "work-1", action: "retrySource", sourceId: "source-1" }));
    expect(mockApiFetch).toHaveBeenCalledWith("/api/creative-work/work-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ action: "retrySource", sourceId: "source-1" }),
    }));
  });

  it("sends the strict template attach payload", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ source: { id: "source-1" } }) } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCreativeWorkSourceActions(), { wrapper: wrapperWith(queryClient) });
    await act(() => result.current.mutateAsync({ workItemId: "work-1", action: "attachSource", templateId: "template-1", usage: "both" }));
    expect(mockApiFetch).toHaveBeenCalledWith("/api/creative-work/work-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ action: "attachSource", templateId: "template-1", usage: "both" }),
    }));
  });

  it("refetches detail when a source action fails so dispatch_failed is visible", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "dispatch failed" }) } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreativeWorkSourceActions(), { wrapper: wrapperWith(queryClient) });

    await expect(act(() => result.current.mutateAsync({
      workItemId: "work-1",
      action: "attachSource",
      assetId: "asset-1",
      usage: "both",
    }))).rejects.toThrow("dispatch failed");

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["creative-work", "work-1"] });
  });
});

describe("useGenerateCopy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        copy: { headline: "h", body: "b", cta: "c" },
        work: {
          id: "work-1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    } as Response);
  });

  it("allows copy generation to outlive the generic request timeout", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useGenerateCopy(), { wrapper });

    await act(() => result.current.mutateAsync("work-1"));

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/creative-work/work-1/copy",
      expect.objectContaining({ timeoutMs: 120_000 }),
    );
  });
});

describe("useTriggerTriplet", () => {
  it("seeds queued outputs in the cache immediately so polling starts without user interaction", async () => {
    const now = new Date().toISOString();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        work: {
          id: "work-1",
          status: "generating",
          createdAt: now,
          updatedAt: now,
        },
        outputs: [
          {
            id: "output-1",
            status: "queued",
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
    } as Response);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useTriggerTriplet(), { wrapper });

    await act(() => result.current.mutateAsync("work-1"));

    expect(queryClient.getQueryData(["creative-work", "work-1"])).toEqual(
      expect.objectContaining({
        work: expect.objectContaining({ status: "generating" }),
        outputs: [expect.objectContaining({ status: "queued" })],
      })
    );
  });
});

describe("result actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the strict revision payload without leaking the path work id into the body", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ output: { id: "output-v2" } }) } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useReviseOutput(), { wrapper: wrapperWith(queryClient) });

    await act(() => result.current.mutateAsync({
      workItemId: "work-1",
      outputId: "output-v1",
      revisionKey: "00000000-0000-4000-8000-000000000101",
      instruction: "Use mais contraste",
      revisionAssetId: null,
    }));

    expect(mockApiFetch).toHaveBeenCalledWith("/api/creative-work/work-1/generate", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        action: "revision",
        outputId: "output-v1",
        revisionKey: "00000000-0000-4000-8000-000000000101",
        instruction: "Use mais contraste",
        revisionAssetId: null,
      }),
    }));
  });

  it("links and unlinks only through the existing campaign relationship", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ work: { id: "work-1" } }) } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLinkCreativeWorkCampaign(), { wrapper: wrapperWith(queryClient) });

    await act(() => result.current.mutateAsync({ workItemId: "work-1", campaignId: null }));

    expect(mockApiFetch).toHaveBeenCalledWith("/api/creative-work/work-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ action: "linkCampaign", campaignId: null }),
    }));
  });
});
