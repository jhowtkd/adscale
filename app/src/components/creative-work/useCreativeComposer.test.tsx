import { act, render, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  active: vi.fn(),
  work: vi.fn(),
  create: vi.fn(),
  autosave: vi.fn(),
  prepare: vi.fn(),
  source: vi.fn(),
  generate: vi.fn(),
  suggest: vi.fn(),
  upload: vi.fn(),
  retryOutput: vi.fn(),
  layerizeOutput: vi.fn(),
  reviseOutput: vi.fn(),
  selectOutput: vi.fn(),
  linkCampaign: vi.fn(),
  resolveBrandConflict: vi.fn(),
  resolveBrandConflictPending: vi.fn(() => false),
  refetch: vi.fn(),
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/hooks/use-active-client-profile", () => ({
  useActiveClientProfile: () => mocks.active(),
}));
vi.mock("@/lib/hooks/use-creative-work", async (importOriginal) => ({
  // Real pure helpers (categorize/verdict/extractBrandConflict…) — only the
  // data hooks are mocked, so the extractor can never drift from production.
  ...(await importOriginal<typeof import("@/lib/hooks/use-creative-work")>()),
  useCreativeWork: (...args: unknown[]) => mocks.work(...args),
  useCreateCreativeWorkDraft: () => ({ mutateAsync: mocks.create, isPending: false }),
  useAutosaveCreativeWork: () => ({ mutateAsync: mocks.autosave, isPending: false }),
  usePrepareCreativeWork: () => ({ mutateAsync: mocks.prepare, isPending: false }),
  useCreativeWorkSourceActions: () => ({ mutateAsync: mocks.source, isPending: false }),
  useTriggerTriplet: () => ({ mutateAsync: mocks.generate, isPending: false }),
  useSuggestCreativeDirections: () => ({ mutateAsync: mocks.suggest, isPending: false }),
  useRetryOutput: () => ({ mutateAsync: mocks.retryOutput, isPending: false, variables: undefined }),
  useLayerizeOutput: () => ({ mutateAsync: mocks.layerizeOutput, isPending: false, variables: undefined }),
  useReviseOutput: () => ({ mutateAsync: mocks.reviseOutput, isPending: false, variables: undefined }),
  useSelectOutput: () => ({ mutateAsync: mocks.selectOutput, isPending: false, variables: undefined }),
  useLinkCreativeWorkCampaign: () => ({ mutateAsync: mocks.linkCampaign, isPending: false }),
  useResolveBrandConflict: () => ({ mutateAsync: mocks.resolveBrandConflict, isPending: mocks.resolveBrandConflictPending() }),
  useDownloadOutputUrl: () => (workItemId: string, outputId: string) => `/api/creative-work/${workItemId}/outputs/${outputId}/download`,
  useCreativeWorkCampaigns: () => ({ data: [] }),
}));
vi.mock("@/lib/assistant/chat-attachments", () => ({
  collectImageFiles: (files: File[] | FileList | null) => Array.from(files ?? []),
  uploadChatAttachment: (...args: unknown[]) => mocks.upload(...args),
}));
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => mocks.apiFetch(...args),
  isApiRequestUncertain: (error: unknown) => error instanceof Error && error.name === "TimeoutError",
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { useCreativeComposer } from "./useCreativeComposer";
import { createDefaultCreativeDirectionPool } from "@/server/creative-work/contracts";

const profileA = { id: "profile-a", name: "Marca A" };
const profileB = { id: "profile-b", name: "Marca B" };
const WORK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TEMPLATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function active(overrides = {}) {
  return {
    profiles: [profileA], activeProfile: profileA, activeClientProfileId: profileA.id,
    requiresSelection: false, isLoading: false, selectProfile: vi.fn(), ...overrides,
  };
}

