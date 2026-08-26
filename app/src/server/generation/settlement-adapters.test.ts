import { beforeEach, describe, expect, it, vi } from "vitest";

const chargeUnit = vi.hoisted(() => vi.fn());
const chargeBatch = vi.hoisted(() => vi.fn());
const refund = vi.hoisted(() => vi.fn());
const send = vi.hoisted(() => vi.fn());
const createOutputs = vi.hoisted(() => vi.fn());
const createRevision = vi.hoisted(() => vi.fn());
const deleteOutputs = vi.hoisted(() => vi.fn());
const failOutput = vi.hoisted(() => vi.fn());
const refreshWork = vi.hoisted(() => vi.fn());
const setWorkStatus = vi.hoisted(() => vi.fn());
const getWork = vi.hoisted(() => vi.fn());
const createChild = vi.hoisted(() => vi.fn());
const createPackageChild = vi.hoisted(() => vi.fn());
const deleteChild = vi.hoisted(() => vi.fn());
const failChild = vi.hoisted(() => vi.fn());
const getChild = vi.hoisted(() => vi.fn());
const getPreviousChild = vi.hoisted(() => vi.fn());
const touchChild = vi.hoisted(() => vi.fn());
const getUsage = vi.hoisted(() => vi.fn());
const trackUsage = vi.hoisted(() => vi.fn());
const updateCampaign = vi.hoisted(() => vi.fn());
const recordAggregate = vi.hoisted(() => vi.fn());
const logLifecycle = vi.hoisted(() => vi.fn());
const logTerminal = vi.hoisted(() => vi.fn());
const logAggregate = vi.hoisted(() => vi.fn());

vi.mock("@/server/generation/canonical/charge", () => ({
  chargeForGeneration: chargeUnit,
  chargeForGenerationBatch: chargeBatch,
}));
vi.mock("@/server/billing/credits", () => ({ refundCredits: refund }));
vi.mock("@/server/jobs/client", () => ({ inngest: { send } }));
vi.mock("@/server/creative-work/job-telemetry", () => ({
  logCreativeWorkGenerationAggregate: logAggregate,
  logCreativeWorkGenerationLifecycle: logLifecycle,
  logCreativeWorkOutputTerminal: logTerminal,
}));
vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: getUsage,
  trackUsage,
}));
vi.mock("@/server/repositories/creative-work", () => ({
  createPlannedCreativeWorkOutputs: createOutputs,
  createCreativeWorkRevision: createRevision,
  deleteQueuedCreativeWorkOutputs: deleteOutputs,
  failQueuedCreativeWorkOutput: failOutput,
  refreshCreativeWorkStatus: refreshWork,
  recordCreativeWorkGenerationAggregate: recordAggregate,
  setCreativeWorkStatus: setWorkStatus,
  getCreativeWork: getWork,
}));
vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: createChild,
  createPackageChildIfAbsent: createPackageChild,
  deleteQueuedDerivation: deleteChild,
  failQueuedDerivation: failChild,
  getDerivationById: getChild,
  getLatestFormatAdaptationChild: getPreviousChild,
  touchQueuedDerivation: touchChild,
}));
vi.mock("@/server/repositories/campaign", () => ({ updateCampaign }));

import {
  assistantCreativeTripletSettlementAdapter,
  assistantGoalPackageSettlementAdapter,
  assistantPreviewSettlementAdapter,
  creativeWorkRevisionSettlementAdapter,
  creativeWorkSettlementAdapter,
  formatAdaptationSettlementAdapter,
} from "./settlement-adapters";
import { startGenerationSettlement } from "./settlement";

const work = { id: "work-1", status: "ready", generationCorrelationId: "generation-1" };
const outputs = ["a", "b", "c"].map((id) => ({
  id,
  status: "queued",
  generationCorrelationId: "generation-1",
}));
const source = {
  id: "source-1",
  campaignId: "campaign-1",
  planId: null,
  variantIndex: 0,
  ctaText: "Buy",
};
const child = {
  id: "child-1",
  status: "queued",
  updatedAt: new Date("2026-07-26T12:00:00.000Z"),
};
const originalChild = {
  id: "original-child",
  status: "completed",
  updatedAt: new Date("2026-07-26T12:00:01.000Z"),
};
const batch = {
  kind: "batch",
  authorship: { workspaceId: "workspace-1", userId: "user-1" },
  origin: "quick_tool",
  surface: "quick_tool",
  intent: { mode: "social_post", objective: "Sell" },
  parentId: "work-1",
  unitCount: 3,
  chargeAmount: 150,
  unitChargeAmount: 50,
  billingKey: "creative-work:work-1:initial",
  refundPolicy: "default",
} as const;

const revisionOutput = {
  id: "output-v2",
  status: "queued",
  generationCorrelationId: "generation-revision-1",
  failureCode: null,
  parentOutputId: "output-v1",
  revisionInstruction: "Use mais contraste",
};
const REVISION_KEY = "00000000-0000-4000-8000-000000000101";

function revisionAdapter() {
  return creativeWorkRevisionSettlementAdapter({
    workspaceId: "workspace-1",
    workItemId: "work-1",
    userId: "user-1",
    parentOutputId: "output-v1",
    revisionKey: REVISION_KEY,
    instruction: "Use mais contraste",
    revisionAssetId: null,
    objective: "Sell",
  });
}

function batchAdapter(existing?: { work: typeof work; outputs: typeof outputs }) {
  return creativeWorkSettlementAdapter({
    workspaceId: "workspace-1",
    workItemId: "work-1",
    userId: "user-1",
    readyWork: work as never,
    plans: [
      { creativeLevel: "conservative", targetFormat: "4:5", versionNumber: 1 },
      { creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1 },
      { creativeLevel: "bold", targetFormat: "4:5", versionNumber: 1 },
    ],
    batch,
    existing: existing as never,
  });
}

function unitAdapter(
  billingIdempotencyKey = "adapt:source-1",
  assistantActionId?: string,
) {
  return formatAdaptationSettlementAdapter({
    workspaceId: "workspace-1",
    userId: "user-1",
    targetFormat: "9:16",
    billingIdempotencyKey,
    assistantActionId,
    source: source as never,
  });
}

