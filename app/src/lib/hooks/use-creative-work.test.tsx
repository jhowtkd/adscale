import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  creativeWorkRefetchInterval,
  useAutosaveCreativeWork,
  useCreateCreativeWorkDraft,
  useGenerateCopy,
  useGenerateReviewedRevision,
  useCreativeWork,
  useCreativeWorkSourceActions,
  useLinkCreativeWorkCampaign,
  usePrepareCreativeWork,
  usePlanCarouselWork,
  useResolveBrandConflict,
  useReviseOutput,
  useSaveOutputReview,
  useSelectOutput,
  useTriggerTriplet,
  useSuggestCreativeDirections,
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

describe("resolveBrandConflict client contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the required work revision with the brand choice", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ work: { id: "work-1" } }) } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useResolveBrandConflict(), { wrapper: wrapperWith(queryClient) });
    await act(() => result.current.mutateAsync({
      workItemId: "work-1",
      choice: "source",
      expectedUpdatedAt: "2026-08-31T12:00:00.000Z",
    }));
    expect(mockApiFetch).toHaveBeenCalledWith("/api/creative-work/work-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({
        action: "resolveBrandConflict",
        choice: "source",
        expectedUpdatedAt: "2026-08-31T12:00:00.000Z",
      }),
    }));
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

describe("R1 refund-pending polling", () => {
  it("keeps polling while a completed output awaits compensation", () => {
    expect(
      creativeWorkRefetchInterval({
        work: { status: "partial" },
        outputs: [{ status: "completed", failureCode: "objective_quality_failed_refund_pending" }],
      }),
    ).toBe(2000);
  });

  it("stops polling once the refund-pending marker is cleared", () => {
    expect(
      creativeWorkRefetchInterval({
        work: { status: "partial" },
        outputs: [{ status: "completed", failureCode: null }],
      }),
    ).toBe(false);
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

  it("serializes temporary-reference actions without browser-owned analysis fields", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ source: { id: "source-1" }, reference: { id: "reference-1", clientProfileId: "profile-1" } }) } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCreativeWorkSourceActions(), { wrapper: wrapperWith(queryClient) });

    await act(() => result.current.mutateAsync({
      workItemId: "work-1", action: "updatePieceReference", sourceId: "source-1",
      category: "style_reference", userInstruction: "Apenas a textura",
    }));
    await act(() => result.current.mutateAsync({
      workItemId: "work-1", action: "replacePieceReference", sourceId: "source-1", assetId: "asset-2",
    }));
    await act(() => result.current.mutateAsync({
      workItemId: "work-1", action: "promotePieceReference", sourceId: "source-1",
    }));

    expect(mockApiFetch).toHaveBeenNthCalledWith(1, "/api/creative-work/work-1", expect.objectContaining({
      body: JSON.stringify({ action: "updatePieceReference", sourceId: "source-1", category: "style_reference", userInstruction: "Apenas a textura" }),
    }));
    expect(mockApiFetch).toHaveBeenNthCalledWith(2, "/api/creative-work/work-1", expect.objectContaining({
      body: JSON.stringify({ action: "replacePieceReference", sourceId: "source-1", assetId: "asset-2" }),
    }));
    expect(mockApiFetch).toHaveBeenNthCalledWith(3, "/api/creative-work/work-1", expect.objectContaining({
      body: JSON.stringify({ action: "promotePieceReference", sourceId: "source-1" }),
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

  it("shows the friendly legacy rate-limit message while retaining its error code", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "rateLimitExceeded", message: "Aguarde um momento e tente novamente." }),
    } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCreativeWorkSourceActions(), { wrapper: wrapperWith(queryClient) });

    await expect(act(() => result.current.mutateAsync({
      workItemId: "work-1",
      action: "retrySource",
      sourceId: "source-1",
    }))).rejects.toMatchObject({
      message: "Aguarde um momento e tente novamente.",
      code: "rateLimitExceeded",
      status: 429,
    });
  });
});

describe("selection client contract", () => {
  it("re-reads the output policy when selection loses a server race", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: "Revise antes de aprovar",
        code: "creativeWorkOutputConfirmationRequired",
        details: { rationale: "objective_inconclusive", nextStep: "review_then_confirm" },
      }),
    } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSelectOutput(), { wrapper: wrapperWith(queryClient) });

    await expect(act(() => result.current.mutateAsync({
      workItemId: "work-1",
      outputId: "output-1",
      saveToLibrary: false,
    }))).rejects.toMatchObject({ code: "creativeWorkOutputConfirmationRequired" });

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["creative-work", "work-1"],
    }));
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

    await act(() => result.current.mutateAsync({
      workItemId: "work-1",
      preparedRevision: "2026-07-16T12:00:00.000Z",
    }));

    expect(queryClient.getQueryData(["creative-work", "work-1"])).toEqual(
      expect.objectContaining({
        work: expect.objectContaining({ status: "generating" }),
        outputs: [expect.objectContaining({ status: "queued" })],
      })
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/creative-work/work-1/generate",
      expect.objectContaining({ timeoutMs: 120_000 }),
    );
  });
});

