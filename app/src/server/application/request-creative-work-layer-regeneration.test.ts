import { beforeEach, describe, expect, it, vi } from "vitest";
const claim = vi.hoisted(() => vi.fn(async () => ({ ok: false, code: "quota_exhausted" })));
const release = vi.hoisted(() => vi.fn());
const reserve = vi.hoisted(() => vi.fn());
const getOutput = vi.hoisted(() => vi.fn());
const stateFromOutput = vi.hoisted(() => vi.fn());
const rollback = vi.hoisted(() => vi.fn());
const clearTerminal = vi.hoisted(() => vi.fn());
const quotaReleased = vi.hoisted(() => vi.fn());
const quotaCommitted = vi.hoisted(() => vi.fn());
const markCommitted = vi.hoisted(() => vi.fn());
const send = vi.hoisted(() => vi.fn());
const operationLock = vi.hoisted(() => vi.fn(async (_input: unknown, run: (executor: unknown) => Promise<unknown>) => run({})));
const dispatchLock = vi.hoisted(() => vi.fn(async (_input: unknown, run: (executor: unknown) => Promise<unknown>) => run({})));
vi.mock("@/server/layer-editor/quota", () => ({ claimLayerEditorQuota: claim, isLayerEditorQuotaReleased: quotaReleased, isLayerEditorQuotaReservationCommitted: quotaCommitted, markLayerEditorQuotaReservationCommitted: markCommitted, releaseLayerEditorQuota: release, withLayerEditorOperationLock: operationLock, withLayerEditorPostDispatchLock: dispatchLock }));
vi.mock("@/server/repositories/creative-work-layer-editor", () => ({ clearTerminalLayerRegenerationForRetry: clearTerminal, reserveLayerRegeneration: reserve, rollbackReservedLayerRegeneration: rollback, getCreativeWorkLayerEditorOutput: getOutput, layerEditorFromOutput: stateFromOutput }));
vi.mock("@/server/jobs/client", () => ({ inngest: { send } }));
import { requestCreativeWorkLayerRegeneration } from "./request-creative-work-layer-regeneration";
const input = { workspaceId: "w", workItemId: "i", outputId: "o", userId: "u", leaseId: "00000000-0000-4000-8000-000000000001", expectedRevision: 1, operationId: "00000000-0000-4000-8000-000000000002", layerId: "00000000-0000-4000-8000-000000000003", instruction: "x" };

describe("requestCreativeWorkLayerRegeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    operationLock.mockReset();
    operationLock.mockImplementation(async (_input: unknown, run: (executor: unknown) => Promise<unknown>) => run({}));
    dispatchLock.mockImplementation(async (_input: unknown, run: (executor: unknown) => Promise<unknown>) => run({}));
    stateFromOutput.mockReset();
    reserve.mockReset();
    getOutput.mockReset();
    claim.mockResolvedValue({ ok: false, code: "quota_exhausted" });
    rollback.mockResolvedValue({ id: input.outputId });
    quotaReleased.mockResolvedValue(false);
    quotaCommitted.mockResolvedValue(false);
    markCommitted.mockResolvedValue(true);
    stateFromOutput.mockReturnValue({ regeneration: { id: input.operationId, status: "reserved" } });
  });

  it("does not dispatch when quota is exhausted", async () => {
    await expect(requestCreativeWorkLayerRegeneration(input)).resolves.toMatchObject({ ok: false, code: "quota_exhausted" });
    expect(reserve).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a historical committed operation after a later regeneration replaced it", async () => {
    claim.mockResolvedValue({ ok: true, replay: true });
    quotaCommitted.mockResolvedValue(true);
    getOutput.mockResolvedValue({ layerEditor: {} });
    stateFromOutput.mockReturnValue({ regeneration: { id: "00000000-0000-4000-8000-000000000099", status: "failed" } });

    await expect(requestCreativeWorkLayerRegeneration(input)).resolves.toEqual({ ok: false, code: "layer_editor_revision_conflict" });
    expect(clearTerminal).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("replays a claimed operation without reserving or dispatching a second event", async () => {
    claim.mockResolvedValue({ ok: true, replay: true });
    getOutput.mockResolvedValue({ layerEditor: {} });
    stateFromOutput.mockReturnValue({ regeneration: { id: input.operationId, status: "processing" } });

    await expect(requestCreativeWorkLayerRegeneration(input)).resolves.toEqual({ ok: true, accepted: false, replay: true });

    expect(reserve).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("redelivers the stable event for a replayed reservation", async () => {
    claim.mockResolvedValue({ ok: true, replay: true });
    getOutput.mockResolvedValue({ layerEditor: {} });
    stateFromOutput.mockReturnValue({ regeneration: { id: input.operationId, status: "reserved" } });
    send.mockResolvedValue(undefined);

    await expect(requestCreativeWorkLayerRegeneration(input)).resolves.toEqual({ ok: true, accepted: false, replay: true });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: `creative-work-layer-regenerate:${input.outputId}:${input.operationId}` }));
  });

  it("rejects a released or undispatched quota replay that has no matching regeneration", async () => {
    claim.mockResolvedValue({ ok: true, replay: true });
    getOutput.mockResolvedValue({ layerEditor: {} });
    stateFromOutput.mockReturnValue({ regeneration: null });
    quotaReleased.mockResolvedValue(true);

    await expect(requestCreativeWorkLayerRegeneration(input)).resolves.toEqual({ ok: false, code: "layer_editor_revision_conflict" });
    expect(reserve).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("recovers an unreleased quota claim that crashed before reservation", async () => {
    claim.mockResolvedValue({ ok: true, replay: true });
    getOutput.mockResolvedValue({ layerEditor: {} });
    stateFromOutput.mockReturnValueOnce({ regeneration: null }).mockReturnValueOnce({ regeneration: null }).mockReturnValue({ regeneration: { id: input.operationId, status: "reserved" } });
    reserve.mockResolvedValue({ id: input.outputId });
    send.mockResolvedValue(undefined);

    await expect(requestCreativeWorkLayerRegeneration(input)).resolves.toEqual({ ok: true, accepted: false, replay: true });
    expect(reserve).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
  });

  it("compensates a replayed quota claim that loses reservation without dispatching", async () => {
    claim.mockResolvedValue({ ok: true, replay: true });
    getOutput.mockResolvedValue({ layerEditor: {} });
    stateFromOutput.mockReturnValue({ revision: 1, regeneration: null });
    reserve.mockResolvedValue(null);

    await expect(requestCreativeWorkLayerRegeneration(input)).resolves.toEqual({ ok: false, code: "layer_editor_revision_conflict" });

    expect(release).toHaveBeenCalledWith(expect.objectContaining({ kind: "layer_regeneration_v1", operationId: input.operationId }), expect.any(Date), expect.anything());
    expect(send).not.toHaveBeenCalled();
  });

  it("redelivers the stable event when a reservation CAS loser finds the matching reserved operation", async () => {
    claim.mockResolvedValue({ ok: true, replay: false });
    reserve.mockResolvedValue(null);
    getOutput.mockResolvedValue({ layerEditor: {} });
    stateFromOutput.mockReturnValue({ regeneration: { id: input.operationId, status: "reserved" } });
    send.mockResolvedValue(undefined);

    await expect(requestCreativeWorkLayerRegeneration(input)).resolves.toEqual({ ok: true, accepted: false, replay: true });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: `creative-work-layer-regenerate:${input.outputId}:${input.operationId}` }));
  });

  it("redelivers the stable event after the reservation transaction commits", async () => {
    let active: { revision: number; regeneration: { id: string; status: "reserved" } | null } = { revision: 1, regeneration: null };
    let released = false;
    let tail = Promise.resolve();
    operationLock.mockImplementation(async (_input: unknown, run: (executor: unknown) => Promise<unknown>) => {
      const previous = tail;
      let unlock!: () => void;
      tail = new Promise<void>((resolve) => { unlock = resolve; });
      await previous;
      try { return await run({}); } finally { unlock(); }
    });
    claim.mockImplementation(async () => ({ ok: true as const, replay: Boolean(active.regeneration) || released }));
    getOutput.mockResolvedValue({ layerEditor: {} });
    stateFromOutput.mockImplementation(() => active);
    reserve.mockImplementation(async () => { active = { revision: 2, regeneration: { id: input.operationId, status: "reserved" } }; return { id: input.outputId }; });
    rollback.mockImplementation(async () => { active = { revision: 3, regeneration: null }; return { id: input.outputId }; });
    release.mockImplementation(async () => { released = true; return { released: true }; });
    quotaReleased.mockImplementation(async () => released);
    let rejectDispatch!: (error: Error) => void;
    send.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectDispatch = reject; }));

    const winner = requestCreativeWorkLayerRegeneration(input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const replay = requestCreativeWorkLayerRegeneration(input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(send).toHaveBeenCalledTimes(2);
    expect(reserve).toHaveBeenCalledOnce();

    rejectDispatch(new Error("dispatch failed"));
    await expect(winner).resolves.toMatchObject({ ok: false, code: "layer_regeneration_dispatch_failed" });
    await expect(replay).resolves.toMatchObject({ ok: true, replay: true });
    expect(release).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("uses the revision returned by terminal cleanup when reserving a new operation", async () => {
    claim.mockResolvedValue({ ok: true, replay: false });
    getOutput.mockResolvedValue({ layerEditor: {} });
    clearTerminal.mockResolvedValue({ cleared: true });
    let stateReads = 0;
    stateFromOutput.mockImplementation((row) => {
      stateReads += 1;
      if (stateReads >= 3) return { revision: 3, regeneration: { id: input.operationId, status: "reserved" } };
      return row && "cleared" in (row as object)
        ? { revision: 2, regeneration: null }
        : { revision: 1, regeneration: { id: "previous-operation", status: "failed" } };
    });
    reserve.mockResolvedValue({ id: input.outputId });
    send.mockResolvedValue(undefined);

    await expect(requestCreativeWorkLayerRegeneration(input)).resolves.toMatchObject({ ok: true, accepted: true });
    expect(clearTerminal).toHaveBeenCalledWith(expect.objectContaining({ operationId: input.operationId }), expect.anything());
    expect(reserve).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 2 }), expect.anything());
  });

  it("releases a newly claimed unit when event dispatch is definitively rejected", async () => {
    claim.mockResolvedValue({ ok: true, replay: false });
    reserve.mockResolvedValue({ id: input.outputId });
    send.mockRejectedValue(new Error("Inngest unavailable"));

    await expect(requestCreativeWorkLayerRegeneration(input)).resolves.toEqual({ ok: false, code: "layer_regeneration_dispatch_failed" });

    expect(release).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: input.workspaceId,
      kind: "layer_regeneration_v1",
      operationId: input.operationId,
    }), expect.any(Date), expect.anything());
    expect(rollback).toHaveBeenCalledWith(expect.objectContaining({ ...input, operationId: input.operationId }), expect.anything());
  });

  it("does not turn a compensated dispatch failure into a successful replay", async () => {
    claim.mockResolvedValue({ ok: true, replay: false });
    reserve.mockResolvedValue({ id: input.outputId });
    send.mockRejectedValue(new Error("Inngest unavailable"));
    await expect(requestCreativeWorkLayerRegeneration(input)).resolves.toMatchObject({ ok: false, code: "layer_regeneration_dispatch_failed" });

    claim.mockResolvedValue({ ok: true, replay: true });
    stateFromOutput.mockReturnValue({ regeneration: null });
    quotaReleased.mockResolvedValue(true);
    await expect(requestCreativeWorkLayerRegeneration(input)).resolves.toMatchObject({ ok: false, code: "layer_editor_revision_conflict" });
  });

  it("treats a dispatch race as accepted when the job advanced the matching operation", async () => {
    claim.mockResolvedValue({ ok: true, replay: false });
    reserve.mockResolvedValue({ id: input.outputId });
    rollback.mockResolvedValue(null);
    send.mockRejectedValue(new Error("Inngest unavailable"));
    getOutput.mockResolvedValue({ layerEditor: {} });
    stateFromOutput.mockReturnValue({ regeneration: { id: input.operationId, status: "processing" } });

    await expect(requestCreativeWorkLayerRegeneration(input)).resolves.toEqual({ ok: true, accepted: true, replay: false });

    expect(release).not.toHaveBeenCalled();
  });
});