describe("Generation Settlement production adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chargeUnit.mockResolvedValue({ ok: true, creditsSpent: 5 });
    chargeBatch.mockResolvedValue({ ok: true, creditsSpent: 15 });
    refund.mockResolvedValue({ status: "refunded" });
    send.mockResolvedValue(undefined);
    createOutputs.mockResolvedValue({
      outputs,
      newlyCreatedIds: outputs.map((output) => output.id),
    });
    createRevision.mockResolvedValue({
      output: revisionOutput,
      claimedForDispatch: true,
    });
    failOutput.mockImplementation(async (_ws, _work, outputId) => ({
      ...(outputs.find((output) => output.id === outputId) ?? revisionOutput),
      id: outputId,
      status: "failed",
      failureCode: "dispatch_failed",
    }));
    refreshWork.mockResolvedValue("failed");
    setWorkStatus.mockResolvedValue({ ...work, status: "generating" });
    getWork.mockResolvedValue({
      work: { ...work, status: "generating" },
      outputs,
    });
    recordAggregate.mockResolvedValue(null);
    createChild.mockResolvedValue(child);
    failChild.mockResolvedValue({ ...child, status: "failed" });
    getPreviousChild.mockResolvedValue(null);
    touchChild.mockResolvedValue({ ...child, updatedAt: originalChild.updatedAt });
    getChild.mockResolvedValue(originalChild);
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) =>
      idempotencyKey.endsWith(":dispatch-refund")
        ? null
        : {
            metadata: {
              derivationId: originalChild.id,
              reservationUpdatedAt: "2026-07-26T12:00:00.000Z",
            },
          },
    );
    trackUsage.mockResolvedValue({ id: "usage-event" });
    updateCampaign.mockResolvedValue(undefined);
  });

  it("settles successful batch and unit claims through one contract", async () => {
    const [batchResult, unitResult] = await Promise.all([
      startGenerationSettlement(batchAdapter()),
      startGenerationSettlement(unitAdapter()),
    ]);

    expect(batchResult.ok).toBe(true);
    expect(unitResult.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(trackUsage).toHaveBeenCalledWith(
      "workspace-1",
      "generation_dispatch_ack",
      0,
      expect.objectContaining({ creativeWorkId: "work-1" }),
      "creative-work:work-1:initial:dispatch-ack",
    );
    expect(trackUsage).toHaveBeenCalledWith(
      "workspace-1",
      "generation_dispatch_ack",
      0,
      expect.objectContaining({ derivationId: child.id }),
      "adapt:source-1:dispatch-ack",
    );
    expect(touchChild).toHaveBeenCalledWith(
      child.id,
      "workspace-1",
      child.updatedAt,
    );
    expect(chargeUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: { mode: "format_adaptation", objective: null },
        cost: { chargeAmount: 50, refundPolicy: "default" },
        destination: expect.objectContaining({
          kind: "derivation",
          id: child.id,
        }),
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          settlementDispatchAckRequired: true,
          settlementDispatchAckKey: "adapt:source-1:dispatch-ack",
        }),
      }),
    );
    expect(chargeBatch).toHaveBeenCalledWith(
      batch,
      expect.objectContaining({
        metadata: expect.objectContaining({
          settlementDispatchAckRequired: true,
          settlementDispatchAckKey:
            "creative-work:work-1:initial:dispatch-ack",
        }),
      }),
    );
  });

  it.each([
    ["batch", () => batchAdapter(), chargeBatch, deleteOutputs],
    ["unit", () => unitAdapter(), chargeUnit, deleteChild],
  ] as const)("releases a reserved %s when credits are insufficient", async (
    _kind,
    buildAdapter,
    charge,
    release,
  ) => {
    charge.mockResolvedValue({
      ok: false,
      status: 402,
      conversionPayload: { reason: "insufficient_credits" },
    });

    const result = await startGenerationSettlement(buildAdapter() as never);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "credit_blocked" },
    });
    expect(release).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it("joins an idempotent batch replay without charging or dispatching", async () => {
    createOutputs.mockResolvedValue({ outputs, newlyCreatedIds: [] });

    const result = await startGenerationSettlement(batchAdapter());

    expect(result.ok).toBe(true);
    expect(chargeBatch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("settles an existing failed batch replay through the shared contract", async () => {
    const failedOutputs = outputs.map((output) => ({
      ...output,
      status: "failed",
      failureCode: "dispatch_failed",
    }));
    getWork.mockResolvedValue({
      work: { ...work, status: "failed" },
      outputs: failedOutputs,
    });

    const result = await startGenerationSettlement(
      batchAdapter({
        work: { ...work, status: "failed" },
        outputs: failedOutputs as never,
      }),
    );

    expect(result).toMatchObject({ ok: true, value: { outputs: failedOutputs } });
    expect(chargeBatch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(refund).toHaveBeenCalledTimes(3);
  });

  it("recovers a queued batch replay from its recorded refund marker", async () => {
    getWork.mockResolvedValue({ work, outputs });
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) =>
      idempotencyKey === "creative-work:work-1:output:a:dispatch-refund"
        ? { id: "refund-a" }
        : null,
    );

    const result = await startGenerationSettlement(
      batchAdapter({ work, outputs }),
    );

    expect(result).toMatchObject({ ok: true, value: { outputs } });
    expect(refund).toHaveBeenCalledTimes(3);
    expect(send).not.toHaveBeenCalled();
  });

  it("settles a batch replay without ack when outputs already progressed", async () => {
    vi.useFakeTimers();
    getWork.mockResolvedValue({
      work: { ...work, status: "generating" },
      outputs: outputs.map((output) => ({ ...output, status: "processing" })),
    });
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === batch.billingKey) {
        return {
          metadata: {
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey: `${batch.billingKey}:dispatch-ack`,
          },
        };
      }
      return null;
    });

    const pending = startGenerationSettlement(
      batchAdapter({ work, outputs }),
    );
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pending;
    vi.useRealTimers();

    expect(result.ok).toBe(true);
    expect(refund).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(trackUsage).toHaveBeenCalledWith(
      "workspace-1",
      "generation_dispatch_ack",
      0,
      expect.objectContaining({ creativeWorkId: "work-1" }),
      `${batch.billingKey}:dispatch-ack`,
    );
  });

  it("resumes idempotent batch dispatch when charge exists but outputs stay queued", async () => {
    vi.useFakeTimers();
    getWork.mockResolvedValue({ work, outputs });
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === batch.billingKey) {
        return {
          metadata: {
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey: `${batch.billingKey}:dispatch-ack`,
          },
        };
      }
      return null;
    });

    const pending = startGenerationSettlement(
      batchAdapter({ work, outputs }),
    );
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pending;
    vi.useRealTimers();

    expect(result.ok).toBe(true);
    expect(refund).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      outputs.map((output) => ({
        id: `creative-work-generate:${output.id}`,
        name: "creative-work.generate",
        data: {
          workspaceId: "workspace-1",
          workItemId: "work-1",
          outputId: output.id,
          generationCorrelationId: "generation-1",
        },
      })),
    );
  });

  it("settles a batch replay with its durable dispatch acknowledgement", async () => {
    getWork.mockResolvedValue({ work, outputs });
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === batch.billingKey) {
        return {
          metadata: {
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey: `${batch.billingKey}:dispatch-ack`,
          },
        };
      }
      return idempotencyKey === `${batch.billingKey}:dispatch-ack`
        ? { id: "batch-ack" }
        : null;
    });

    const result = await startGenerationSettlement(
      batchAdapter({ work, outputs }),
    );

    expect(result.ok).toBe(true);
    expect(setWorkStatus).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      "generating",
    );
    expect(refund).not.toHaveBeenCalled();
  });

  it("resolves an idempotent unit replay to the original derivation", async () => {
    chargeUnit.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });

    const result = await startGenerationSettlement(unitAdapter());

    expect(result).toMatchObject({
      ok: true,
      value: { derivation: originalChild },
    });
    expect(deleteChild).toHaveBeenCalledWith(child.id, "workspace-1");
    expect(send).not.toHaveBeenCalled();
  });

  it("settles a progressed unit replay without a required dispatch acknowledgement", async () => {
    vi.useFakeTimers();
    chargeUnit.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockResolvedValue({
      ...originalChild,
      status: "processing",
    });
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "adapt:source-1") {
        return {
          metadata: {
            derivationId: originalChild.id,
            reservationUpdatedAt: child.updatedAt.toISOString(),
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey: "adapt:source-1:dispatch-ack",
          },
        };
      }
      return null;
    });

    const pending = startGenerationSettlement(unitAdapter());
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pending;
    vi.useRealTimers();

    expect(result).toMatchObject({
      ok: true,
      value: {
        derivation: expect.objectContaining({ id: originalChild.id }),
      },
    });
    expect(refund).not.toHaveBeenCalled();
    expect(deleteChild).toHaveBeenCalledWith(child.id, "workspace-1");
  });

  it("settles a unit replay with its durable dispatch acknowledgement", async () => {
    chargeUnit.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockResolvedValue(child);
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "adapt:source-1") {
        return {
          metadata: {
            derivationId: child.id,
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey: "adapt:source-1:dispatch-ack",
          },
        };
      }
      return idempotencyKey === "adapt:source-1:dispatch-ack"
        ? { id: "unit-ack" }
        : null;
    });

    const result = await startGenerationSettlement(unitAdapter());

    expect(result.ok).toBe(true);
    expect(updateCampaign).toHaveBeenCalledWith(
      "campaign-1",
      "workspace-1",
      { status: "generating" },
    );
    expect(refund).not.toHaveBeenCalled();
  });

  it("retries the public campaign status before settling a unit replay", async () => {
    updateCampaign
      .mockRejectedValueOnce(new Error("campaign database down"))
      .mockResolvedValueOnce(undefined);

    await expect(
      startGenerationSettlement(unitAdapter()),
    ).rejects.toThrow("campaign database down");
    expect(touchChild).toHaveBeenCalledWith(
      child.id,
      "workspace-1",
      child.updatedAt,
    );

    chargeUnit.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockResolvedValue({
      ...originalChild,
      status: "processing",
    });

    const replay = await startGenerationSettlement(unitAdapter());

    expect(replay.ok).toBe(true);
    expect(updateCampaign).toHaveBeenCalledTimes(2);
  });

  it("replays a failed unit as dispatch_failed and retries its refund", async () => {
    chargeUnit.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockResolvedValue({ ...originalChild, status: "failed" });

    const result = await startGenerationSettlement(unitAdapter());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "dispatch_failed", compensated: true },
    });
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "adapt:source-1:dispatch-refund",
      }),
    );
  });

  it("does not refund a terminal unit failure after dispatch was acknowledged", async () => {
    chargeUnit.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockResolvedValue({ ...originalChild, status: "failed" });
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "adapt:source-1") {
        return {
          metadata: {
            derivationId: originalChild.id,
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey: "adapt:source-1:dispatch-ack",
          },
        };
      }
      return idempotencyKey === "adapt:source-1:dispatch-ack"
        ? { id: "unit-ack" }
        : null;
    });

    const result = await startGenerationSettlement(unitAdapter());

    expect(result.ok).toBe(true);
    expect(refund).not.toHaveBeenCalled();
  });

  it("waits for a late unit ack instead of refunding a fast terminal failure", async () => {
    chargeUnit.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockResolvedValue({ ...originalChild, status: "failed" });
    let ackReads = 0;
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "adapt:source-1") {
        return {
          metadata: {
            derivationId: originalChild.id,
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey: "adapt:source-1:dispatch-ack",
          },
        };
      }
      if (idempotencyKey === "adapt:source-1:dispatch-ack") {
        ackReads += 1;
        return ackReads >= 3 ? { id: "late-unit-ack" } : null;
      }
      return null;
    });

    const result = await startGenerationSettlement(unitAdapter());

    expect(result.ok).toBe(true);
    expect(ackReads).toBeGreaterThanOrEqual(3);
    expect(refund).not.toHaveBeenCalled();
  });

  it("compensates when a durable unit dispatch refund appears during ack wait", async () => {
    chargeUnit.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockResolvedValue({ ...originalChild, status: "failed" });
    let refundReads = 0;
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "adapt:source-1") {
        return {
          metadata: {
            derivationId: originalChild.id,
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey: "adapt:source-1:dispatch-ack",
          },
        };
      }
      if (idempotencyKey.endsWith(":dispatch-refund")) {
        refundReads += 1;
        return refundReads >= 3 ? { id: "late-unit-refund" } : null;
      }
      return null;
    });

    const result = await startGenerationSettlement(unitAdapter());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "dispatch_failed", compensated: true },
    });
    expect(refundReads).toBeGreaterThanOrEqual(3);
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "adapt:source-1:dispatch-refund",
      }),
    );
    expect(send).not.toHaveBeenCalled();
    expect(trackUsage).not.toHaveBeenCalled();
  });

  it("keeps a failed unit unresolved after timeout without minting a synthetic ack", async () => {
    vi.useFakeTimers();
    try {
      chargeUnit.mockResolvedValue({
        ok: true,
        creditsSpent: 0,
        duplicate: true,
      });
      getChild.mockResolvedValue({ ...originalChild, status: "failed" });
      getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
        if (idempotencyKey === "adapt:source-1") {
          return {
            metadata: {
              derivationId: originalChild.id,
              settlementDispatchAckRequired: true,
              settlementDispatchAckKey: "adapt:source-1:dispatch-ack",
            },
          };
        }
        return null;
      });

      const pending = startGenerationSettlement(unitAdapter());
      const expectation = expect(pending).rejects.toThrow(
        "generation_settlement_dispatch_uncertain",
      );
      await vi.runAllTimersAsync();
      await expectation;
      expect(refund).not.toHaveBeenCalled();
      expect(trackUsage).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("recovers a queued unit replay from its recorded refund marker", async () => {
    chargeUnit.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockResolvedValue(child);
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) =>
      idempotencyKey.endsWith(":dispatch-refund")
        ? { id: "unit-refund" }
        : {
            metadata: {
              derivationId: child.id,
              reservationUpdatedAt: child.updatedAt.toISOString(),
            },
          },
    );

    const result = await startGenerationSettlement(unitAdapter());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "dispatch_failed", compensated: true },
    });
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "adapt:source-1:dispatch-refund",
      }),
    );
  });

  it("lets only one concurrent batch claim charge and dispatch", async () => {
    let claimed = false;
    createOutputs.mockImplementation(async () => ({
      outputs,
      newlyCreatedIds: claimed
        ? []
        : ((claimed = true), outputs.map((output) => output.id)),
    }));

    await Promise.all([
      startGenerationSettlement(batchAdapter()),
      startGenerationSettlement(batchAdapter()),
    ]);

    expect(chargeBatch).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
  });

  it("does not report a concurrent batch join as settled when the owner is blocked", async () => {
    const blocked = {
      ok: false,
      status: 402,
      conversionPayload: { reason: "insufficient_credits" },
    };
    let reserveCalls = 0;
    createOutputs.mockImplementation(async () => {
      reserveCalls += 1;
      return {
        outputs,
        newlyCreatedIds:
          reserveCalls === 2
            ? []
            : outputs.map((output) => output.id),
      };
    });
    chargeBatch.mockResolvedValue(blocked);
    getUsage.mockResolvedValue(null);
    getWork.mockImplementation(async () =>
      deleteOutputs.mock.calls.length > 0
        ? { work, outputs: [] }
        : { work, outputs },
    );

    const [owner, joiner] = await Promise.all([
      startGenerationSettlement(batchAdapter()),
      startGenerationSettlement(batchAdapter()),
    ]);

    expect(owner).toMatchObject({
      ok: false,
      error: { code: "credit_blocked" },
    });
    expect(joiner).toMatchObject({
      ok: false,
      error: { code: "credit_blocked" },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns dispatch_failed to both concurrent batch callers when dispatch fails", async () => {
    let claimed = false;
    createOutputs.mockImplementation(async () => ({
      outputs,
      newlyCreatedIds: claimed
        ? []
        : ((claimed = true), outputs.map((output) => output.id)),
    }));
    send.mockRejectedValue(new Error("transport down"));
    getWork.mockImplementation(async () => {
      const failed = failOutput.mock.calls.length > 0;
      return {
        work: { ...work, status: failed ? "failed" : "ready" },
        outputs: outputs.map((output) =>
          failed
            ? { ...output, status: "failed", failureCode: "dispatch_failed" }
            : output,
        ),
      };
    });

    const results = await Promise.all([
      startGenerationSettlement(batchAdapter()),
      startGenerationSettlement(batchAdapter()),
    ]);

    expect(results).toEqual([
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "dispatch_failed" }),
      }),
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "dispatch_failed" }),
      }),
    ]);
  });

  it("emits terminal and aggregate telemetry after dispatch compensation", async () => {
    send.mockRejectedValue(new Error("transport down"));
    recordAggregate.mockResolvedValue({
      generationCorrelationId: "generation-1",
      unitCount: 3,
      terminalCount: 3,
      successCount: 0,
      failureCount: 3,
      result: "failed",
      firstTerminalAt: "2026-07-28T12:00:00.000Z",
      completedAt: "2026-07-28T12:00:01.000Z",
      timeToFirstOutputMs: 100,
      totalDurationMs: 1000,
      firstTerminalEmitted: true,
      completionEmitted: true,
    });

    const result = await startGenerationSettlement(batchAdapter());

    expect(result).toMatchObject({ ok: false, error: { code: "dispatch_failed" } });
    expect(logTerminal).toHaveBeenCalledTimes(3);
    expect(logTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        outputId: "a",
        generationCorrelationId: "generation-1",
        outcome: "failed",
        failureCode: "dispatch_failed",
        refunded: true,
        unitCount: 3,
      }),
    );
    expect(logAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "first_terminal", unitCount: 3 }),
    );
    expect(logAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "completed", result: "failed" }),
    );
  });

  it("lets billing idempotency select one concurrent unit dispatch", async () => {
    let charged = false;
    createChild
      .mockResolvedValueOnce(child)
      .mockResolvedValueOnce({ ...child, id: "child-2" });
    chargeUnit.mockImplementation(async () =>
      charged
        ? { ok: true, creditsSpent: 0, duplicate: true }
        : ((charged = true), { ok: true, creditsSpent: 5 }),
    );

    await Promise.all([
      startGenerationSettlement(unitAdapter()),
      startGenerationSettlement(unitAdapter()),
    ]);

    expect(chargeUnit).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledOnce();
    expect(deleteChild).toHaveBeenCalledOnce();
  });

  it("returns dispatch_failed to both concurrent unit callers when dispatch fails", async () => {
    let charged = false;
    createChild
      .mockResolvedValueOnce(child)
      .mockResolvedValueOnce({ ...child, id: "child-2" });
    chargeUnit.mockImplementation(async () =>
      charged
        ? { ok: true, creditsSpent: 0, duplicate: true }
        : ((charged = true), { ok: true, creditsSpent: 5 }),
    );
    getUsage.mockResolvedValue({
      metadata: {
        derivationId: child.id,
        reservationUpdatedAt: child.updatedAt.toISOString(),
      },
    });
    getChild.mockResolvedValue({ ...child, status: "failed" });
    send.mockRejectedValue(new Error("transport down"));

    const results = await Promise.all([
      startGenerationSettlement(unitAdapter()),
      startGenerationSettlement(unitAdapter()),
    ]);

    expect(results).toEqual([
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "dispatch_failed" }),
      }),
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "dispatch_failed" }),
      }),
    ]);
  });

  it("keeps distinct assistant actions on distinct unit jobs", async () => {
    createChild
      .mockResolvedValueOnce(child)
      .mockResolvedValueOnce({ ...child, id: "child-2" });

    await Promise.all([
      startGenerationSettlement(unitAdapter("action-1", "action-1")),
      startGenerationSettlement(unitAdapter("action-2", "action-2")),
    ]);

    expect(chargeUnit).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("refunds every failed batch claim for a net-zero dispatch failure", async () => {
    send.mockRejectedValue(new Error("transport down"));

    const result = await startGenerationSettlement(batchAdapter());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "dispatch_failed", compensated: true },
    });
    expect(refund).toHaveBeenCalledTimes(3);
    expect(
      refund.mock.calls.reduce(
        (total, [input]) => total + (input.amount ?? 0),
        0,
      ),
    ).toBe(batch.chargeAmount);
  });

  it("refunds the full batch when one failure marker cannot be persisted", async () => {
    send.mockRejectedValue(new Error("transport down"));
    failOutput.mockImplementation(async (_ws, _work, outputId) => {
      if (outputId === "b") throw new Error("database down");
      return {
        ...outputs.find((output) => output.id === outputId),
        status: "failed",
        failureCode: "dispatch_failed",
      };
    });

    const result = await startGenerationSettlement(batchAdapter());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "dispatch_failed", compensated: true },
    });
    expect(refund).toHaveBeenCalledTimes(3);
  });

  it("refunds a rejected unit dispatch only after queued-to-failed CAS", async () => {
    send.mockRejectedValue(new Error("transport down"));

    await startGenerationSettlement(unitAdapter());

    expect(failChild).toHaveBeenCalledWith(child.id, "workspace-1");
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 50 }),
    );
  });

  it("refunds a unit dispatch failure even when the failure marker loses its claim", async () => {
    send.mockRejectedValue(new Error("ambiguous response"));
    failChild.mockResolvedValue(null);

    await startGenerationSettlement(unitAdapter());

    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "adapt:source-1:dispatch-refund",
      }),
    );
  });

  it("refunds a unit dispatch failure when failure persistence crashes", async () => {
    send.mockRejectedValue(new Error("transport down"));
    failChild.mockRejectedValue(new Error("database down"));

    const result = await startGenerationSettlement(unitAdapter());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "dispatch_failed", compensated: true },
    });
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "adapt:source-1:dispatch-refund",
      }),
    );
  });

  it("settles a creative work revision through charge, dispatch, and ack", async () => {
    const result = await startGenerationSettlement(revisionAdapter());

    expect(result).toEqual({ ok: true, value: { output: revisionOutput } });
    expect(createRevision).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      REVISION_KEY,
      "output-v1",
      "Use mais contraste",
      null,
    );
    expect(chargeBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        unitCount: 1,
        chargeAmount: 50,
        billingKey: "creative-work:work-1:revision:output-v2",
        intent: { mode: "creative_revision", objective: "Sell" },
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          revisionOf: "output-v1",
          settlementDispatchAckRequired: true,
          settlementDispatchAckKey:
            "creative-work:work-1:revision:output-v2:dispatch-ack",
        }),
      }),
    );
    expect(send).toHaveBeenCalledWith({
      id: "creative-work-revision:output-v2",
      name: "creative-work.generate",
      data: {
        workspaceId: "workspace-1",
        workItemId: "work-1",
        outputId: "output-v2",
        generationCorrelationId: "generation-revision-1",
      },
    });
    expect(trackUsage).toHaveBeenCalledWith(
      "workspace-1",
      "generation_dispatch_ack",
      0,
      expect.objectContaining({ outputId: "output-v2" }),
      "creative-work:work-1:revision:output-v2:dispatch-ack",
    );
    expect(logLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      event: "creative_work_generation_requested",
      generationCorrelationId: "generation-revision-1",
      unitCount: 1,
      outputIds: ["output-v2"],
      credits: 50,
    }));
    expect(logLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      event: "creative_work_generation_dispatched",
      generationCorrelationId: "generation-revision-1",
      unitCount: 1,
      outputIds: ["output-v2"],
      result: "sent",
      dispatchDurationMs: expect.any(Number),
    }));
  });

  it("keeps a successful revision result when dispatch ack persistence fails", async () => {
    trackUsage.mockRejectedValue(new Error("usage write failed"));

    const result = await startGenerationSettlement(revisionAdapter());

    expect(result).toEqual({ ok: true, value: { output: revisionOutput } });
    expect(send).toHaveBeenCalledOnce();
    expect(refund).not.toHaveBeenCalled();
  });

  it("resumes idempotent revision dispatch on replay after a lost acknowledgement", async () => {
    vi.useFakeTimers();
    trackUsage.mockRejectedValueOnce(new Error("usage write failed"));
    const first = await startGenerationSettlement(revisionAdapter());
    expect(first).toEqual({ ok: true, value: { output: revisionOutput } });

    createRevision.mockResolvedValue({
      output: revisionOutput,
      claimedForDispatch: false,
    });
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "creative-work:work-1:revision:output-v2") {
        return {
          metadata: {
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey:
              "creative-work:work-1:revision:output-v2:dispatch-ack",
          },
        };
      }
      return null;
    });
    getWork.mockResolvedValue({
      work,
      outputs: [revisionOutput],
    });
    trackUsage.mockResolvedValue({ id: "ack-retry" });

    const pending = startGenerationSettlement(revisionAdapter());
    await vi.advanceTimersByTimeAsync(2_000);
    const replay = await pending;
    vi.useRealTimers();

    expect(replay).toEqual({ ok: true, value: { output: revisionOutput } });
    expect(chargeBatch).toHaveBeenCalledOnce();
    // First claim dispatched; replay resumes with the same durable event id.
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, {
      id: "creative-work-revision:output-v2",
      name: "creative-work.generate",
      data: {
        workspaceId: "workspace-1",
        workItemId: "work-1",
        outputId: "output-v2",
        generationCorrelationId: "generation-revision-1",
      },
    });
    expect(send).toHaveBeenNthCalledWith(2, {
      id: "creative-work-revision:output-v2",
      name: "creative-work.generate",
      data: {
        workspaceId: "workspace-1",
        workItemId: "work-1",
        outputId: "output-v2",
        generationCorrelationId: "generation-revision-1",
      },
    });
    expect(refund).not.toHaveBeenCalled();
  });

  it("does not re-dispatch a progressed revision when only the ack is missing", async () => {
    vi.useFakeTimers();
    createRevision.mockResolvedValue({
      output: { ...revisionOutput, status: "processing" },
      claimedForDispatch: false,
    });
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "creative-work:work-1:revision:output-v2") {
        return {
          metadata: {
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey:
              "creative-work:work-1:revision:output-v2:dispatch-ack",
          },
        };
      }
      return null;
    });
    getWork.mockResolvedValue({
      work,
      outputs: [{ ...revisionOutput, status: "processing" }],
    });

    const pending = startGenerationSettlement(revisionAdapter());
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pending;
    vi.useRealTimers();

    expect(result).toEqual({
      ok: true,
      value: { output: { ...revisionOutput, status: "processing" } },
    });
    expect(send).not.toHaveBeenCalled();
    expect(chargeBatch).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
  });

  it("does not refund when recovery re-send fails for a still-queued revision", async () => {
    vi.useFakeTimers();
    createRevision.mockResolvedValue({
      output: revisionOutput,
      claimedForDispatch: false,
    });
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "creative-work:work-1:revision:output-v2") {
        return {
          metadata: {
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey:
              "creative-work:work-1:revision:output-v2:dispatch-ack",
          },
        };
      }
      return null;
    });
    getWork.mockResolvedValue({ work, outputs: [revisionOutput] });
    send.mockRejectedValue(new Error("transport down"));

    const pending = startGenerationSettlement(revisionAdapter());
    const expectation = expect(pending).rejects.toThrow(
      "generation_settlement_dispatch_uncertain",
    );
    await vi.advanceTimersByTimeAsync(2_000);
    await expectation;
    vi.useRealTimers();

    expect(refund).not.toHaveBeenCalled();
    expect(failOutput).not.toHaveBeenCalled();
    expect(chargeBatch).not.toHaveBeenCalled();
  });

  it("resumes idempotent format dispatch when charge exists but child stays queued", async () => {
    vi.useFakeTimers();
    chargeUnit.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockResolvedValue({ ...child, status: "queued" });
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "adapt:source-1") {
        return {
          metadata: {
            derivationId: child.id,
            reservationUpdatedAt: child.updatedAt.toISOString(),
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey: "adapt:source-1:dispatch-ack",
          },
        };
      }
      return null;
    });

    const pending = startGenerationSettlement(unitAdapter());
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pending;
    vi.useRealTimers();

    expect(result).toMatchObject({
      ok: true,
      value: { derivation: expect.objectContaining({ id: child.id }) },
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `format-adaptation:${child.id}`,
        name: "derivation.generate",
      }),
    );
    expect(refund).not.toHaveBeenCalled();
    expect(deleteChild).toHaveBeenCalledWith(child.id, "workspace-1");
  });

  it("does not refund when format recovery re-send fails while still queued", async () => {
    vi.useFakeTimers();
    chargeUnit.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockResolvedValue({ ...child, status: "queued" });
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "adapt:source-1") {
        return {
          metadata: {
            derivationId: child.id,
            reservationUpdatedAt: child.updatedAt.toISOString(),
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey: "adapt:source-1:dispatch-ack",
          },
        };
      }
      return null;
    });
    send.mockRejectedValue(new Error("transport down"));

    const pending = startGenerationSettlement(unitAdapter());
    const expectation = expect(pending).rejects.toThrow(
      "generation_settlement_dispatch_uncertain",
    );
    await vi.advanceTimersByTimeAsync(2_000);
    await expectation;
    vi.useRealTimers();

    expect(refund).not.toHaveBeenCalled();
    expect(failChild).not.toHaveBeenCalled();
  });

  it("marks a credit-blocked revision failed without dispatch", async () => {
    chargeBatch.mockResolvedValue({
      ok: false,
      status: 402,
      conversionPayload: { reason: "insufficient_credits" },
    });

    const result = await startGenerationSettlement(revisionAdapter());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "credit_blocked" },
    });
    expect(failOutput).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      "output-v2",
      "credit_blocked",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("refunds a failed revision dispatch exactly once across repeated handling", async () => {
    send.mockRejectedValue(new Error("transport down"));
    const failed = {
      ...revisionOutput,
      status: "failed",
      failureCode: "dispatch_failed",
    };
    failOutput.mockResolvedValue(failed);
    createRevision
      .mockResolvedValueOnce({
        output: revisionOutput,
        claimedForDispatch: true,
      })
      .mockResolvedValue({
        output: failed,
        claimedForDispatch: false,
      });
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey.endsWith(":dispatch-refund") && refund.mock.calls.length > 0) {
        return { id: "refund-usage" };
      }
      return null;
    });

    const first = await startGenerationSettlement(revisionAdapter());
    const second = await startGenerationSettlement(revisionAdapter());

    expect(first).toMatchObject({
      ok: false,
      error: { code: "dispatch_failed", compensated: true },
    });
    expect(second).toMatchObject({
      ok: false,
      error: { code: "dispatch_failed", compensated: true },
    });
    expect(refund).toHaveBeenCalledTimes(2);
    expect(refund).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        amount: 50,
        idempotencyKey:
          "creative-work:work-1:revision:output-v2:dispatch-refund",
      }),
    );
    expect(refund).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        idempotencyKey:
          "creative-work:work-1:revision:output-v2:dispatch-refund",
      }),
    );
    expect(send).toHaveBeenCalledOnce();
    expect(failOutput).toHaveBeenCalledOnce();
  });

  it("allows only one concurrent revision claimer to charge and dispatch", async () => {
    getUsage.mockResolvedValue(null);
    let calls = 0;
    let claimed = false;
    let release!: () => void;
    const bothEntered = new Promise<void>((resolve) => {
      release = resolve;
    });
    createRevision.mockImplementation(async () => {
      calls += 1;
      if (calls === 2) release();
      await bothEntered;
      if (!claimed) {
        claimed = true;
        return { output: revisionOutput, claimedForDispatch: true };
      }
      return { output: revisionOutput, claimedForDispatch: false };
    });

    const results = await Promise.all([
      startGenerationSettlement(revisionAdapter()),
      startGenerationSettlement(revisionAdapter()),
    ]);

    expect(results).toEqual([
      { ok: true, value: { output: revisionOutput } },
      { ok: true, value: { output: revisionOutput } },
    ]);
    expect(chargeBatch).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
  });
});

