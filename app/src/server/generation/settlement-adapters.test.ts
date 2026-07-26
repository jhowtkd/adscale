import { beforeEach, describe, expect, it, vi } from "vitest";

const chargeUnit = vi.hoisted(() => vi.fn());
const chargeBatch = vi.hoisted(() => vi.fn());
const refund = vi.hoisted(() => vi.fn());
const send = vi.hoisted(() => vi.fn());
const createOutputs = vi.hoisted(() => vi.fn());
const deleteOutputs = vi.hoisted(() => vi.fn());
const failOutput = vi.hoisted(() => vi.fn());
const refreshWork = vi.hoisted(() => vi.fn());
const setWorkStatus = vi.hoisted(() => vi.fn());
const getWork = vi.hoisted(() => vi.fn());
const createChild = vi.hoisted(() => vi.fn());
const deleteChild = vi.hoisted(() => vi.fn());
const failChild = vi.hoisted(() => vi.fn());
const getChild = vi.hoisted(() => vi.fn());
const getPreviousChild = vi.hoisted(() => vi.fn());
const touchChild = vi.hoisted(() => vi.fn());
const getUsage = vi.hoisted(() => vi.fn());
const updateCampaign = vi.hoisted(() => vi.fn());

vi.mock("@/server/generation/canonical/charge", () => ({
  chargeForGeneration: chargeUnit,
  chargeForGenerationBatch: chargeBatch,
}));
vi.mock("@/server/billing/credits", () => ({ refundCredits: refund }));
vi.mock("@/server/jobs/client", () => ({ inngest: { send } }));
vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: getUsage,
}));
vi.mock("@/server/repositories/creative-work", () => ({
  createPlannedCreativeWorkOutputs: createOutputs,
  deleteQueuedCreativeWorkOutputs: deleteOutputs,
  failQueuedCreativeWorkOutput: failOutput,
  refreshCreativeWorkStatus: refreshWork,
  setCreativeWorkStatus: setWorkStatus,
  getCreativeWork: getWork,
}));
vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: createChild,
  deleteQueuedDerivation: deleteChild,
  failQueuedDerivation: failChild,
  getDerivationById: getChild,
  getLatestFormatAdaptationChild: getPreviousChild,
  touchQueuedDerivation: touchChild,
}));
vi.mock("@/server/repositories/campaign", () => ({ updateCampaign }));

import {
  creativeWorkSettlementAdapter,
  formatAdaptationSettlementAdapter,
} from "./settlement-adapters";
import { startGenerationSettlement } from "./settlement";

const work = { id: "work-1", status: "ready" };
const outputs = ["a", "b", "c"].map((id) => ({
  id,
  status: "queued",
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
  chargeAmount: 15,
  unitChargeAmount: 5,
  billingKey: "creative-work:work-1:initial",
  refundPolicy: "default",
} as const;

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
    failOutput.mockImplementation(async (_ws, _work, outputId) => ({
      ...outputs.find((output) => output.id === outputId),
      status: "failed",
      failureCode: "dispatch_failed",
    }));
    refreshWork.mockResolvedValue("failed");
    setWorkStatus.mockResolvedValue({ ...work, status: "generating" });
    getWork.mockResolvedValue({
      work: { ...work, status: "generating" },
      outputs,
    });
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
    expect(touchChild).toHaveBeenCalledWith(
      child.id,
      "workspace-1",
      child.updatedAt,
    );
    expect(chargeUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: { mode: "format_adaptation", objective: null },
        cost: { chargeAmount: 5, refundPolicy: "default" },
        destination: expect.objectContaining({
          kind: "derivation",
          id: child.id,
        }),
      }),
      expect.anything(),
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
      expect.objectContaining({ amount: 5 }),
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
});
