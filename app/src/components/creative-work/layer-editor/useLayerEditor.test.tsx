import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerEditorAccessV1, PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";

const patch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/use-creative-work", () => ({ patchCreativeWork: (...args: unknown[]) => patch(...args) }));

import { useLayerEditor } from "./useLayerEditor";

const access: LayerEditorAccessV1 = { enabled: true, period: null, layerize: null, regeneration: null };
const editorDocument: PublicLayerEditorDocumentV1 = {
  schemaVersion: 1, revision: 1, canvas: { width: 100, height: 100 },
  lease: { mode: "edit", leaseId: "00000000-0000-4000-8000-000000000001", heldByName: null, expiresAt: null }, regeneration: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  layers: [0, 1].map((index) => ({ id: `00000000-0000-4000-8000-00000000000${index + 1}`, order: index, name: "Layer", visible: true, x: 0, y: 0, width: 10, height: 10, currentKind: "source" as const, imageUrl: "x", source: { order: index, name: "Layer", visible: true, x: 0, y: 0, width: 10, height: 10, imageUrl: "source" } })),
};

const response = (document = editorDocument) => ({ document, access });
const actionOf = (call: unknown) => (call as [string, { action: string }])[1].action;
const callsFor = (action: string) => patch.mock.calls.filter((call) => actionOf(call) === action);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