const tripletDerivations = ["t1", "t2", "t3"].map((id, index) => ({
  id,
  status: "queued",
  creativeLevel: ["conservative", "balanced", "bold"][index],
  format: "1:1",
  updatedAt: new Date("2026-07-26T12:00:00.000Z"),
}));

const packageChildren = ["4:5", "9:16", "16:9"].map((format, index) => ({
  id: `pkg-${index + 1}`,
  status: "queued",
  format,
  updatedAt: new Date("2026-07-26T12:00:00.000Z"),
}));

const previewDerivation = {
  id: "preview-1",
  status: "queued",
  updatedAt: new Date("2026-07-26T12:00:00.000Z"),
};

function tripletAdapter() {
  return assistantCreativeTripletSettlementAdapter({
    workspaceId: "workspace-1",
    userId: "user-1",
    campaignId: "campaign-1",
    actionId: "action-triplet",
    format: "1:1",
    planVersionId: "plan-1",
    goalRunId: "goal-1",
    locale: "pt-BR",
    amount: 150,
    unitChargeAmount: 50,
  });
}

function goalPackageAdapter() {
  return assistantGoalPackageSettlementAdapter({
    workspaceId: "workspace-1",
    userId: "user-1",
    campaignId: "campaign-1",
    actionId: "action-package",
    baseDerivation: {
      id: "base-1",
      ctaText: "Buy",
      creativeLevel: "balanced",
    } as never,
    formats: ["4:5", "9:16", "16:9"],
    planVersionId: "plan-1",
    goalRunId: "goal-1",
    locale: "pt-BR",
    amount: 150,
    unitChargeAmount: 50,
  });
}