describe("carousel detail contract", () => {
  const now = new Date().toISOString();

  function carouselSlidePayload(overrides: Record<string, unknown> = {}) {
    return {
      id: "slide-1",
      workspaceId: "ws-1",
      workItemId: "work-1",
      lineageId: "lineage-1",
      parentSlideId: null,
      versionNumber: 1,
      deckRevision: "deck-r1",
      position: 1,
      role: "hook",
      primaryText: "Gancho",
      secondaryText: null,
      copyAuthority: "ai_proposal",
      sourceFactIds: [],
      layoutFamily: "impact",
      status: "completed",
      hasOutput: true,
      planSlideId: "slide-1",
      // Server rows carry private storage keys; the GET projection strips
      // them. A defensive client mapping must never surface them again.
      providerBaseKey: "private/provider.png",
      outputKey: "private/output.png",
      previewKey: "private/preview.png",
      anchorKey: "private/anchor.png",
      generationOperationKey: "op-1",
      visualContractHash: "hash-1",
      isCurrent: true,
      errorCode: null,
      quality: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  function carouselPayload(overrides: Record<string, unknown> = {}) {
    return {
      work: {
        id: "work-1",
        toolKind: "carousel",
        status: "generating",
        carouselApprovedRevision: null,
        settings: { targetFormats: [] },
        createdAt: now,
        updatedAt: now,
      },
      outputs: [],
      sources: [],
      carouselSlides: [carouselSlidePayload()],
      carouselQuality: {
        version: 1,
        objectivePassed: true,
        advisoryWarnings: [],
        reviewedAt: null,
        hasContactSheet: false,
      },
      ...overrides,
    };
  }

  beforeEach(() => vi.clearAllMocks());

  it("maps carousel slide timestamps to Date and drops every private key", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => carouselPayload() } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCreativeWork("work-1"), { wrapper: wrapperWith(queryClient) });

    await waitFor(() => expect(result.current.data?.carouselSlides).toHaveLength(1));

    const slide = result.current.data!.carouselSlides[0]!;
    expect(slide.createdAt).toBeInstanceOf(Date);
    expect(slide.updatedAt).toBeInstanceOf(Date);
    expect(slide).toEqual(expect.objectContaining({
      id: "slide-1",
      lineageId: "lineage-1",
      parentSlideId: null,
      versionNumber: 1,
      deckRevision: "deck-r1",
      position: 1,
      role: "hook",
      primaryText: "Gancho",
      secondaryText: null,
      copyAuthority: "ai_proposal",
      sourceFactIds: [],
      layoutFamily: "impact",
      status: "completed",
      hasOutput: true,
      planSlideId: "slide-1",
      errorCode: null,
      quality: null,
    }));
    expect(JSON.stringify(slide)).not.toMatch(
      /providerBaseKey|outputKey|previewKey|anchorKey|generationOperationKey|visualContractHash|isCurrent/,
    );
  });

  it("maps legacy works without carousel state to an empty public surface", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => carouselPayload({ carouselSlides: undefined, carouselQuality: undefined }),
    } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCreativeWork("work-1"), { wrapper: wrapperWith(queryClient) });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data!.carouselSlides).toEqual([]);
    expect(result.current.data!.work.carouselQuality).toBeNull();
    expect(result.current.data!.work.carouselApprovedRevision).toBeNull();
  });

  it("keeps carousel aggregate state independent of the legacy outputs list", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => carouselPayload() } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCreativeWork("work-1"), { wrapper: wrapperWith(queryClient) });

    await waitFor(() => expect(result.current.data?.carouselSlides).toHaveLength(1));

    const detail = result.current.data!;
    expect(detail.outputs).toEqual([]);
    expect(detail.work.status).toBe("generating");
    expect(detail.work.carouselQuality).toEqual({
      version: 1,
      objectivePassed: true,
      advisoryWarnings: [],
      reviewedAt: null,
      hasContactSheet: false,
    });
    expect(detail.carouselSlides[0]!.status).toBe("completed");
  });

  it("keeps polling while carousel slides are queued or processing even with empty outputs", () => {
    expect(
      creativeWorkRefetchInterval({
        work: { status: "draft" },
        outputs: [],
        carouselSlides: [{ status: "queued" }],
      }),
    ).toBe(2000);
    expect(
      creativeWorkRefetchInterval({
        work: { status: "draft" },
        outputs: [],
        carouselSlides: [{ status: "processing" }],
      }),
    ).toBe(2000);
    expect(
      creativeWorkRefetchInterval({
        work: { status: "draft" },
        outputs: [],
        carouselSlides: [{ status: "completed" }],
      }),
    ).toBe(false);
  });
});