async function openHook(mode: "edit" | "inspect" = "edit") {
  const hook = renderHook(() => useLayerEditor({ workItemId: "work-1", outputId: "output-1", mode }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return hook;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  Object.defineProperty(globalThis.document, "visibilityState", { configurable: true, value: "visible" });
});

describe("useLayerEditor", () => {
  it("debounces save until 750ms", async () => {
    vi.useFakeTimers();
    patch.mockImplementation(async (_work: string, body: { action: string }) => response(body.action === "saveLayerEditor" ? { ...editorDocument, revision: 2 } : editorDocument));
    const hook = await openHook();
    expect(callsFor("openLayerEditor")).toHaveLength(1);
    act(() => hook.result.current.dispatch({ type: "rename", id: editorDocument.layers[0]!.id, name: "Next" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(749); });
    expect(callsFor("saveLayerEditor")).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(callsFor("saveLayerEditor")).toHaveLength(1);
  });

  it("serializes an unresolved save and performs exactly one follow-up", async () => {
    vi.useFakeTimers();
    const first = deferred<ReturnType<typeof response>>();
    let saves = 0;
    patch.mockImplementation((_work: string, body: { action: string }) => {
      if (body.action === "openLayerEditor") return Promise.resolve(response());
      if (body.action === "saveLayerEditor") return ++saves === 1 ? first.promise : Promise.resolve(response({ ...editorDocument, revision: 2 }));
      return Promise.resolve(response());
    });
    const hook = await openHook();
    act(() => hook.result.current.dispatch({ type: "rename", id: editorDocument.layers[0]!.id, name: "First" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    act(() => hook.result.current.dispatch({ type: "rename", id: editorDocument.layers[0]!.id, name: "Second" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    expect(callsFor("saveLayerEditor")).toHaveLength(1);
    await act(async () => { first.resolve(response({ ...editorDocument, revision: 2 })); await Promise.resolve(); });
    expect(callsFor("saveLayerEditor")).toHaveLength(2);
  });

  it("heartbeats only while the document is visible in edit mode", async () => {
    vi.useFakeTimers();
    patch.mockResolvedValue(response());
    const hook = await openHook();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(callsFor("heartbeatLayerEditor")).toHaveLength(1);
    Object.defineProperty(globalThis.document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(callsFor("heartbeatLayerEditor")).toHaveLength(1);
    hook.unmount();
  });

  it("never saves or heartbeats in inspect mode", async () => {
    vi.useFakeTimers();
    patch.mockImplementation(async (_work: string, body: { action: string }) => response(body.action === "openLayerEditor" ? { ...editorDocument, lease: { ...editorDocument.lease, mode: "read", leaseId: null } } : editorDocument));
    const hook = await openHook("inspect");
    act(() => hook.result.current.dispatch({ type: "rename", id: editorDocument.layers[0]!.id, name: "Blocked" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(31_000); });
    expect(callsFor("saveLayerEditor")).toHaveLength(0);
    expect(callsFor("heartbeatLayerEditor")).toHaveLength(0);
  });

  it("switches to read mode and stops autosave after a revision conflict", async () => {
    vi.useFakeTimers();
    patch.mockImplementation((_work: string, body: { action: string }) => body.action === "saveLayerEditor"
      ? Promise.reject(Object.assign(new Error("stale"), { code: "layer_editor_revision_conflict" }))
      : Promise.resolve(response()));
    const hook = await openHook();
    act(() => hook.result.current.dispatch({ type: "rename", id: editorDocument.layers[0]!.id, name: "Conflict" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    expect(hook.result.current.mode).toBe("read");
    act(() => hook.result.current.dispatch({ type: "rename", id: editorDocument.layers[0]!.id, name: "Ignored" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(31_000); });
    expect(callsFor("saveLayerEditor")).toHaveLength(1);
    expect(callsFor("heartbeatLayerEditor")).toHaveLength(0);
    expect(hook.result.current.hasUnresolvedConflict).toBe(true);
    await expect(hook.result.current.flushAndRelease()).resolves.toBe(false);
    expect(callsFor("releaseLayerEditor")).toHaveLength(0);
  });

  it("blocks local document mutations while regeneration makes snapshots unsaveable", async () => {
    vi.useFakeTimers();
    const reserved = { ...editorDocument, regeneration: { id: "00000000-0000-4000-8000-000000000099", status: "reserved" as const, layerId: editorDocument.layers[0]!.id, instruction: "Change", candidateUrl: null, failureCode: null } };
    patch.mockResolvedValue(response(reserved));
    const hook = await openHook();

    act(() => hook.result.current.dispatch({ type: "rename", id: editorDocument.layers[0]!.id, name: "Blocked" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });

    expect(hook.result.current.document?.layers[0]?.name).toBe("Layer");
    expect(hook.result.current.canUndo).toBe(false);
    expect(callsFor("saveLayerEditor")).toHaveLength(0);
  });

  it("reports saving, saved, and explicit conflict recovery states", async () => {
    vi.useFakeTimers();
    const saving = deferred<ReturnType<typeof response>>();
    let opened = 0;
    patch.mockImplementation((_work: string, body: { action: string }) => {
      if (body.action === "openLayerEditor") return Promise.resolve(response(++opened > 1 ? { ...editorDocument, revision: 2 } : editorDocument));
      if (body.action === "saveLayerEditor") return saving.promise;
      return Promise.resolve(response());
    });
    const hook = await openHook();
    act(() => hook.result.current.dispatch({ type: "rename", id: editorDocument.layers[0]!.id, name: "Changed" }));
    expect(hook.result.current.saveStatus).toBe("idle");
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    expect(hook.result.current.saveStatus).toBe("saving");
    await act(async () => { saving.resolve(response({ ...editorDocument, revision: 2 })); await Promise.resolve(); });
    expect(hook.result.current.saveStatus).toBe("saved");

    patch.mockImplementation((_work: string, body: { action: string }) => body.action === "saveLayerEditor"
      ? Promise.reject(Object.assign(new Error("stale"), { code: "layer_editor_revision_conflict" }))
      : Promise.resolve(response({ ...editorDocument, revision: 3 })));
    act(() => hook.result.current.dispatch({ type: "rename", id: editorDocument.layers[0]!.id, name: "Conflict" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    expect(hook.result.current.saveStatus).toBe("conflict");
    await act(async () => { await hook.result.current.discardLocalEdits(); });
    expect(hook.result.current.hasUnresolvedConflict).toBe(false);
    expect(hook.result.current.saveStatus).toBe("saved");
  });

  it("announces the same autosave lifecycle for a geometry transform", async () => {
    vi.useFakeTimers();
    patch.mockImplementation(async (_work: string, body: { action: string }) => response(body.action === "saveLayerEditor" ? { ...editorDocument, revision: 2 } : editorDocument));
    const hook = await openHook();

    act(() => hook.result.current.dispatch({ type: "transform", id: editorDocument.layers[0]!.id, x: 4, y: 5, width: 8, height: 9 }));
    expect(hook.result.current.saveStatus).toBe("idle");
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    expect(hook.result.current.saveStatus).toBe("saved");
  });

  it("polls only active regeneration and refreshes signed document URLs", async () => {
    vi.useFakeTimers();
    const active = { ...editorDocument, regeneration: { id: "00000000-0000-4000-8000-000000000099", status: "reserved" as const, layerId: editorDocument.layers[0]!.id, instruction: "Change", candidateUrl: null, failureCode: null } };
    const refreshed = { ...active, layers: active.layers.map((layer) => ({ ...layer, imageUrl: "fresh-current", source: { ...layer.source, imageUrl: "fresh-source" } })) };
    patch.mockImplementation(async () => response(callsFor("openLayerEditor").length > 1 ? refreshed : active));
    const hook = await openHook();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(callsFor("openLayerEditor")).toHaveLength(2);
    expect(hook.result.current.document?.layers[0]?.imageUrl).toBe("fresh-current");
    hook.unmount();
  });

  it("keeps inactive regeneration from polling", async () => {
    vi.useFakeTimers();
    patch.mockResolvedValue(response());
    await openHook();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(callsFor("openLayerEditor")).toHaveLength(1);
  });

  it("refreshes canonical state after regeneration and starts polling its reservation", async () => {
    vi.useFakeTimers();
    const reserved = { ...editorDocument, regeneration: { id: "00000000-0000-4000-8000-000000000099", status: "reserved" as const, layerId: editorDocument.layers[0]!.id, instruction: "Change", candidateUrl: null, failureCode: null } };
    patch.mockImplementation((...params: unknown[]) => {
      const body = params[1] as { action: string };
      if (body.action === "regenerateLayer") return Promise.resolve({ ok: true, accepted: true, replay: false });
      return Promise.resolve(response(callsFor("openLayerEditor").length > 1 ? reserved : editorDocument));
    });
    const hook = await openHook();

    await act(async () => { await hook.result.current.regenerate(editorDocument.layers[0]!.id, "Change"); });
    expect(hook.result.current.document?.regeneration).toMatchObject({ status: "reserved" });
    expect(callsFor("openLayerEditor")).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(callsFor("openLayerEditor")).toHaveLength(3);
  });

  for (const [action, invoke] of [
    ["acceptLayerCandidate", (hook: ReturnType<typeof renderHook<ReturnType<typeof useLayerEditor>, unknown>>) => hook.result.current.acceptCandidate()],
    ["discardLayerCandidate", (hook: ReturnType<typeof renderHook<ReturnType<typeof useLayerEditor>, unknown>>) => hook.result.current.discardCandidate()],
  ] as const) {
    it(`refreshes canonical state after ${action}`, async () => {
      vi.useFakeTimers();
      const ready = { ...editorDocument, regeneration: { id: "00000000-0000-4000-8000-000000000099", status: "ready" as const, layerId: editorDocument.layers[0]!.id, instruction: "Change", candidateUrl: "candidate", failureCode: null } };
      patch.mockImplementation((...params: unknown[]) => {
        const body = params[1] as { action: string };
        if (body.action === action) return Promise.resolve({ ok: true });
        return Promise.resolve(response(callsFor("openLayerEditor").length > 1 ? editorDocument : ready));
      });
      const hook = await openHook();

      await act(async () => { await invoke(hook); });
      expect(hook.result.current.document?.regeneration).toBeNull();
      expect(callsFor("openLayerEditor")).toHaveLength(2);
    });
  }

  it("uses a popup opened synchronously and closes it when export flush fails", async () => {
    vi.useFakeTimers();
    const assign = vi.fn();
    const close = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({ location: { assign }, close } as unknown as Window);
    patch.mockImplementation((...params: unknown[]) => {
      const body = params[1] as { action: string };
      return body.action === "saveLayerEditor" ? Promise.reject(new Error("save failed")) : Promise.resolve(response());
    });
    const hook = await openHook();
    act(() => hook.result.current.dispatch({ type: "rename", id: editorDocument.layers[0]!.id, name: "Changed" }));
    const exported = await hook.result.current.exportDraft("draft-png");
    expect(exported).toBe(false);
    expect(window.open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(close).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });

  it("exports a confirmed revision, publishes, and releases the lease", async () => {
    vi.useFakeTimers();
    const assign = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({ location: { assign }, close: vi.fn() } as unknown as Window);
    patch.mockImplementation(async (_work: string, body: { action: string }) => {
      if (body.action === "saveLayerEditor") return response({ ...editorDocument, revision: 2 });
      if (body.action === "publishLayerEditor") return { ok: true, replay: false, output: { id: "child-1" } };
      return response();
    });
    const hook = await openHook();
    act(() => hook.result.current.dispatch({ type: "rename", id: editorDocument.layers[0]!.id, name: "Changed" }));
    let exported = false;
    await act(async () => { exported = await hook.result.current.exportDraft("draft-psd"); });
    expect(exported).toBe(true);
    expect(assign).toHaveBeenCalledWith("/api/creative-work/work-1/outputs/output-1/download?format=draft-psd&revision=2");
    const releasesBeforePublish = callsFor("releaseLayerEditor").length;
    let published: unknown;
    await act(async () => { published = await hook.result.current.publish(); });
    expect(published).toMatchObject({ ok: true });
    expect(callsFor("releaseLayerEditor")).toHaveLength(releasesBeforePublish + 1);
  });

  it("returns false from flushAndRelease when save fails", async () => {
    vi.useFakeTimers();
    patch.mockImplementation((_work: string, body: { action: string }) => body.action === "saveLayerEditor"
      ? Promise.reject(new Error("save failed"))
      : Promise.resolve(response()));
    const hook = await openHook();
    act(() => hook.result.current.dispatch({ type: "rename", id: editorDocument.layers[0]!.id, name: "Changed" }));
    await expect(hook.result.current.flushAndRelease()).resolves.toBe(false);
    expect(callsFor("releaseLayerEditor")).toHaveLength(0);
  });

  it("uses the active regeneration id for immutable candidate actions", async () => {
    vi.useFakeTimers();
    const regenerationId = "00000000-0000-4000-8000-000000000099";
    patch.mockResolvedValue(response({ ...editorDocument, regeneration: { id: regenerationId, status: "ready", layerId: editorDocument.layers[0]!.id, instruction: "Change", candidateUrl: "candidate", failureCode: null } }));
    const hook = await openHook();

    await act(async () => { await hook.result.current.acceptCandidate(); });
    expect(callsFor("acceptLayerCandidate")[0]?.[1]).toMatchObject({ operationId: regenerationId });
  });

  it("turns a failed initial open into semantic read mode without an unhandled rejection", async () => {
    vi.useFakeTimers();
    patch.mockRejectedValue(new Error("locked"));
    const hook = renderHook(() => useLayerEditor({ workItemId: "work-1", outputId: "output-1", mode: "edit" }));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(hook.result.current.mode).toBe("read");
  });

  it("keeps a locked open document available in read mode", async () => {
    vi.useFakeTimers();
    const readDocument = { ...editorDocument, lease: { mode: "read" as const, leaseId: null, heldByName: "Editor A", expiresAt: "2099-08-22T00:00:00.000Z" } };
    patch.mockRejectedValue(Object.assign(new Error("locked"), { code: "layer_editor_locked", status: 409, details: { document: readDocument } }));
    const hook = renderHook(() => useLayerEditor({ workItemId: "work-1", outputId: "output-1", mode: "edit" }));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(hook.result.current.mode).toBe("read");
    expect(hook.result.current.document).toMatchObject({ lease: { mode: "read", leaseId: null, heldByName: "Editor A" } });
  });
});
