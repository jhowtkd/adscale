import { act, renderHook } from "@testing-library/react";
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
  upload: vi.fn(),
  retryOutput: vi.fn(),
  reviseOutput: vi.fn(),
  selectOutput: vi.fn(),
  linkCampaign: vi.fn(),
}));

vi.mock("@/lib/hooks/use-active-client-profile", () => ({
  useActiveClientProfile: () => mocks.active(),
}));
vi.mock("@/lib/hooks/use-creative-work", () => ({
  useCreativeWork: (...args: unknown[]) => mocks.work(...args),
  useCreateCreativeWorkDraft: () => ({ mutateAsync: mocks.create, isPending: false }),
  useAutosaveCreativeWork: () => ({ mutateAsync: mocks.autosave, isPending: false }),
  usePrepareCreativeWork: () => ({ mutateAsync: mocks.prepare, isPending: false }),
  useCreativeWorkSourceActions: () => ({ mutateAsync: mocks.source, isPending: false }),
  useTriggerTriplet: () => ({ mutateAsync: mocks.generate, isPending: false }),
  useRetryOutput: () => ({ mutateAsync: mocks.retryOutput, isPending: false, variables: undefined }),
  useReviseOutput: () => ({ mutateAsync: mocks.reviseOutput, isPending: false, variables: undefined }),
  useSelectOutput: () => ({ mutateAsync: mocks.selectOutput, isPending: false, variables: undefined }),
  useLinkCreativeWorkCampaign: () => ({ mutateAsync: mocks.linkCampaign, isPending: false }),
  useDownloadOutputUrl: () => (workItemId: string, outputId: string) => `/api/creative-work/${workItemId}/outputs/${outputId}/download`,
  useCreativeWorkCampaigns: () => ({ data: [] }),
}));
vi.mock("@/lib/assistant/chat-attachments", () => ({
  collectImageFiles: (files: File[] | FileList | null) => Array.from(files ?? []),
  uploadChatAttachment: (...args: unknown[]) => mocks.upload(...args),
}));

import { useCreativeComposer } from "./useCreativeComposer";

const profileA = { id: "profile-a", name: "Marca A" };
const profileB = { id: "profile-b", name: "Marca B" };

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
    mocks.active.mockReturnValue(active());
    mocks.work.mockReturnValue({ data: undefined, isLoading: false });
    mocks.create.mockImplementation((input: { request: string; intent: string; format: string; settings: { targetFormats: string[] } }) => Promise.resolve({
      work: {
        ...workDetail().work,
        request: input.request,
        toolKind: input.intent,
        format: input.format,
        settings: input.settings,
      },
      quote: { unitCount: 3, credits: 15 },
    }));
    mocks.autosave.mockResolvedValue({ work: { id: "work-1" } });
    mocks.prepare.mockResolvedValue({ work: { id: "work-1" }, quote: { unitCount: 3, credits: 15 } });
    mocks.generate.mockResolvedValue({ work: { status: "generating" }, outputs: [] });
    mocks.upload.mockResolvedValue({ assetId: "asset-1", name: "arte.png" });
  });

  it("creates one draft after the first non-empty debounced save", async () => {
    const { result } = renderHook(() => useCreativeComposer());
    act(() => result.current.setRequest("  Campanha de julho  "));
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      clientProfileId: profileA.id,
      request: "Campanha de julho",
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
      clientProfileId: profileA.id, request: "", assetId: "asset-1", usage: "both",
    }));
    expect(mocks.source).not.toHaveBeenCalled();
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
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.intent).toBe(toolKind);
    expect(result.current.quote).toEqual(expectedQuote);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mocks.autosave).not.toHaveBeenCalled();
  });

  it.each([
    ["restyle", { unitCount: 1, credits: 5 }],
    ["single", { unitCount: 1, credits: 5 }],
    ["format_adaptation", { unitCount: 2, credits: 10 }],
  ] as const)("changes a restored work to %s and autosaves the canonical draft", async (nextIntent, expectedQuote) => {
    mocks.work.mockReturnValue({ data: workDetail({ toolKind: "variations" }), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.intent).toBe("variations");
    expect(result.current.quote).toEqual({ unitCount: 3, credits: 15 });
    act(() => result.current.selectIntent(nextIntent));
    expect(result.current.intent).toBe(nextIntent);
    expect(result.current.quote).toEqual(expectedQuote);

    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1",
      intent: nextIntent,
      settings: nextIntent === "format_adaptation" ? { targetFormats: ["1:1", "9:16"] } : { targetFormats: [] },
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
      work: { ...workDetail().work, request: "Pedido A", toolKind: "variations" },
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
        work: { ...workDetail().work, request: "Pedido A", toolKind: "variations" },
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
});