describe("useSuggestCreativeDirections", () => {
  it("allows the free suggestion request to outlive the generic short timeout", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ directions: [] }) } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useSuggestCreativeDirections(), { wrapper: wrapperWith(queryClient) });

    await act(() => result.current.mutateAsync("work-1"));

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/creative-work/work-1/suggest",
      expect.objectContaining({ timeoutMs: 60_000 }),
    );
  });
});

describe("output review client contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saveOutputReview patches the work detail and never touches the canonical list", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ draft: {}, revisionCreditCost: 10 }) } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSaveOutputReview(), { wrapper: wrapperWith(queryClient) });
    const draft = { action: "refine", targetFormat: "4:5", instruction: "Aumente o título", revisionAssetId: null, annotations: [] };
    await act(() => result.current.mutateAsync({
      workItemId: "work-1",
      outputId: "output-1",
      expectedReviewRevision: 0,
      draft,
    }));
    expect(mockApiFetch).toHaveBeenCalledWith("/api/creative-work/work-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ action: "saveOutputReview", outputId: "output-1", expectedReviewRevision: 0, draft }),
    }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["creative-work", "work-1"] });
    expect(invalidateCanonicalWorks).not.toHaveBeenCalled();
  });

  it("reviewed_revision posts the frozen command and invalidates work and canonical list", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ output: { id: "output-v2" } }) } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useGenerateReviewedRevision(), { wrapper: wrapperWith(queryClient) });
    await act(() => result.current.mutateAsync({
      workItemId: "work-1",
      outputId: "output-1",
      reviewRevision: 1,
      revisionKey: "00000000-0000-4000-8000-000000000101",
      expectedCredits: 10,
    }));
    expect(mockApiFetch).toHaveBeenCalledWith("/api/creative-work/work-1/generate", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        action: "reviewed_revision",
        outputId: "output-1",
        reviewRevision: 1,
        revisionKey: "00000000-0000-4000-8000-000000000101",
        expectedCredits: 10,
      }),
    }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["creative-work", "work-1"] });
    expect(invalidateCanonicalWorks).toHaveBeenCalledWith(queryClient);
  });

  it("re-reads the work after a failed reviewed submission", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: "dispatch failed" }) } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useGenerateReviewedRevision(), { wrapper: wrapperWith(queryClient) });
    await expect(act(() => result.current.mutateAsync({
      workItemId: "work-1",
      outputId: "output-1",
      reviewRevision: 1,
      revisionKey: "00000000-0000-4000-8000-000000000101",
      expectedCredits: 10,
    }))).rejects.toThrow("dispatch failed");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["creative-work", "work-1"] });
  });

  it("projects the canonical revision cost and per-output review state from the detail GET", async () => {
    const now = new Date().toISOString();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        work: { id: "work-1", status: "partial", settings: { targetFormats: [] }, createdAt: now, updatedAt: now },
        outputs: [{
          id: "output-1",
          status: "completed",
          createdAt: now,
          updatedAt: now,
          reviewDraft: { version: 1, revision: 2, revisionKey: "00000000-0000-4000-8000-000000000201", action: "refine", targetFormat: "4:5", instruction: "oi", revisionAssetId: null, annotations: [] },
          revisionContext: null,
        }],
        revisionCreditCost: 10,
      }),
    } as Response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCreativeWork("work-1"), { wrapper: wrapperWith(queryClient) });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.revisionCreditCost).toBe(10);
    expect(result.current.data!.outputs[0]!.reviewDraft).toMatchObject({ revision: 2 });
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


describe("preparation in progress", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([usePrepareCreativeWork, usePlanCarouselWork])("refetches the work without retrying a joined mutation", async (hook) => {
    mockApiFetch.mockResolvedValue(new Response(JSON.stringify({
      error: "creativeWorkPreparationInProgress", code: "creativeWorkPreparationInProgress", attemptId: "attempt-1",
    }), { status: 409 }));
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 3 } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => hook(), { wrapper: wrapperWith(queryClient) });
    await act(async () => {
      await expect(result.current.mutateAsync({ workItemId: "work-1", expectedUpdatedAt: "2026-09-13T00:00:00.000Z", answers: {} }))
        .rejects.toMatchObject({ code: "creativeWorkPreparationInProgress", details: { attemptId: "attempt-1" } });
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["creative-work", "work-1"] });
  });

  it("polls a draft only while its preparation attempt is active", () => {
    const draft = { work: { status: "draft" as const }, outputs: [] };
    expect(creativeWorkRefetchInterval({ ...draft, preparationAttempt: { id: "attempt-1" } })).toBe(2000);
    expect(creativeWorkRefetchInterval({ ...draft, preparationAttempt: null })).toBe(false);
  });
});