function workDetail(overrides = {}) {
  return {
    work: {
      id: "work-1", clientProfileId: profileA.id, request: "Pedido salvo", toolKind: "variations",
      status: "draft", format: "4:5", settings: { targetFormats: [] }, ...overrides,
    },
    outputs: [], sources: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("useCreativeComposer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    if (typeof window.localStorage?.clear === "function") window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.active.mockReturnValue(active());
    mocks.work.mockReturnValue({ data: undefined, isLoading: false });
    mocks.create.mockImplementation((input: { request: string; intent: string; format: string; settings: { targetFormats: string[] } }) => Promise.resolve({
      work: {
        ...workDetail().work,
        id: WORK_ID,
        request: input.request,
        toolKind: input.intent,
        format: input.format,
        settings: input.settings,
      },
      quote: { unitCount: 3, credits: 15 },
    }));
    mocks.autosave.mockResolvedValue({ work: { id: "work-1" } });
    mocks.prepare.mockResolvedValue({ work: workDetail().work, quote: { unitCount: 3, credits: 15 } });
    mocks.generate.mockResolvedValue({ work: { status: "generating" }, outputs: [] });
    mocks.suggest.mockResolvedValue({ directions: [] });
    mocks.upload.mockResolvedValue({ assetId: "asset-1", name: "arte.png" });
    mocks.source.mockResolvedValue({ source: { id: "source-1" } });
    mocks.selectOutput.mockResolvedValue({});
    // clearAllMocks keeps mockReturnValue implementations — reset explicitly.
    mocks.resolveBrandConflictPending.mockReturnValue(false);
  });

  it("keeps an approval failure on the affected output until retry", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
    mocks.selectOutput.mockRejectedValueOnce(new Error("Falha na aprovação"));
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(() => result.current.approveOutput("output-1"));

    expect(result.current.approvalErrorOutputId).toBe("output-1");
    expect(result.current.error).toBe("Falha na aprovação");

    await act(() => result.current.approveOutput("output-1"));

    expect(result.current.approvalErrorOutputId).toBeNull();
  });

  it("starts a new composer from the whitelisted intent and canonical quote", () => {
    const { result } = renderHook(() =>
      useCreativeComposer({ initialIntent: "format_adaptation" })
    );

    expect(result.current.intent).toBe("format_adaptation");
    expect(result.current.targetFormats).toEqual(["1:1", "9:16"]);
    expect(result.current.quote).toEqual({ unitCount: 2, credits: 10 });
  });

  it("selects between one and five directions and recalculates the quote", async () => {
    const base = createDefaultCreativeDirectionPool();
    const pool = {
      ...base,
      directions: [
        ...base.directions,
        { ...base.directions[0], id: "00000000-0000-4000-8000-000000000004", label: "Direção 4", order: 3 },
        { ...base.directions[0], id: "00000000-0000-4000-8000-000000000005", label: "Direção 5", order: 4 },
      ],
      selectedIds: base.directions.map((direction) => direction.id),
    };
    mocks.work.mockReturnValue({
      data: workDetail({ settings: { targetFormats: [], directionPool: pool } }),
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await act(async () => Promise.resolve());

    act(() => result.current.toggleDirection(pool.selectedIds[0]));
    expect(result.current.directionPool?.selectedIds).toHaveLength(2);
    expect(result.current.quote).toEqual({ unitCount: 2, credits: 10 });

    act(() => {
      result.current.toggleDirection(pool.directions[3].id);
      result.current.toggleDirection(pool.directions[4].id);
    });
    expect(result.current.directionPool?.selectedIds).toHaveLength(4);
    expect(result.current.quote).toEqual({ unitCount: 4, credits: 20 });

    act(() => result.current.toggleDirection(pool.selectedIds[1]));
    expect(result.current.directionPool?.selectedIds).toHaveLength(3);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({
        directionPool: expect.objectContaining({ selectedIds: expect.any(Array) }),
      }),
    }));
  });

  it("applies five contextual suggestions automatically when the user has not touched directions", async () => {
    vi.useRealTimers();
    const suggestions = Array.from({ length: 5 }, (_, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index + 1}`,
      label: `Sugestão ${index + 1}`,
      instruction: `Instrução ${index + 1}`,
      order: index,
      safetyBand: "safe" as const,
      provenance: "ai-suggestion" as const,
    }));
    mocks.work.mockReturnValue({
      data: {
        ...workDetail(),
        sources: [{ id: "source-1", status: "ready" }],
      },
      isLoading: false,
      isError: false,
    });
    mocks.suggest.mockResolvedValue({ directions: suggestions });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await waitFor(() => expect(result.current.directionPool?.directions[0].provenance).toBe("ai-suggestion"));

    expect(mocks.suggest).toHaveBeenCalledWith("work-1");
    expect(result.current.directionPool?.selectedIds).toEqual(suggestions.slice(0, 3).map((suggestion) => suggestion.id));
    expect(result.current.quote).toEqual({ unitCount: 3, credits: 15 });
  });

  it("requests suggestions again on demand even when suggestions are already persisted (#129)", async () => {
    vi.useRealTimers();
    const aiDirection = {
      id: "00000000-0000-4000-8000-0000000000a1",
      label: "Sugerida",
      instruction: "Instrução sugerida",
      order: 0,
      safetyBand: "safe" as const,
      provenance: "ai-suggestion" as const,
    };
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({
          settings: {
            targetFormats: [],
            directionPool: { version: 1, directions: [aiDirection], selectedIds: [aiDirection.id], manualInstruction: null },
          },
        }),
        sources: [{ id: "source-1", status: "ready" }],
      },
      isLoading: false,
      isError: false,
    });
    const freshSuggestion = { ...aiDirection, id: "00000000-0000-4000-8000-0000000000b1", label: "Nova", order: 1 };
    mocks.suggest.mockResolvedValue({ directions: [freshSuggestion] });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await act(async () => Promise.resolve());

    // Persisted suggestions never trigger another automatic fetch on reload…
    expect(mocks.suggest).not.toHaveBeenCalled();
    expect(result.current.directionSuggestionState).toBe("ready");

    // …but "Sugerir novamente" always fetches a new round and keeps the selection.
    act(() => result.current.requestDirectionSuggestions());
    await waitFor(() => expect(mocks.suggest).toHaveBeenCalledWith("work-1"));
    await waitFor(() => expect(result.current.directionSuggestionState).toBe("ready"));
    expect(result.current.directionPool?.selectedIds).toEqual([aiDirection.id]);
    expect(result.current.directionPool?.directions.map((direction) => direction.id)).toEqual([
      aiDirection.id,
      freshSuggestion.id,
    ]);
  });

  it("keeps selected chips and replaces only the unselected ones when applying suggestions", async () => {
    vi.useRealTimers();
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await act(async () => Promise.resolve());

    const defaults = result.current.directionPool!.directions;
    act(() => result.current.toggleDirection(defaults[0].id));
    const keptIds = result.current.directionPool!.selectedIds;
    expect(keptIds).toHaveLength(2);

    const suggestions = Array.from({ length: 5 }, (_, index) => ({
      id: `00000000-0000-4000-8000-0000000000b${index}`,
      label: `Sugestão ${index}`,
      instruction: `Instrução ${index}`,
      order: index,
      safetyBand: "safe" as const,
      provenance: "ai-suggestion" as const,
    }));
    act(() => result.current.applyDirectionSuggestions(suggestions));

    expect(result.current.directionPool?.selectedIds).toEqual(keptIds);
    expect(result.current.directionPool?.directions.map((direction) => direction.id)).toEqual([
      ...keptIds,
      ...suggestions.slice(0, 3).map((suggestion) => suggestion.id),
    ]);
    expect(result.current.quote).toEqual({ unitCount: 2, credits: 10 });
  });

  it("applies the full received set with new selections when confirming the late initial response (#129)", async () => {
    vi.useRealTimers();
    const suggestions = Array.from({ length: 5 }, (_, index) => ({
      id: `00000000-0000-4000-8000-0000000000c${index}`,
      label: `Sugestão ${index}`,
      instruction: `Instrução ${index}`,
      order: index,
      safetyBand: "safe" as const,
      provenance: "ai-suggestion" as const,
    }));
    mocks.work.mockReturnValue({
      data: {
        ...workDetail(),
        sources: [{ id: "source-1", status: "ready" }],
      },
      isLoading: false,
      isError: false,
    });
    const round = deferred<{ directions: typeof suggestions }>();
    mocks.suggest.mockReturnValue(round.promise);

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await act(async () => Promise.resolve());
    await waitFor(() => expect(result.current.directionSuggestionState).toBe("loading"));

    // The user picks chips before the late response lands (#129).
    const defaults = result.current.directionPool!.directions;
    act(() => result.current.toggleDirection(defaults[0].id));
    const chosenIds = result.current.directionPool!.selectedIds;
    expect(chosenIds).toHaveLength(2);

    await act(async () => round.resolve({ directions: suggestions }));
    await waitFor(() => expect(result.current.directionSuggestionState).toBe("ready"));

    // The late response waits for confirmation flagged as a replacement.
    expect(result.current.pendingDirectionSuggestions).toEqual({ directions: suggestions, preserveSelection: false });
    expect(result.current.directionPool?.selectedIds).toEqual(chosenIds);

    act(() => {
      const pending = result.current.pendingDirectionSuggestions!;
      result.current.applyDirectionSuggestions(pending.directions, pending.preserveSelection);
    });

    // The full received set applies, with its top suggestions selected.
    expect(result.current.directionPool?.directions.map((direction) => direction.id)).toEqual(
      suggestions.map((suggestion) => suggestion.id),
    );
    expect(result.current.directionPool?.selectedIds).toEqual(
      suggestions.slice(0, 3).map((suggestion) => suggestion.id),
    );
    expect(result.current.pendingDirectionSuggestions).toBeNull();
    expect(result.current.quote).toEqual({ unitCount: 3, credits: 15 });
  });

  it("preserves the selected chips when confirming a 'Sugerir novamente' response (#129)", async () => {
    vi.useRealTimers();
    const firstRound = Array.from({ length: 5 }, (_, index) => ({
      id: `00000000-0000-4000-8000-0000000000d${index}`,
      label: `Sugestão ${index}`,
      instruction: `Instrução ${index}`,
      order: index,
      safetyBand: "safe" as const,
      provenance: "ai-suggestion" as const,
    }));
    mocks.work.mockReturnValue({
      data: {
        ...workDetail(),
        sources: [{ id: "source-1", status: "ready" }],
      },
      isLoading: false,
      isError: false,
    });
    mocks.suggest.mockResolvedValue({ directions: firstRound });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await waitFor(() => expect(result.current.directionPool?.directions[0].provenance).toBe("ai-suggestion"));

    // The user adjusts the selection after the auto-apply…
    act(() => result.current.toggleDirection(firstRound[0].id));
    const keptIds = result.current.directionPool!.selectedIds;
    expect(keptIds).toHaveLength(2);

    // …then asks for a new round, which also lands as a pending confirmation.
    const second = deferred<{ directions: typeof firstRound }>();
    mocks.suggest.mockReturnValue(second.promise);
    act(() => result.current.requestDirectionSuggestions());
    await waitFor(() => expect(result.current.directionSuggestionState).toBe("loading"));

    const fresh = firstRound.slice(0, 2).map((suggestion, index) => ({
      ...suggestion,
      id: `00000000-0000-4000-8000-0000000000e${index}`,
      label: `Nova ${index}`,
    }));
    await act(async () => second.resolve({ directions: fresh }));
    await waitFor(() => expect(result.current.directionSuggestionState).toBe("ready"));

    expect(result.current.pendingDirectionSuggestions).toEqual({ directions: fresh, preserveSelection: true });

    act(() => {
      const pending = result.current.pendingDirectionSuggestions!;
      result.current.applyDirectionSuggestions(pending.directions, pending.preserveSelection);
    });

    expect(result.current.directionPool?.selectedIds).toEqual(keptIds);
    expect(result.current.directionPool?.directions.map((direction) => direction.id)).toEqual([
      ...keptIds,
      ...fresh.map((suggestion) => suggestion.id),
    ]);
  });

  it("never autosaves or regenerates a hydrated non-draft work", async () => {
    mocks.work.mockReturnValue({
      data: workDetail({ id: WORK_ID, status: "generating" }),
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() =>
      useCreativeComposer({ initialWorkId: WORK_ID })
    );
    await act(async () => Promise.resolve());

    act(() => result.current.setRequest("Não deve salvar"));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    await act(() => result.current.generate());

    expect(mocks.autosave).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(result.current.canGenerate).toBe(false);
  });

  it("stops retrying autosave after the server reports a non-draft conflict", async () => {
    mocks.work.mockReturnValue({
      data: workDetail({ id: WORK_ID, status: "draft" }),
      isLoading: false,
      isError: false,
    });
    mocks.autosave.mockRejectedValue(new Error("creativeWorkNotDraft"));
    const { result, rerender } = renderHook(() =>
      useCreativeComposer({ initialWorkId: WORK_ID })
    );
    await act(async () => Promise.resolve());

    act(() => result.current.setRequest("Mudança concorrente"));
    await act(() => vi.advanceTimersByTimeAsync(600));
    rerender();
    await act(() => vi.advanceTimersByTimeAsync(2_000));

    expect(mocks.autosave).toHaveBeenCalledOnce();
  });

  it("detaches a non-draft work before switching protocols", async () => {
    mocks.work.mockImplementation((id: string | null) => ({
      data: id === WORK_ID
        ? workDetail({ id: WORK_ID, status: "generating" })
        : undefined,
      isLoading: false,
      isError: false,
    }));
    const { result } = renderHook(() =>
      useCreativeComposer({ initialWorkId: WORK_ID })
    );
    await act(async () => Promise.resolve());

    act(() => result.current.selectIntent("restyle"));
    await act(() => vi.advanceTimersByTimeAsync(1_000));

    expect(result.current.intent).toBe("restyle");
    expect(result.current.workId).toBeNull();
    expect(result.current.request).toBe("");
    expect(window.location.search).toBe("?intent=restyle");
    expect(mocks.autosave).not.toHaveBeenCalled();
  });

  it("ignores a stale draft creation that finishes after switching protocols", async () => {
    const creating = deferred<{ work: ReturnType<typeof workDetail>["work"]; quote: { unitCount: number; credits: number } }>();
    mocks.create.mockReturnValueOnce(creating.promise);
    const { result } = renderHook(() => useCreativeComposer());

    act(() => result.current.setRequest("Pedido antigo"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    act(() => result.current.selectIntent("restyle"));
    expect(result.current.intent).toBe("variations");
    expect(result.current.pendingProtocolSwitch).toBe("restyle");
    act(() => result.current.confirmProtocolSwitch());
    await act(async () => creating.resolve({
      work: workDetail({ id: WORK_ID, request: "Pedido antigo", toolKind: "variations" }).work,
      quote: { unitCount: 3, credits: 15 },
    }));

    expect(result.current.intent).toBe("restyle");
    expect(result.current.workId).toBeNull();
    expect(window.location.search).toBe("?intent=restyle");
  });

  it("focuses the real textarea once after StrictMode's synthetic cleanup", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    });
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, "focus");

    function Probe({ requested }: { requested: boolean }) {
      const composer = useCreativeComposer({ focusComposer: requested });
      return <textarea ref={composer.composerRef} />;
    }

    const view = render(<StrictMode><Probe requested /></StrictMode>);
    act(() => {
      for (const [id, callback] of frames) {
        frames.delete(id);
        callback(0);
      }
    });
    expect(focus).toHaveBeenCalledOnce();
    view.rerender(<StrictMode><Probe requested /></StrictMode>);
    expect(frames.size).toBe(0);

    view.unmount();
    render(<Probe requested={false} />);
    expect(focus).toHaveBeenCalledOnce();
    raf.mockRestore();
    cancel.mockRestore();
    focus.mockRestore();
  });

  it("attaches an initial template once under StrictMode", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );
    renderHook(
      () =>
        useCreativeComposer({
          initialTemplateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      { wrapper }
    );

    await act(async () => Promise.resolve());

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientProfileId: profileA.id,
        templateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        usage: "both",
      })
    );
  });

  it("consumes template and compose params once after a new StrictMode draft attaches", async () => {
    window.history.replaceState({}, "", `/?templateId=${TEMPLATE_ID}&compose=1`);
    const replace = vi.spyOn(window.history, "replaceState");
    mocks.create.mockImplementation((input: { templateId?: string }) => Promise.resolve({
      work: { ...workDetail({ id: WORK_ID }).work, request: "", toolKind: "variations" },
      quote: { unitCount: 3, credits: 15 },
      input,
    }));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );

    renderHook(() => useCreativeComposer({ initialTemplateId: TEMPLATE_ID }), { wrapper });
    await act(async () => Promise.resolve());

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledTimes(2);
    expect(window.location.search).toBe(`?workId=${WORK_ID}`);
    replace.mockRestore();
  });

  it("does not double-attach a template already visible after reload", async () => {
    const templateId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    mocks.work.mockReturnValue({
      data: {
        ...workDetail(),
        sources: [
          {
            id: "source-template",
            templateId,
            assetId: null,
            usage: "both",
            status: "ready",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() =>
      useCreativeComposer({ initialWorkId: "work-1", initialTemplateId: templateId })
    );
    await act(async () => Promise.resolve());

    expect(result.current.sources).toEqual([
      expect.objectContaining({ templateId, id: "source-template" }),
    ]);
    expect(mocks.source).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("consumes a hydrated template URL so source removal plus reload cannot reattach or refocus", async () => {
    window.history.replaceState(
      {},
      "",
      `/?workId=${WORK_ID}&intent=restyle&templateId=${TEMPLATE_ID}&compose=1`
    );
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ id: WORK_ID }),
        sources: [{ id: "source-template", templateId: TEMPLATE_ID, assetId: null, usage: "both", status: "ready" }],
      },
      isLoading: false,
      isError: false,
    });
    const replace = vi.spyOn(window.history, "replaceState");
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    });
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, "focus");
    function Probe({ reload = false }: { reload?: boolean }) {
      const composer = useCreativeComposer(reload ? {
        initialWorkId: WORK_ID,
        initialIntent: "restyle",
      } : {
        initialWorkId: WORK_ID,
        initialIntent: "restyle",
        initialTemplateId: TEMPLATE_ID,
        focusComposer: true,
      });
      return <textarea ref={composer.composerRef} />;
    }
    const first = render(<StrictMode><Probe /></StrictMode>);
    await act(async () => Promise.resolve());
    act(() => {
      for (const [id, callback] of frames) {
        frames.delete(id);
        callback(0);
      }
    });

    expect(window.location.search).toBe(`?workId=${WORK_ID}&intent=restyle`);
    expect(replace).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    first.unmount();

    mocks.work.mockReturnValue({
      data: workDetail({ id: WORK_ID }),
      isLoading: false,
      isError: false,
    });
    render(<StrictMode><Probe reload /></StrictMode>);
    await act(async () => Promise.resolve());

    expect(mocks.source).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    expect(focus).toHaveBeenCalledOnce();
    replace.mockRestore();
    raf.mockRestore();
    focus.mockRestore();
  });

  it("attaches an initial template to the hydrated draft instead of creating another work", async () => {
    const templateId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    mocks.work.mockReturnValue({
      data: workDetail(),
      isLoading: false,
      isError: false,
    });

    renderHook(() =>
      useCreativeComposer({ initialWorkId: "work-1", initialTemplateId: templateId })
    );
    await act(async () => Promise.resolve());

    expect(mocks.source).toHaveBeenCalledOnce();
    expect(mocks.source).toHaveBeenCalledWith({
      workItemId: "work-1",
      action: "attachSource",
      templateId,
      usage: "both",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps URL params after a transient template failure and retries explicitly", async () => {
    window.history.replaceState(
      {},
      "",
      `/?workId=${WORK_ID}&templateId=${TEMPLATE_ID}&compose=1`
    );
    mocks.work.mockReturnValue({
      data: workDetail({ id: WORK_ID }),
      isLoading: false,
      isError: false,
    });
    mocks.source
      .mockRejectedValueOnce(new Error("Falha transitória"))
      .mockResolvedValueOnce({ source: { id: "source-template" } });
    const { result } = renderHook(() => useCreativeComposer({
      initialWorkId: WORK_ID,
      initialTemplateId: TEMPLATE_ID,
      focusComposer: true,
    }));
    await act(async () => Promise.resolve());

    expect(mocks.source).toHaveBeenCalledOnce();
    expect(window.location.search).toContain(`templateId=${TEMPLATE_ID}`);
    expect(result.current.retryInitialTemplate).not.toBeNull();

    await act(async () => result.current.retryInitialTemplate?.());
    await act(async () => Promise.resolve());

    expect(mocks.source).toHaveBeenCalledTimes(2);
    expect(window.location.search).toBe(`?workId=${WORK_ID}`);
    expect(result.current.retryInitialTemplate).toBeNull();
  });

  it("waits for an explicit brand selection before attaching an initial template", async () => {
    const templateId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    mocks.active.mockReturnValue(
      active({
        profiles: [profileA, profileB],
        activeProfile: null,
        activeClientProfileId: null,
        requiresSelection: true,
      })
    );
    const { rerender } = renderHook(() =>
      useCreativeComposer({ initialTemplateId: templateId })
    );
    await act(async () => Promise.resolve());
    expect(mocks.create).not.toHaveBeenCalled();

    mocks.active.mockReturnValue(active());
    rerender();
    await act(async () => Promise.resolve());

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ clientProfileId: profileA.id, templateId })
    );
  });

  it("creates one draft after the first non-empty debounced save", async () => {
    const { result } = renderHook(() => useCreativeComposer());
    act(() => result.current.setRequest("  Campanha de julho  "));
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      clientProfileId: profileA.id,
      request: "  Campanha de julho  ",
      intent: "variations",
    }));

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("creates an attachment-first draft with the accepted uploaded asset", async () => {
    const { result } = renderHook(() => useCreativeComposer());
    const file = new File(["image"], "arte.png", { type: "image/png" });

    await act(() => result.current.addFiles([file]));

    expect(mocks.upload).toHaveBeenCalledWith(file);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      request: "",
      assetId: "asset-1",
      usage: "both",
    }));
  });

  it("attaches an upload that finishes while the text-only draft is being created", async () => {
    const creating = deferred<{
      work: ReturnType<typeof workDetail>["work"];
      quote: { unitCount: number; credits: number };
    }>();
    mocks.create.mockReturnValue(creating.promise);
    const { result } = renderHook(() => useCreativeComposer());
    const file = new File(["image"], "arte-race.png", { type: "image/png" });

    act(() => result.current.setRequest("Campanha mobile"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ assetId: expect.anything() })
    );

    await act(async () => {
      const adding = result.current.addFiles([file]);
      await Promise.resolve();
      creating.resolve({
        work: {
          ...workDetail().work,
          id: WORK_ID,
          request: "Campanha mobile",
        },
        quote: { unitCount: 3, credits: 15 },
      });
      await adding;
    });

    expect(mocks.source).toHaveBeenCalledWith({
      workItemId: WORK_ID,
      action: "attachSource",
      assetId: "asset-1",
      usage: "both",
    });
  });

  it("surfaces a raced source attach failure and succeeds when the user retries", async () => {
    const creating = deferred<{
      work: ReturnType<typeof workDetail>["work"];
      quote: { unitCount: number; credits: number };
    }>();
    mocks.create.mockReturnValue(creating.promise);
    mocks.source
      .mockRejectedValueOnce(new Error("attach failed"))
      .mockResolvedValueOnce({ source: { id: "source-1" } });
    const { result } = renderHook(() => useCreativeComposer());
    const file = new File(["image"], "arte-race.png", { type: "image/png" });

    act(() => result.current.setRequest("Campanha mobile"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    await act(async () => {
      const adding = result.current.addFiles([file]);
      await Promise.resolve();
      creating.resolve({
        work: {
          ...workDetail().work,
          id: WORK_ID,
          request: "Campanha mobile",
        },
        quote: { unitCount: 3, credits: 15 },
      });
      await adding;
    });

    expect(result.current.error).toBe("attach failed");
    expect(result.current.announcement).not.toBe("Arte adicionada");

    await act(() => result.current.addFiles([file]));

    expect(mocks.source).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.announcement).toBe("Arte adicionada");
  });

  it("re-reads instead of surfacing a transient 409 when a source retry loses its race", async () => {
    vi.useRealTimers();
    const refetch = mocks.refetch.mockResolvedValue({ data: workDetail() });
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ id: WORK_ID }),
        sources: [{
          id: "source-1",
          status: "failed",
          usage: "both",
          usageConfirmed: true,
        }],
      },
      isLoading: false,
      isError: false,
      refetch,
    });
    mocks.source.mockRejectedValueOnce(
      Object.assign(new Error("Entrada inválida"), { code: "invalidInput", status: 409 }),
    );

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: WORK_ID }));
    await act(async () => Promise.resolve());
    await act(async () => result.current.retrySource("source-1"));

    expect(refetch).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
  });

  it("persists a corrected source reading on the same creative work", async () => {
    mocks.work.mockReturnValue({ data: workDetail({ id: WORK_ID }), isLoading: false, isError: false });
    const content = {
      product: "Curso",
      offer: "30%",
      cta: { text: "Inscreva-se", style: "botão" },
      brandElements: [],
      keyVisual: "Médica",
      textContent: { headline: "Nova turma", bullets: ["Agosto"] },
      format: "4:5",
    };
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: WORK_ID }));

    await act(async () => result.current.editSource("source-1", content, null));

    expect(mocks.source).toHaveBeenCalledWith({
      workItemId: WORK_ID,
      action: "editSourceAnalysis",
      sourceId: "source-1",
      content,
      style: null,
    });
  });

  it("delivers an upload announcement to the composer mounted after draft canonicalization", async () => {
    const creating = deferred<{
      work: ReturnType<typeof workDetail>["work"];
      quote: { unitCount: number; credits: number };
    }>();
    mocks.create.mockReturnValue(creating.promise);
    const first = renderHook(() => useCreativeComposer());
    const file = new File(["image"], "arte-remount.png", { type: "image/png" });

    let adding!: Promise<void>;
    await act(async () => {
      adding = first.result.current.addFiles([file]);
      await Promise.resolve();
    });
    first.unmount();
    const replacement = renderHook(() => useCreativeComposer({ initialWorkId: WORK_ID }));

    await act(async () => {
      creating.resolve({
        work: { ...workDetail().work, id: WORK_ID },
        quote: { unitCount: 3, credits: 15 },
      });
      await adding;
    });

    expect(replacement.result.current.announcement).toBe("Arte adicionada");
  });

  it("rejects an unsafe work identifier returned while creating a draft", async () => {
    mocks.create.mockResolvedValue({
      work: { ...workDetail().work, id: "../../other-workspace" },
      quote: { unitCount: 3, credits: 15 },
    });
    const { result } = renderHook(() => useCreativeComposer());

    await act(() => result.current.addInspiration({
      id: "inspiration-1", source: "template", title: "Template", previewUrl: null,
      templateId: TEMPLATE_ID,
      assetId: null, suggestedIntent: "variations",
    }));

    expect(result.current.workId).toBeNull();
    expect(result.current.error).toMatch(/identificador/i);
    expect(window.location.search).toBe("");
  });

  it("attaches a template inspiration to the same existing composer", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(() => result.current.addInspiration({
      id: "template-1", source: "template", title: "Lançamento", previewUrl: null,
      templateId: "template-1", assetId: null, suggestedIntent: "variations",
    }));

    expect(mocks.source).toHaveBeenCalledWith({
      workItemId: "work-1", action: "attachSource", templateId: "template-1", usage: "both",
    });
  });

  it("creates an asset-backed draft when an approved inspiration starts an empty composer", async () => {
    const { result } = renderHook(() => useCreativeComposer());

    await act(() => result.current.addInspiration({
      id: "output-1", source: "approved_work", title: "Matrículas",
      previewUrl: "/api/workspace/assets/asset-1/file", templateId: null,
      assetId: "asset-1", suggestedIntent: "restyle",
    }));

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      clientProfileId: profileA.id, request: "", intent: "restyle", assetId: "asset-1", usage: "style",
    }));
    expect(result.current.intent).toBe("restyle");
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it("materializes a curated Home inspiration before attaching it", async () => {
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ assetId: "asset-curated" }),
    });
    const { result } = renderHook(() => useCreativeComposer());

    await act(() => result.current.addInspiration({
      id: "curated-1", source: "curated", title: "Editorial",
      previewUrl: "/api/creative-work/inspirations/curated-1/file", templateId: null,
      assetId: null, curatedInspirationId: "curated-1", suggestedIntent: "restyle",
    }));

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      "/api/creative-work/inspirations/curated-1",
      { method: "POST", timeoutMs: 60_000 },
    );
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      assetId: "asset-curated",
      usage: "style",
    }));
  });

  it("attaches the first uploaded image as restyle content", async () => {
    const { result } = renderHook(() => useCreativeComposer({ initialIntent: "restyle" }));
    const file = new File(["image"], "original.png", { type: "image/png" });

    await act(() => result.current.addFiles([file]));

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      intent: "restyle", assetId: expect.any(String), usage: "content",
    }));
  });

  it("creates a template-backed draft when a template starts an empty composer", async () => {
    const { result } = renderHook(() => useCreativeComposer());

    await act(() => result.current.addInspiration({
      id: "template-1", source: "template", title: "Lançamento", previewUrl: null,
      templateId: "template-1", assetId: null, suggestedIntent: "variations",
    }));

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      clientProfileId: profileA.id, request: "", templateId: "template-1", usage: "both",
    }));
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it("does not announce an attached inspiration when draft creation fails", async () => {
    mocks.create.mockRejectedValue(new Error("draft failed"));
    const { result } = renderHook(() => useCreativeComposer());

    await act(() => result.current.addInspiration({
      id: "template-1", source: "template", title: "Lançamento", previewUrl: null,
      templateId: "template-1", assetId: null, suggestedIntent: "variations",
    }));

    expect(result.current.error).toBe("draft failed");
    expect(result.current.announcement).toBe("");
  });

  it("applies a tool preset to the same focused composer and updates its canonical quote", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    const { result } = renderHook(() => useCreativeComposer());
    const textarea = document.createElement("textarea");
    (result.current.composerRef as { current: HTMLTextAreaElement | null }).current = textarea;
    document.body.appendChild(textarea);

    act(() => result.current.selectIntent("single"));

    expect(result.current.intent).toBe("single");
    expect(result.current.quote).toEqual({ unitCount: 1, credits: 5 });
    expect(document.activeElement).toBe(textarea);
    textarea.remove();
    vi.unstubAllGlobals();
  });

  it("does not create without a valid brand and focuses the global switcher", async () => {
    mocks.active.mockReturnValue(active({
      profiles: [profileA, profileB], activeProfile: null, activeClientProfileId: null, requiresSelection: true,
    }));
    const select = document.createElement("select");
    select.id = "active-brand-switcher";
    document.body.appendChild(select);
    const { result } = renderHook(() => useCreativeComposer());

    act(() => result.current.setRequest("Novo anúncio"));
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(mocks.create).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(select);
    select.remove();
  });

  it("restores request and the stored brand even when the global brand differs", async () => {
    mocks.active.mockReturnValue(active({ profiles: [profileA, profileB] }));
    mocks.work.mockReturnValue({ data: workDetail({ clientProfileId: profileB.id }), isLoading: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.request).toBe("Pedido salvo");
    expect(result.current.brandName).toBe("Marca B");
    expect(result.current.state).toBe("ready");
  });

  it("keeps generation disabled while a confirmed source is being reanalyzed", () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail(),
        sources: [{ id: "source-1", usageConfirmed: true, status: "analyzing" }],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.state).toBe("analyzing");
    expect(result.current.canGenerate).toBe(false);
  });

  it("enables restyle with two ready sources without asking for usage confirmation", () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ toolKind: "restyle", request: "" }),
        sources: [
          { id: "source-1", usage: "content", usageConfirmed: false, status: "ready" },
          { id: "source-2", usage: "style", usageConfirmed: false, status: "ready" },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.canGenerate).toBe(true);
  });

  it("does not enable restyle from a single ready both source", () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ toolKind: "restyle", request: "" }),
        sources: [
          { id: "source-1", usage: "both", usageConfirmed: true, status: "ready" },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.canGenerate).toBe(false);
  });

  it("persists variation instructions without trimming outer whitespace", async () => {
    mocks.work.mockReturnValue({ data: workDetail({ toolKind: "variations" }), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    act(() => {
      result.current.setRequest("  - Copy mais direta\n- Novo CTA  ");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({
      request: "  - Copy mais direta\n- Novo CTA  ",
    }));
  });

  it("does not expose the global brand while an existing work is still hydrating", () => {
    mocks.work.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.clientProfileId).toBeNull();
  });

  it("lets the user pin the displayed 4:5 format while the draft is automatic", () => {
    const { result } = renderHook(() => useCreativeComposer());

    expect(result.current.format).toBe("4:5");
    expect(result.current.formatMode).toBe("auto");

    act(() => result.current.setFormat("4:5"));

    expect(result.current.formatMode).toBe("manual");
  });

  it("autosaves a format-mode change when the displayed ratio stays the same", async () => {
    mocks.work.mockReturnValue({
      data: workDetail({ settings: { targetFormats: [], formatMode: "auto" } }),
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    act(() => result.current.setFormat("4:5"));
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1",
      format: "4:5",
      settings: { targetFormats: [], formatMode: "manual" },
    }));
  });

  it("retries a failed revision only as a fresh paid revision command", async () => {
    const revision = {
      id: "output-v2",
      workspaceId: "ws-1",
      workItemId: "work-1",
      creativeLevel: "balanced" as const,
      targetFormat: "4:5" as const,
      versionNumber: 2,
      parentOutputId: "output-v1",
      revisionInstruction: "Use mais contraste",
      revisionAssetId: "asset-1",
      retryCount: 0,
      operationKey: "revision:00000000-0000-4000-8000-000000000101",
      status: "failed" as const,
      outputKey: null,
      cost: null,
      failureCode: "credit_blocked",
      quality: null,
      isSelected: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mocks.work.mockReturnValue({ data: { ...workDetail(), outputs: [revision] }, isLoading: false, isError: false });
    mocks.reviseOutput.mockResolvedValue({ output: { ...revision, id: "output-v3", status: "queued" } });
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000105");
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(() => result.current.retryRevisionOutput(revision));

    expect(mocks.retryOutput).not.toHaveBeenCalled();
    expect(mocks.reviseOutput).toHaveBeenCalledWith({
      workItemId: "work-1",
      outputId: "output-v1",
      revisionKey: "00000000-0000-4000-8000-000000000105",
      instruction: "Use mais contraste",
      revisionAssetId: "asset-1",
    });
  });

  it.each([
    ["single", { targetFormats: [] }, { unitCount: 1, credits: 5 }],
    ["restyle", { targetFormats: [] }, { unitCount: 1, credits: 5 }],
    ["format_adaptation", { targetFormats: ["1:1", "9:16"] }, { unitCount: 2, credits: 10 }],
  ] as const)("hydrates %s as authoritative without autosaving variations over it", async (toolKind, settings, expectedQuote) => {
    mocks.work.mockReturnValue({ data: workDetail({ toolKind, settings }), isLoading: false, isError: false });
    const { result } = renderHook(() =>
      useCreativeComposer({ initialWorkId: "work-1", initialIntent: "single" })
    );

    expect(result.current.intent).toBe(toolKind);
    expect(result.current.quote).toEqual(expectedQuote);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mocks.autosave).not.toHaveBeenCalled();
  });

  it.each([
    ["restyle", { unitCount: 1, credits: 5 }],
    ["single", { unitCount: 1, credits: 5 }],
    ["format_adaptation", { unitCount: 2, credits: 10 }],
  ] as const)("starts a separate %s draft instead of mutating the restored work", async (nextIntent, expectedQuote) => {
    mocks.work.mockReturnValue({ data: workDetail({ toolKind: "variations" }), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.intent).toBe("variations");
    expect(result.current.quote).toEqual({ unitCount: 3, credits: 15 });
    await act(async () => Promise.resolve());
    act(() => result.current.selectIntent(nextIntent));
    await act(async () => Promise.resolve());
    expect(result.current.intent).toBe(nextIntent);
    expect(result.current.quote).toEqual(expectedQuote);
    expect(result.current.workId).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mocks.autosave).not.toHaveBeenCalled();

    await act(() => result.current.addFiles([
      new File(["image"], "nova-arte.png", { type: "image/png" }),
    ]));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      intent: nextIntent,
      settings: nextIntent === "format_adaptation"
        ? { targetFormats: ["1:1", "9:16"], formatMode: "manual" }
        : { targetFormats: [], formatMode: "manual" },
    }));
  });

  it("autosaves an existing work under its stored brand when no global brand is active", async () => {
    mocks.active.mockReturnValue(active({
      profiles: [profileA, profileB], activeProfile: null, activeClientProfileId: null, requiresSelection: true,
    }));
    mocks.work.mockReturnValue({ data: workDetail({ clientProfileId: profileB.id }), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    act(() => result.current.setRequest("Edição da marca persistida"));
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1", request: "Edição da marca persistida",
    }));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("waits for create A, persists latest B, then prepares and generates", async () => {
    const createA = deferred<{ work: ReturnType<typeof workDetail>["work"]; quote: { unitCount: number; credits: number } }>();
    mocks.create.mockReturnValueOnce(createA.promise);
    const { result } = renderHook(() => useCreativeComposer());
    act(() => result.current.setRequest("Pedido A"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ request: "Pedido A" }));

    act(() => result.current.setRequest("Pedido B"));
    let generation!: Promise<void>;
    act(() => { generation = result.current.generate(); });
    expect(mocks.prepare).not.toHaveBeenCalled();

    createA.resolve({
      work: { ...workDetail().work, id: WORK_ID, request: "Pedido A", toolKind: "variations" },
      quote: { unitCount: 3, credits: 15 },
    });
    await act(async () => { await generation; });

    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({ request: "Pedido B" }));
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.autosave.mock.invocationCallOrder[0]).toBeLessThan(mocks.prepare.mock.invocationCallOrder[0]);
    expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[0]);
  });

  it("patches B before paid work when a replayed create returns persisted A", async () => {
    const lostResponse = deferred<never>();
    mocks.create
      .mockReturnValueOnce(lostResponse.promise)
      .mockResolvedValueOnce({
        work: { ...workDetail().work, id: WORK_ID, request: "Pedido A", toolKind: "variations" },
        quote: { unitCount: 3, credits: 15 },
      });
    const { result } = renderHook(() => useCreativeComposer());

    act(() => result.current.setRequest("Pedido A"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    act(() => result.current.setRequest("Pedido B"));
    lostResponse.reject(new Error("response lost after commit"));
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await result.current.generate(); });

    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({ request: "Pedido B" }));
    expect(mocks.autosave.mock.invocationCallOrder[0]).toBeLessThan(mocks.prepare.mock.invocationCallOrder[0]);
  });

  it("serializes autosaves and never starts B before A settles", async () => {
    const saveA = deferred<{ work: { id: string } }>();
    const saveB = deferred<{ work: { id: string } }>();
    mocks.autosave.mockReturnValueOnce(saveA.promise).mockReturnValueOnce(saveB.promise);
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    act(() => result.current.setRequest("Pedido A"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    act(() => result.current.setRequest("Pedido B"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mocks.autosave).toHaveBeenCalledTimes(1);

    saveA.resolve({ work: { id: "work-1" } });
    await act(async () => { await Promise.resolve(); });
    expect(mocks.autosave).toHaveBeenCalledTimes(2);
    expect(mocks.autosave).toHaveBeenLastCalledWith(expect.objectContaining({ request: "Pedido B" }));
    saveB.resolve({ work: { id: "work-1" } });
    await act(async () => { await Promise.resolve(); });
  });

  it("flushes autosave and submits paid generation only once", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    expect(result.current.request).toBe("Pedido salvo");
    act(() => result.current.setRequest("Pedido mais recente"));

    await act(async () => {
      await Promise.all([result.current.generate(), result.current.generate()]);
    });

    expect(mocks.autosave).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.autosave.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[0]);
  });

  it("keeps the prepared briefing available to the Home surface", async () => {
    const briefing = {
      version: 1,
      message: { value: "Pedido salvo", state: "sourced" },
      objective: { value: "Gerar interesse", state: "inferred", confidence: "medium" },
      audience: { value: null, state: "unknown" },
      offer: { value: null, state: "unknown" },
      tone: { value: "Direto", state: "sourced" },
      constraints: { value: null, state: "unknown" },
      readiness: "exploratory",
      confidence: "low",
    } as const;
    const briefingFactPack = {
      version: 1,
      request: "Pedido salvo",
      facts: [{ value: "Pedido salvo", class: "text", required: true, origin: "request" }],
      brand: { requiredElements: [], prohibitedElements: [] },
      identity: { clientProfileId: profileA.id, brandName: "Marca A", brandAuthority: "active" },
    } as const;
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false });
    mocks.prepare.mockResolvedValue({
      work: workDetail().work,
      quote: { unitCount: 3, credits: 15 },
      briefing,
      briefingFactPack,
      readiness: briefing.readiness,
      confidence: briefing.confidence,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generate(); });

    expect(result.current.inferredBriefing).toEqual(briefing);
    expect(result.current.briefingFactPack).toEqual(briefingFactPack);
  });

  it("reconciles an uncertain generation response before showing an error", async () => {
    const refetch = vi.fn().mockResolvedValue({ data: {
      ...workDetail({ status: "generating" }),
      outputs: [{ status: "queued" }],
    } });
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, refetch });
    mocks.generate.mockRejectedValue(Object.assign(new Error("request timed out"), { name: "TimeoutError" }));
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generate(); });

    expect(refetch).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
    expect(result.current.announcement).toContain("Geração aceita");
  });

  it("does not treat a prepared work without outputs as an accepted generation", async () => {
    const refetch = vi.fn().mockResolvedValue({ data: {
      ...workDetail({ status: "ready" }),
      outputs: [],
    } });
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, refetch });
    mocks.generate.mockRejectedValue(Object.assign(new Error("request timed out"), { name: "TimeoutError" }));
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generate(); });

    expect(refetch).toHaveBeenCalledOnce();
    expect(result.current.announcement).not.toContain("Geração aceita");
    expect(result.current.error).toBe("A geração não foi confirmada. Tente gerar novamente.");
  });

  it("resumes a prepared work without outputs straight at generation, without preparing again", async () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ status: "ready" }),
        sources: [{ id: "source-1", status: "ready" }],
        outputs: [],
      },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await act(async () => Promise.resolve());

    expect(result.current.canGenerate).toBe(true);
    await act(async () => { await result.current.generate(); });

    expect(mocks.autosave).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledWith("work-1");
    expect(result.current.announcement).toContain("Geração iniciada");
  });

  it("does not autosave a format inferred by prepare while generation starts", async () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ toolKind: "restyle", format: "4:5", settings: { targetFormats: [], formatMode: "auto" } }),
        sources: [
          { id: "content", usage: "content", status: "ready" },
          { id: "style", usage: "style", status: "ready" },
        ],
      },
      isLoading: false,
      isError: false,
    });
    mocks.prepare.mockResolvedValue({
      work: workDetail({
        toolKind: "restyle",
        format: "9:16",
        settings: { targetFormats: [], formatMode: "auto" },
      }).work,
      quote: { unitCount: 1, credits: 5 },
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generate(); });
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(result.current.format).toBe("9:16");
    expect(mocks.autosave).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledOnce();
  });

  it("keeps the non-blocking brand training suggestion returned by generation", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false });
    mocks.generate.mockResolvedValue({
      work: { status: "generating" }, outputs: [],
      brandTrainingSuggestion: "missing_visual_references",
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generate(); });

    expect(result.current.brandTrainingSuggestion).toBe("missing_visual_references");
  });

  it("restores the brand training suggestion from the persisted identity snapshot", () => {
    mocks.work.mockReturnValue({
      data: workDetail({ status: "generating", identitySnapshot: { assets: [] } }),
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.brandTrainingSuggestion).toBe("missing_visual_references");
  });

  it("persists the latest edit when an existing draft unmounts before debounce", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
    const { result, unmount } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    act(() => result.current.setRequest("Última edição"));
    unmount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1", request: "Última edição",
    }));
  });

  it("does not flush an existing work that unmounts before its GET hydrates", async () => {
    mocks.work.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { unmount } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    unmount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(mocks.autosave).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("hydrates a deferred existing work, then persists its latest edit on unmount", async () => {
    let query = { data: undefined as ReturnType<typeof workDetail> | undefined, isLoading: true, isError: false };
    mocks.work.mockImplementation(() => query);
    const { result, rerender, unmount } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    query = { data: workDetail(), isLoading: false, isError: false };
    rerender();
    act(() => result.current.setRequest("Edição após hidratar"));
    unmount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1", request: "Edição após hidratar",
    }));
  });

  it("creates the latest non-empty draft when it unmounts before debounce", async () => {
    const { result, unmount } = renderHook(() => useCreativeComposer());

    act(() => result.current.setRequest("Último rascunho"));
    unmount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ request: "Último rascunho" }));
  });

  it("does not create an empty draft when it unmounts before debounce", async () => {
    const { unmount } = renderHook(() => useCreativeComposer());
    unmount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not persist during StrictMode's synthetic cleanup", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { unmount } = renderHook(() => useCreativeComposer(), { wrapper });
    await act(async () => { await Promise.resolve(); });

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.autosave).not.toHaveBeenCalled();
    unmount();
  });

  it("disables generate while a source is still uploaded or analyzing", () => {
    mocks.work.mockReturnValue({
      data: {
        work: workDetail().work,
        outputs: [],
        sources: [{ id: "source-1", status: "uploaded", usage: "both" }],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.state).toBe("analyzing");
    expect(result.current.canGenerate).toBe(false);
  });

  it("blocks generate() before prepare when sources are pending analysis", async () => {
    mocks.work.mockReturnValue({
      data: {
        work: workDetail().work,
        outputs: [],
        sources: [{ id: "source-1", status: "uploaded", usage: "both" }],
      },
      isLoading: false,
      isError: false,
    });
    mocks.autosave.mockResolvedValue({ work: { id: "work-1" } });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => {
      await result.current.generate();
    });

    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/análise/i);
  });

  it("surfaces a prepare 422 brand_conflict as a choice, never as a generic error (R-008)", async () => {
    mocks.work.mockReturnValue({ data: workDetail({ toolKind: "restyle" }), isLoading: false });
    mocks.prepare.mockRejectedValue(Object.assign(new Error("Conflito de marca"), {
      code: "brand_conflict",
      details: { detectedBrand: "XTB", activeBrand: "Marca A", sourceId: "src-1", choices: ["source", "active"] },
    }));
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generate(); });

    expect(result.current.brandConflict).toEqual({
      detectedBrand: "XTB", activeBrand: "Marca A", sourceId: "src-1", choices: ["source", "active"],
    });
    expect(result.current.error).toBeNull();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("keeps a prepare failure without conflict payload as a generic error", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false });
    mocks.prepare.mockRejectedValue(Object.assign(new Error("Contexto inválido"), {
      code: "invalid_context",
      details: { violations: ["preço sem origem"] },
    }));
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generate(); });

    expect(result.current.brandConflict).toBeNull();
    expect(result.current.error).toBe("Contexto inválido");
  });

  it("saves the brand choice on the same draft and resumes the interrupted submit (R-008)", async () => {
    mocks.work.mockReturnValue({ data: workDetail({ toolKind: "restyle" }), isLoading: false });
    mocks.prepare
      .mockRejectedValueOnce(Object.assign(new Error("Conflito de marca"), {
        code: "brand_conflict",
        details: { detectedBrand: "XTB", activeBrand: "Marca A", sourceId: "src-1", choices: ["source", "active"] },
      }))
      .mockResolvedValueOnce({
        work: { ...workDetail().work, format: "4:5" },
        quote: { unitCount: 1, credits: 5 },
      });
    mocks.generate.mockResolvedValue({ work: { status: "generating" }, outputs: [], brandTrainingSuggestion: null });
    mocks.resolveBrandConflict.mockResolvedValue({ work: workDetail().work });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generate(); });
    expect(result.current.brandConflict).not.toBeNull();
    expect(mocks.generate).not.toHaveBeenCalled();

    await act(async () => { await result.current.resolveBrandConflict("source"); });

    // The choice persisted on the SAME draft (no create) and the interrupted
    // submit resumed: prepare ran again and generation was dispatched.
    expect(mocks.resolveBrandConflict).toHaveBeenCalledWith({ workItemId: "work-1", choice: "source" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(result.current.brandConflict).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("ignores a second brand choice while the first is still applying (double-click guard)", async () => {
    mocks.work.mockReturnValue({ data: workDetail({ toolKind: "restyle" }), isLoading: false });
    mocks.prepare.mockRejectedValue(Object.assign(new Error("Conflito de marca"), {
      code: "brand_conflict",
      details: { detectedBrand: "XTB", activeBrand: "Marca A", sourceId: "src-1", choices: ["source", "active"] },
    }));
    mocks.resolveBrandConflictPending.mockReturnValue(true);
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generate(); });
    await act(async () => { await result.current.resolveBrandConflict("active"); });

    // A choice already in flight (isPending) drops the repeated command.
    expect(mocks.resolveBrandConflict).not.toHaveBeenCalled();
  });

  it("ignores resolveBrandConflict when there is no pending conflict", async () => {
    mocks.work.mockReturnValue({ data: workDetail({ toolKind: "restyle" }), isLoading: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.resolveBrandConflict("active"); });

    expect(mocks.resolveBrandConflict).not.toHaveBeenCalled();
  });
});
