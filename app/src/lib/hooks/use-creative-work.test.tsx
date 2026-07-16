import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  creativeWorkRefetchInterval,
  useAutosaveCreativeWork,
  useCreateCreativeWorkDraft,
  useGenerateCopy,
  usePrepareCreativeWork,
  useTriggerTriplet,
} from "./use-creative-work";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/hooks/use-canonical-works", () => ({
  invalidateCanonicalWorks: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

function wrapperWith(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
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
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["creative-work", "work-1"] });
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