function previewAdapter() {
  return assistantPreviewSettlementAdapter({
    workspaceId: "workspace-1",
    userId: "user-1",
    campaignId: "campaign-1",
    actionId: "action-preview",
    planId: "plan-1",
    format: "1:1",
    ctaText: "Buy now",
    styleAssetId: null,
    locale: "pt-BR",
  });
}

describe("Assistant generation settlement adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chargeUnit.mockResolvedValue({ ok: true, creditsSpent: 5 });
    chargeBatch.mockResolvedValue({ ok: true, creditsSpent: 15 });
    refund.mockResolvedValue({ status: "refunded" });
    send.mockResolvedValue(undefined);
    let tripletIndex = 0;
    createChild.mockImplementation(async (data: { isPreview?: boolean }) => {
      if (data.isPreview) return previewDerivation;
      const row = tripletDerivations[tripletIndex] ?? tripletDerivations[0];
      tripletIndex += 1;
      return row;
    });
    createPackageChild.mockImplementation(async (data: { format: string }) => {
      const child =
        packageChildren.find((row) => row.format === data.format) ??
        packageChildren[0]!;
      return { child, created: true };
    });
    failChild.mockImplementation(async (id: string) => ({
      id,
      status: "failed",
    }));
    getChild.mockResolvedValue(previewDerivation);
    getUsage.mockResolvedValue(null);
    trackUsage.mockResolvedValue({ id: "usage-event" });
    updateCampaign.mockResolvedValue(undefined);
  });

  it("settles creative triplet batch with one charge and multi-send", async () => {
    const result = await startGenerationSettlement(tripletAdapter());

    expect(result.ok).toBe(true);
    expect(createChild).toHaveBeenCalledTimes(3);
    expect(chargeBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        chargeAmount: 150,
        billingKey: "assistant-action:action-triplet:creative-triplet",
        intent: { mode: "art_variation", objective: null },
      }),
      expect.objectContaining({
        action: "image_derivation",
        metadata: expect.objectContaining({
          settlementDispatchAckRequired: true,
          derivationIds: ["t1", "t2", "t3"],
        }),
      }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "assistant-creative-triplet:t1",
          data: expect.objectContaining({
            refundPolicy: "none",
            generationMode: "art_variation",
            assistantActionId: "action-triplet",
          }),
        }),
      ]),
    );
    expect(updateCampaign).toHaveBeenCalledWith(
      "campaign-1",
      "workspace-1",
      { status: "generating" },
    );
  });

  it("refunds creative triplet once on synchronous dispatch failure", async () => {
    send.mockRejectedValueOnce(new Error("dispatch failed"));

    const result = await startGenerationSettlement(tripletAdapter());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "dispatch_failed", compensated: true },
    });
    expect(failChild).toHaveBeenCalledTimes(3);
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "image_derivation",
        amount: 150,
        idempotencyKey:
          "assistant-action:action-triplet:creative-triplet:dispatch-refund",
      }),
    );
  });

  it("blocks creative triplet charge and releases reserved rows", async () => {
    chargeBatch.mockResolvedValueOnce({
      ok: false,
      conversionPayload: { reason: "insufficient_credits" },
    });

    const result = await startGenerationSettlement(tripletAdapter());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "credit_blocked" },
    });
    expect(deleteChild).toHaveBeenCalledTimes(3);
    expect(send).not.toHaveBeenCalled();
  });

  it("settles goal package with delivery_package_child action", async () => {
    const result = await startGenerationSettlement(goalPackageAdapter());

    expect(result.ok).toBe(true);
    expect(createPackageChild).toHaveBeenCalledTimes(3);
    expect(chargeBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        chargeAmount: 150,
        billingKey: "assistant-action:action-package:goal-package",
      }),
      expect.objectContaining({
        action: "delivery_package_child",
      }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            generationMode: "format_adaptation",
            refundPolicy: "none",
          }),
        }),
      ]),
    );
  });

  it("refunds goal package once on synchronous dispatch failure", async () => {
    send.mockRejectedValueOnce(new Error("dispatch failed"));

    const result = await startGenerationSettlement(goalPackageAdapter());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "dispatch_failed", compensated: true },
    });
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delivery_package_child",
        amount: 150,
        idempotencyKey:
          "assistant-action:action-package:goal-package:dispatch-refund",
      }),
    );
  });

  it("settles assistant preview unit generation", async () => {
    const result = await startGenerationSettlement(previewAdapter());

    expect(result).toMatchObject({
      ok: true,
      value: { derivation: previewDerivation },
    });
    expect(chargeUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: { mode: "art_variation", objective: null },
        cost: { chargeAmount: 50, refundPolicy: "default" },
        idempotency: expect.objectContaining({
          billingKey: "assistant-action:action-preview:preview",
        }),
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          preview: true,
          settlementDispatchAckRequired: true,
        }),
      }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "assistant-preview:preview-1",
        data: expect.objectContaining({
          isPreview: true,
          assistantActionId: "action-preview",
        }),
      }),
    );
  });

  it("refunds assistant preview once on synchronous dispatch failure", async () => {
    send.mockRejectedValueOnce(new Error("dispatch failed"));

    const result = await startGenerationSettlement(previewAdapter());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "dispatch_failed", compensated: true },
    });
    expect(failChild).toHaveBeenCalledWith("preview-1", "workspace-1");
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "image_derivation",
        amount: 50,
        idempotencyKey:
          "assistant-action:action-preview:preview:dispatch-refund",
      }),
    );
  });

  it("resolves an idempotent preview replay to the original derivation", async () => {
    chargeUnit.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockResolvedValue({
      ...previewDerivation,
      status: "completed",
    });
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "assistant-action:action-preview:preview") {
        return {
          metadata: {
            derivationId: previewDerivation.id,
            reservationUpdatedAt: previewDerivation.updatedAt.toISOString(),
          },
        };
      }
      return null;
    });

    const result = await startGenerationSettlement(previewAdapter());

    expect(result).toMatchObject({
      ok: true,
      value: {
        derivation: expect.objectContaining({ id: previewDerivation.id }),
      },
    });
    expect(deleteChild).toHaveBeenCalledWith(
      previewDerivation.id,
      "workspace-1",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("does not refund a terminal triplet failure after dispatch was acknowledged", async () => {
    chargeBatch.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockImplementation(async (id: string) => ({
      id,
      status: "failed",
      updatedAt: new Date("2026-07-26T12:00:01.000Z"),
    }));
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (
        idempotencyKey ===
        "assistant-action:action-triplet:creative-triplet"
      ) {
        return {
          metadata: {
            derivationIds: ["t1", "t2", "t3"],
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey:
              "assistant-action:action-triplet:creative-triplet:dispatch-ack",
          },
        };
      }
      return idempotencyKey.endsWith(":dispatch-ack")
        ? { id: "triplet-ack" }
        : null;
    });

    const result = await startGenerationSettlement(tripletAdapter());

    expect(result.ok).toBe(true);
    expect(refund).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("waits for a late dispatch ack instead of refunding a fast terminal failure", async () => {
    chargeBatch.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockImplementation(async (id: string) => ({
      id,
      status: "failed",
      updatedAt: new Date("2026-07-26T12:00:01.000Z"),
    }));
    let ackReads = 0;
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (
        idempotencyKey ===
        "assistant-action:action-triplet:creative-triplet"
      ) {
        return {
          metadata: {
            derivationIds: ["t1", "t2", "t3"],
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey:
              "assistant-action:action-triplet:creative-triplet:dispatch-ack",
          },
        };
      }
      if (idempotencyKey.endsWith(":dispatch-ack")) {
        ackReads += 1;
        return ackReads >= 3 ? { id: "late-ack" } : null;
      }
      return null;
    });

    const result = await startGenerationSettlement(tripletAdapter());

    expect(result.ok).toBe(true);
    expect(ackReads).toBeGreaterThanOrEqual(3);
    expect(refund).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("compensates when a durable triplet dispatch refund appears during ack wait", async () => {
    chargeBatch.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockImplementation(async (id: string) => ({
      id,
      status: "failed",
      updatedAt: new Date("2026-07-26T12:00:01.000Z"),
    }));
    let refundReads = 0;
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (
        idempotencyKey ===
        "assistant-action:action-triplet:creative-triplet"
      ) {
        return {
          metadata: {
            derivationIds: ["t1", "t2", "t3"],
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey:
              "assistant-action:action-triplet:creative-triplet:dispatch-ack",
          },
        };
      }
      if (idempotencyKey.endsWith(":dispatch-refund")) {
        refundReads += 1;
        return refundReads >= 3 ? { id: "late-triplet-refund" } : null;
      }
      return null;
    });

    const result = await startGenerationSettlement(tripletAdapter());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "dispatch_failed", compensated: true },
    });
    expect(refundReads).toBeGreaterThanOrEqual(3);
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey:
          "assistant-action:action-triplet:creative-triplet:dispatch-refund",
      }),
    );
    expect(send).not.toHaveBeenCalled();
    expect(trackUsage).not.toHaveBeenCalled();
  });

  it("keeps a failed triplet unresolved after timeout without minting a synthetic ack", async () => {
    vi.useFakeTimers();
    try {
      chargeBatch.mockResolvedValue({
        ok: true,
        creditsSpent: 0,
        duplicate: true,
      });
      getChild.mockImplementation(async (id: string) => ({
        id,
        status: "failed",
        updatedAt: new Date("2026-07-26T12:00:01.000Z"),
      }));
      getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
        if (
          idempotencyKey ===
          "assistant-action:action-triplet:creative-triplet"
        ) {
          return {
            metadata: {
              derivationIds: ["t1", "t2", "t3"],
              settlementDispatchAckRequired: true,
              settlementDispatchAckKey:
                "assistant-action:action-triplet:creative-triplet:dispatch-ack",
            },
          };
        }
        return null;
      });

      const pending = startGenerationSettlement(tripletAdapter());
      const expectation = expect(pending).rejects.toThrow(
        "generation_settlement_dispatch_uncertain",
      );
      await vi.runAllTimersAsync();
      await expectation;
      expect(refund).not.toHaveBeenCalled();
      expect(trackUsage).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not refund a terminal preview failure after dispatch was acknowledged", async () => {
    chargeUnit.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockResolvedValue({
      ...previewDerivation,
      status: "failed",
    });
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "assistant-action:action-preview:preview") {
        return {
          metadata: {
            derivationId: previewDerivation.id,
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey:
              "assistant-action:action-preview:preview:dispatch-ack",
          },
        };
      }
      return idempotencyKey.endsWith(":dispatch-ack")
        ? { id: "preview-ack" }
        : null;
    });

    const result = await startGenerationSettlement(previewAdapter());

    expect(result.ok).toBe(true);
    expect(refund).not.toHaveBeenCalled();
  });

  it("waits for a late preview ack instead of refunding a fast terminal failure", async () => {
    chargeUnit.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockResolvedValue({
      ...previewDerivation,
      status: "failed",
    });
    let ackReads = 0;
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "assistant-action:action-preview:preview") {
        return {
          metadata: {
            derivationId: previewDerivation.id,
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey:
              "assistant-action:action-preview:preview:dispatch-ack",
          },
        };
      }
      if (idempotencyKey.endsWith(":dispatch-ack")) {
        ackReads += 1;
        return ackReads >= 3 ? { id: "late-preview-ack" } : null;
      }
      return null;
    });

    const result = await startGenerationSettlement(previewAdapter());

    expect(result.ok).toBe(true);
    expect(ackReads).toBeGreaterThanOrEqual(3);
    expect(refund).not.toHaveBeenCalled();
  });

  it("compensates when a durable preview dispatch refund appears during ack wait", async () => {
    chargeUnit.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockResolvedValue({
      ...previewDerivation,
      status: "failed",
    });
    let refundReads = 0;
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "assistant-action:action-preview:preview") {
        return {
          metadata: {
            derivationId: previewDerivation.id,
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey:
              "assistant-action:action-preview:preview:dispatch-ack",
          },
        };
      }
      if (idempotencyKey.endsWith(":dispatch-refund")) {
        refundReads += 1;
        return refundReads >= 3 ? { id: "late-preview-refund" } : null;
      }
      return null;
    });

    const result = await startGenerationSettlement(previewAdapter());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "dispatch_failed", compensated: true },
    });
    expect(refundReads).toBeGreaterThanOrEqual(3);
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "assistant-action:action-preview:preview:dispatch-refund",
      }),
    );
    expect(send).not.toHaveBeenCalled();
    expect(trackUsage).not.toHaveBeenCalled();
  });

  it("keeps a failed preview unresolved after timeout without minting a synthetic ack", async () => {
    vi.useFakeTimers();
    try {
      chargeUnit.mockResolvedValue({
        ok: true,
        creditsSpent: 0,
        duplicate: true,
      });
      getChild.mockResolvedValue({
        ...previewDerivation,
        status: "failed",
      });
      getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
        if (idempotencyKey === "assistant-action:action-preview:preview") {
          return {
            metadata: {
              derivationId: previewDerivation.id,
              settlementDispatchAckRequired: true,
              settlementDispatchAckKey:
                "assistant-action:action-preview:preview:dispatch-ack",
            },
          };
        }
        return null;
      });

      const pending = startGenerationSettlement(previewAdapter());
      const expectation = expect(pending).rejects.toThrow(
        "generation_settlement_dispatch_uncertain",
      );
      await vi.runAllTimersAsync();
      await expectation;
      expect(refund).not.toHaveBeenCalled();
      expect(trackUsage).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves an idempotent triplet replay without double charge or send", async () => {
    chargeBatch.mockResolvedValue({
      ok: true,
      creditsSpent: 0,
      duplicate: true,
    });
    getChild.mockImplementation(async (id: string) => ({
      id,
      status: "completed",
      updatedAt: new Date("2026-07-26T12:00:01.000Z"),
    }));
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (
        idempotencyKey ===
        "assistant-action:action-triplet:creative-triplet"
      ) {
        return {
          metadata: {
            derivationIds: ["t1", "t2", "t3"],
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey:
              "assistant-action:action-triplet:creative-triplet:dispatch-ack",
          },
        };
      }
      return idempotencyKey.endsWith(":dispatch-ack")
        ? { id: "triplet-ack" }
        : null;
    });

    const result = await startGenerationSettlement(tripletAdapter());

    expect(result.ok).toBe(true);
    expect(chargeBatch).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    expect(deleteChild).toHaveBeenCalledTimes(3);
  });

  it("allows only one concurrent triplet claimer to dispatch", async () => {
    let chargeCalls = 0;
    chargeBatch.mockImplementation(async () => {
      chargeCalls += 1;
      if (chargeCalls === 1) {
        return { ok: true, creditsSpent: 15 };
      }
      return { ok: true, creditsSpent: 0, duplicate: true };
    });
    getChild.mockImplementation(async (id: string) => ({
      id,
      status: "queued",
      updatedAt: new Date("2026-07-26T12:00:00.000Z"),
    }));
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (
        chargeCalls > 1 &&
        idempotencyKey ===
          "assistant-action:action-triplet:creative-triplet"
      ) {
        return {
          metadata: {
            derivationIds: ["t1", "t2", "t3"],
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey:
              "assistant-action:action-triplet:creative-triplet:dispatch-ack",
          },
        };
      }
      return idempotencyKey.endsWith(":dispatch-ack")
        ? { id: "triplet-ack" }
        : null;
    });

    const results = await Promise.all([
      startGenerationSettlement(tripletAdapter()),
      startGenerationSettlement(tripletAdapter()),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(send).toHaveBeenCalledOnce();
  });
});
