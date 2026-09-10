import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreativeWorkCarouselSlide } from "@/server/db/schema";
import type {
  CarouselDeckPlanV1,
  CarouselVisualContractV1,
} from "@/server/creative-work/carousel-contracts";
import type { CreativeWorkInputSnapshot } from "@/server/creative-work/contracts";

const chargeUnit = vi.hoisted(() => vi.fn());
const chargeBatch = vi.hoisted(() => vi.fn());
const refund = vi.hoisted(() => vi.fn());
const recordUsage = vi.hoisted(() => vi.fn());
const spendPaywall = vi.hoisted(() => vi.fn());
const queueSlide = vi.hoisted(() => vi.fn());
const queueAuthorized = vi.hoisted(() => vi.fn());
const listSlides = vi.hoisted(() => vi.fn());
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
const getUsages = vi.hoisted(() => vi.fn(async (workspaceId: string, keys: string[]) =>
  new Map(await Promise.all(keys.map(async (key) => [key, await getUsage(workspaceId, key)] as const))),
));
const getChildren = vi.hoisted(() => vi.fn(async (ids: string[], workspaceId: string) =>
  (await Promise.all(ids.map((id) => getChild(id, workspaceId)))).filter(Boolean),
));
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
vi.mock("@/server/billing/credits", () => ({
  refundCredits: refund,
  recordUsage,
  canSpend: vi.fn(),
}));
vi.mock("@/server/jobs/client", () => ({ inngest: { send } }));
vi.mock("@/server/creative-work/job-telemetry", () => ({
  logCreativeWorkGenerationAggregate: logAggregate,
  logCreativeWorkGenerationLifecycle: logLifecycle,
  logCreativeWorkOutputTerminal: logTerminal,
}));
vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: getUsage,
  getUsageByIdempotencyKeys: getUsages,
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
  getDerivationsByIds: getChildren,
  getLatestFormatAdaptationChild: getPreviousChild,
  touchQueuedDerivation: touchChild,
}));
vi.mock("@/server/repositories/campaign", () => ({ updateCampaign }));
vi.mock("@/server/billing/paywall", () => ({ spend: spendPaywall }));
vi.mock("@/server/repositories/creative-work-carousel", () => ({
  queueCarouselSlide: queueSlide,
  queueAuthorizedCarouselSlide: queueAuthorized,
  listCurrentCarouselSlides: listSlides,
}));

import {
  assistantCreativeTripletSettlementAdapter,
  assistantGoalPackageSettlementAdapter,
  assistantPreviewSettlementAdapter,
  campaignDerivationUnitSettlementAdapter,
  carouselSlideBillingKey,
  carouselSlideSettlementAdapter,
  creativeWorkRevisionSettlementAdapter,
  creativeWorkSettlementAdapter,
  formatAdaptationSettlementAdapter,
  reactivateCreativeWorkOutputRefund,
  resolveCreativeWorkOutputReactivation,
  resolveCreativeWorkOutputReactivationOutcome,
} from "./settlement-adapters";
import { startGenerationSettlement } from "./settlement";
import { CAROUSEL_SLIDE_GENERATE_EVENT, heavyImageEventName } from "@/server/jobs/heavy-image-events";

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

const batchPlans = [
  { creativeLevel: "conservative", targetFormat: "4:5", versionNumber: 1 },
  { creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1 },
  { creativeLevel: "bold", targetFormat: "4:5", versionNumber: 1 },
] as const;

function batchAdapter(existing?: { work: typeof work; outputs: typeof outputs }) {
  return creativeWorkSettlementAdapter({
    workspaceId: "workspace-1",
    workItemId: "work-1",
    userId: "user-1",
    readyWork: work as never,
    plans: [...batchPlans],
    batch,
    existing: existing as never,
    reserveReadyWork: existing
      ? undefined
      : async () => {
          const created = await createOutputs("workspace-1", "work-1", [...batchPlans]);
          return {
            work: work as never,
            outputs: created.outputs,
            newlyCreatedIds: created.newlyCreatedIds,
          };
        },
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

  it("refuses to settle a batch without an atomic reservation", async () => {
    await expect(
      startGenerationSettlement(
        creativeWorkSettlementAdapter({
          workspaceId: "workspace-1",
          workItemId: "work-1",
          userId: "user-1",
          readyWork: work as never,
          plans: [...batchPlans],
          batch,
        }),
      ),
    ).rejects.toMatchObject({
      message: "creative_work_missing_atomic_reservation",
      code: "stale_input",
    });
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

  it("a process restart replaying the same batch does not charge or dispatch again", async () => {
    createOutputs.mockResolvedValue({ outputs, newlyCreatedIds: [] });
    const first = await startGenerationSettlement(batchAdapter());
    const second = await startGenerationSettlement(batchAdapter());
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
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

  it("forwards frozen review context with a single canonical charge", async () => {
    const context = {
      version: 1,
      sourceOutputId: "output-v1",
      sourceOutputVersion: 1,
      reviewRevision: 2,
      action: "format",
      targetFormat: "9:16",
      instruction: "Preserve a pessoa.",
      annotations: [],
      revisionAssetId: null,
    };
    const adapter = creativeWorkRevisionSettlementAdapter({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      userId: "user-1",
      parentOutputId: "output-v1",
      revisionKey: REVISION_KEY,
      instruction: "Adapte a mesma peça para 9:16. Preserve os fatos e a identidade visual.\nPreserve a pessoa.",
      revisionAssetId: null,
      objective: "Sell",
      context: context as never,
      expectedReviewRevision: 2,
    });
    const result = await startGenerationSettlement(adapter);
    expect(result).toEqual({ ok: true, value: { output: revisionOutput } });
    expect(createRevision).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      REVISION_KEY,
      "output-v1",
      "Adapte a mesma peça para 9:16. Preserve os fatos e a identidade visual.\nPreserve a pessoa.",
      null,
      { context, expectedReviewRevision: 2 },
    );
    expect(chargeBatch).toHaveBeenCalledTimes(1);
  });
});

describe("creative-work manual retry settlement", () => {
  beforeEach(() => {
    getUsage.mockReset();
    recordUsage.mockReset();
    recordUsage.mockResolvedValue({ status: "recorded" });
  });

  it("re-debits exactly once from the canonical compensatory refund for manual attempt one", async () => {
    getUsage.mockImplementation(async (_workspaceId, key) => key === "creative-output:output-1:compensatory-refund"
      ? { id: "refund-1" }
      : null);

    await expect(reactivateCreativeWorkOutputRefund({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      retryAttempt: 1,
      amount: 50,
    })).resolves.toEqual({ reactivated: ["terminal"], reactivates: "creative-output:output-1:compensatory-refund" });
    expect(recordUsage).toHaveBeenCalledOnce();
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "creative-work:work-1:output:output-1:reactivate-terminal:1",
      metadata: expect.objectContaining({ reactivates: "creative-output:output-1:compensatory-refund", manualRetryAttempt: 1 }),
    }));
  });

  it("resolves modern and legacy outstanding debits to their distinct compensation keys", async () => {
    getUsage.mockImplementation(async (_workspaceId, key) => (
      key === "creative-work:work-1:output:output-1:reactivate-terminal:3"
        || key === "creative-work:work-1:output:output-2:reactivate-terminal"
        ? { id: key }
        : null
    ));
    await expect(resolveCreativeWorkOutputReactivation({
      workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-1", manualRetryAttempt: 3,
    })).resolves.toMatchObject({ kind: "manual", refundKey: "creative-work:work-1:output:output-1:reactivate-terminal:3-refund" });
    await expect(resolveCreativeWorkOutputReactivation({
      workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-2", manualRetryAttempt: null,
    })).resolves.toMatchObject({ kind: "legacy", refundKey: "creative-work:work-1:output:output-2:reactivate-terminal-refund" });
  });

  it("resolves legacy pregen before dispatch with no modern re-debit", async () => {
    getUsage.mockImplementation(async (_workspaceId, key) => (
      key === "creative-work:work-1:output:output-legacy:reactivate-pregen"
        || key === "creative-work:work-1:output:output-legacy:reactivate-dispatch"
        ? { id: key }
        : null
    ));
    await expect(resolveCreativeWorkOutputReactivation({
      workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-legacy", manualRetryAttempt: null,
    })).resolves.toMatchObject({
      kind: "legacy",
      chargeKey: "creative-work:work-1:output:output-legacy:reactivate-pregen",
      refundKey: "creative-work:work-1:output:output-legacy:reactivate-pregen-refund",
    });
  });

  it("scans past a refunded legacy terminal to select a later outstanding dispatch debit", async () => {
    getUsage.mockImplementation(async (_workspaceId, key) => (
      key === "creative-work:work-1:output:output-mixed:reactivate-terminal"
        || key === "creative-work:work-1:output:output-mixed:reactivate-terminal-refund"
        || key === "creative-work:work-1:output:output-mixed:reactivate-dispatch"
        ? { id: key }
        : null
    ));

    await expect(resolveCreativeWorkOutputReactivationOutcome({
      workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-mixed", manualRetryAttempt: null,
    })).resolves.toEqual({
      state: "outstanding",
      kind: "legacy",
      retryAttempt: null,
      chargeKey: "creative-work:work-1:output:output-mixed:reactivate-dispatch",
      refundKey: "creative-work:work-1:output:output-mixed:reactivate-dispatch-refund",
    });
  });

  it("reports already_refunded only after every deterministic charged candidate is settled", async () => {
    getUsage.mockImplementation(async (_workspaceId, key) => (
      key === "creative-work:work-1:output:output-mixed:reactivate-terminal"
        || key === "creative-work:work-1:output:output-mixed:reactivate-terminal-refund"
        || key === "creative-work:work-1:output:output-mixed:reactivate-dispatch"
        || key === "creative-work:work-1:output:output-mixed:reactivate-dispatch-refund"
        ? { id: key }
        : null
    ));

    await expect(resolveCreativeWorkOutputReactivationOutcome({
      workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-mixed", manualRetryAttempt: null,
    })).resolves.toMatchObject({
      state: "already_refunded",
      kind: "legacy",
      chargeKey: "creative-work:work-1:output:output-mixed:reactivate-terminal",
      refundKey: "creative-work:work-1:output:output-mixed:reactivate-terminal-refund",
    });
  });

  it("does not let the original canonical refund predating a legacy debit settle that debit", async () => {
    const originalRefundAt = new Date("2026-08-28T10:00:00.000Z");
    const legacyDebitAt = new Date("2026-08-28T10:01:00.000Z");
    getUsage.mockImplementation(async (_workspaceId, key) => {
      if (key === "creative-work:work-1:output:output-historical:reactivate-pregen") return { id: key, createdAt: legacyDebitAt };
      if (key === "creative-output:output-historical:compensatory-refund") return { id: key, createdAt: originalRefundAt };
      return null;
    });

    await expect(resolveCreativeWorkOutputReactivationOutcome({
      workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-historical", manualRetryAttempt: null,
    })).resolves.toMatchObject({
      state: "outstanding",
      chargeKey: "creative-work:work-1:output:output-historical:reactivate-pregen",
    });
  });

  it("recognizes a later canonical or terminal refund as historical compensation for a legacy debit", async () => {
    const legacyDebitAt = new Date("2026-08-28T10:01:00.000Z");
    const laterRefundAt = new Date("2026-08-28T10:02:00.000Z");
    getUsage.mockImplementation(async (_workspaceId, key) => {
      if (key === "creative-work:work-1:output:output-historical:reactivate-pregen") return { id: key, createdAt: legacyDebitAt };
      if (key === "creative-work:work-1:output:output-historical:terminal-refund") return { id: key, createdAt: laterRefundAt };
      return null;
    });

    await expect(resolveCreativeWorkOutputReactivationOutcome({
      workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-historical", manualRetryAttempt: null,
    })).resolves.toMatchObject({
      state: "already_refunded",
      chargeKey: "creative-work:work-1:output:output-historical:reactivate-pregen",
    });
  });

  it("still selects a later outstanding legacy debit after an earlier one is historically compensated", async () => {
    const earlyDebitAt = new Date("2026-08-28T10:01:00.000Z");
    const laterRefundAt = new Date("2026-08-28T10:02:00.000Z");
    const dispatchDebitAt = new Date("2026-08-28T10:03:00.000Z");
    getUsage.mockImplementation(async (_workspaceId, key) => {
      if (key === "creative-work:work-1:output:output-historical:reactivate-terminal") return { id: key, createdAt: earlyDebitAt };
      if (key === "creative-output:output-historical:compensatory-refund") return { id: key, createdAt: laterRefundAt };
      if (key === "creative-work:work-1:output:output-historical:reactivate-dispatch") return { id: key, createdAt: dispatchDebitAt };
      return null;
    });

    await expect(resolveCreativeWorkOutputReactivationOutcome({
      workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-historical", manualRetryAttempt: null,
    })).resolves.toMatchObject({
      state: "outstanding",
      chargeKey: "creative-work:work-1:output:output-historical:reactivate-dispatch",
    });
  });

  it("consumes one generic refund against only the most recent preceding legacy debit", async () => {
    const terminalDebitAt = new Date("2026-08-28T10:01:00.000Z");
    const dispatchDebitAt = new Date("2026-08-28T10:02:00.000Z");
    const genericRefundAt = new Date("2026-08-28T10:03:00.000Z");
    getUsage.mockImplementation(async (_workspaceId, key) => {
      if (key === "creative-work:work-1:output:output-chronological:reactivate-terminal") return { id: key, createdAt: terminalDebitAt };
      if (key === "creative-work:work-1:output:output-chronological:reactivate-dispatch") return { id: key, createdAt: dispatchDebitAt };
      if (key === "creative-output:output-chronological:compensatory-refund") return { id: key, createdAt: genericRefundAt };
      return null;
    });

    await expect(resolveCreativeWorkOutputReactivationOutcome({
      workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-chronological", manualRetryAttempt: null,
    })).resolves.toMatchObject({
      state: "outstanding",
      chargeKey: "creative-work:work-1:output:output-chronological:reactivate-terminal",
    });
  });

  it("matches generic refunds chronologically once and leaves no legacy debit after two refunds", async () => {
    const terminalDebitAt = new Date("2026-08-28T10:01:00.000Z");
    const dispatchDebitAt = new Date("2026-08-28T10:02:00.000Z");
    getUsage.mockImplementation(async (_workspaceId, key) => {
      if (key === "creative-work:work-1:output:output-two-refunds:reactivate-terminal") return { id: key, createdAt: terminalDebitAt };
      if (key === "creative-work:work-1:output:output-two-refunds:reactivate-dispatch") return { id: key, createdAt: dispatchDebitAt };
      if (key === "creative-output:output-two-refunds:compensatory-refund") return { id: key, createdAt: new Date("2026-08-28T10:03:00.000Z") };
      if (key === "creative-work:work-1:output:output-two-refunds:terminal-refund") return { id: key, createdAt: new Date("2026-08-28T10:04:00.000Z") };
      return null;
    });

    await expect(resolveCreativeWorkOutputReactivationOutcome({
      workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-two-refunds", manualRetryAttempt: null,
    })).resolves.toMatchObject({ state: "already_refunded" });
  });

  it("does not reuse an explicit paired refund when matching a later generic refund", async () => {
    const terminalDebitAt = new Date("2026-08-28T10:01:00.000Z");
    const dispatchDebitAt = new Date("2026-08-28T10:02:00.000Z");
    getUsage.mockImplementation(async (_workspaceId, key) => {
      if (key === "creative-work:work-1:output:output-explicit:reactivate-terminal") return { id: key, createdAt: terminalDebitAt };
      if (key === "creative-work:work-1:output:output-explicit:reactivate-terminal-refund") return { id: key, createdAt: new Date("2026-08-28T10:03:00.000Z") };
      if (key === "creative-work:work-1:output:output-explicit:reactivate-dispatch") return { id: key, createdAt: dispatchDebitAt };
      if (key === "creative-output:output-explicit:compensatory-refund") return { id: key, createdAt: new Date("2026-08-28T10:04:00.000Z") };
      return null;
    });

    await expect(resolveCreativeWorkOutputReactivationOutcome({
      workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-explicit", manualRetryAttempt: null,
    })).resolves.toMatchObject({ state: "already_refunded" });
  });

  it("keeps a legacy debit outstanding when a generic historical refund has no ordering timestamp", async () => {
    getUsage.mockImplementation(async (_workspaceId, key) => {
      if (key === "creative-work:work-1:output:output-undated:reactivate-pregen") return { id: key, createdAt: new Date("2026-08-28T10:01:00.000Z") };
      if (key === "creative-output:output-undated:compensatory-refund") return { id: key };
      return null;
    });

    await expect(resolveCreativeWorkOutputReactivationOutcome({
      workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-undated", manualRetryAttempt: null,
    })).resolves.toMatchObject({
      state: "outstanding",
      chargeKey: "creative-work:work-1:output:output-undated:reactivate-pregen",
    });
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

function carouselSlideFixture(
  overrides: Partial<CreativeWorkCarouselSlide> = {},
): CreativeWorkCarouselSlide {
  return {
    id: "slide-1",
    workspaceId: "workspace-1",
    workItemId: "work-1",
    lineageId: "lineage-1",
    parentSlideId: null,
    versionNumber: 1,
    deckRevision: "deck-r1",
    position: 1,
    role: "hook",
    primaryText: "Gancho exato",
    secondaryText: null,
    copyAuthority: "ai_proposal",
    sourceFactIds: [],
    layoutFamily: "impact",
    status: "draft",
    providerBaseKey: null,
    outputKey: null,
    previewKey: null,
    visualContractHash: "contract-hash-1",
    anchorKey: null,
    generationOperationKey: "deck-r1:slide-1",
    errorCode: null,
    quality: null,
    isCurrent: true,
    createdAt: new Date("2026-08-30T10:00:00.000Z"),
    queuedAt: null,
    terminalAt: null,
    updatedAt: new Date("2026-08-30T10:00:00.000Z"),
    ...overrides,
  } as CreativeWorkCarouselSlide;
}

export function carouselVisualContractFixture(): CarouselVisualContractV1 {
  const region = { x: 80, y: 96, width: 864, height: 420, minFontPx: 42, maxFontPx: 82, align: "left" as const };
  return {
    version: 1,
    brandSnapshotHash: "brand-hash-1",
    temporaryReferenceId: null,
    palette: ["#112233"],
    typography: { fontAssetKey: null, fallbackFamily: "sans", authority: "fallback" },
    directionInstruction: null,
    layoutFamilies: {
      impact: { id: "impact-v1", density: "high", primaryRegion: region, secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "impact" },
      development: { id: "development-v1", density: "medium", primaryRegion: region, secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "development" },
      respite: { id: "respite-v1", density: "low", primaryRegion: region, secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "respite" },
    },
    recurringMotifs: [],
    exactAssetKeys: [],
    prohibitedElements: [],
    safeAreaPx: 64,
    contractHash: "contract-hash-1",
  };
}

export function carouselDeckFixture(slideCount = 5): CarouselDeckPlanV1 {
  const roles = ["hook", "context", "problem", "argument", "closing", "evidence", "method", "cta"] as const;
  return {
    version: 1,
    revision: "deck-r1",
    workId: "work-1",
    objective: "Divulgar o grupo de terapia",
    audience: null,
    tone: null,
    promise: "Grupo de terapia em agosto",
    format: "4:5",
    slides: Array.from({ length: slideCount }, (_, index) => ({
      slideId: `slide-${index + 1}`,
      position: index + 1,
      role: roles[index],
      purpose: `Propósito ${index + 1}`,
      primaryText: `Texto primário ${index + 1} do grupo de terapia`,
      secondaryText: null,
      authority: "ai_proposal" as const,
      sourceFactIds: [],
      layoutFamily: index === 0 ? "impact" : index === slideCount - 1 ? "respite" : "development",
    })),
  };
}

export function carouselWorkFixture(
  slides: CreativeWorkCarouselSlide[],
  deckSlideCount = 5,
  overrides: Record<string, unknown> = {},
) {
  return {
    work: {
      id: "work-1",
      workspaceId: "workspace-1",
      toolKind: "carousel",
      status: "generating",
      clientProfileId: "profile-1",
      carouselQuality: null,
      inputSnapshot: {
        carousel: {
          version: 1,
          preparedRevision: "prep-1",
          deck: carouselDeckFixture(deckSlideCount),
          visualContract: carouselVisualContractFixture(),
        },
      },
      ...overrides,
    },
    outputs: [],
    sources: [],
  };
}

describe("carouselSlideSettlementAdapter", () => {
  const billingKey = carouselSlideBillingKey("work-1", "slide-1");

  function adapter(anchorKey: string | null = null) {
    return carouselSlideSettlementAdapter({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      slideId: "slide-1",
      userId: "user-1",
      anchorKey,
      operationKey: billingKey,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    spendPaywall.mockResolvedValue({ ok: true, creditsSpent: 50 });
    refund.mockResolvedValue({ status: "refunded" });
    send.mockResolvedValue(undefined);
    trackUsage.mockResolvedValue({ id: "usage-ack" });
    queueSlide.mockResolvedValue(null);
    queueAuthorized.mockImplementation(async (input: { slideId: string; anchorKey: string | null; operationKey: string }) => {
      const queued = await queueSlide(input);
      if (queued) return { outcome: "claimed", slide: queued };
      const current = (await listSlides()).find((row: { id: string }) => row.id === input.slideId)
        ?? carouselSlideFixture({ status: "queued" });
      if (current.status === "draft" || current.status === "failed") return { outcome: "unauthorized" };
      return { outcome: "already_claimed", slide: current };
    });
    listSlides.mockResolvedValue([carouselSlideFixture({ status: "queued" })]);
    getUsage.mockResolvedValue(null);
    getWork.mockResolvedValue(carouselWorkFixture([carouselSlideFixture()]));
  });

  it("first claimant queues the slide and charges exactly one credit unit", async () => {
    const queued = carouselSlideFixture({ status: "queued" });
    queueSlide.mockResolvedValue(queued);
    listSlides.mockResolvedValue([carouselSlideFixture({ status: "draft" })]);

    const result = await startGenerationSettlement(adapter());

    expect(result.ok).toBe(true);
    expect(queueSlide).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      slideId: "slide-1",
      anchorKey: null,
      operationKey: billingKey,
    }));
    expect(spendPaywall).toHaveBeenCalledTimes(1);
    expect(spendPaywall).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      action: "image_derivation",
      amount: 50,
      idempotencyKey: billingKey,
    }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      name: heavyImageEventName(CAROUSEL_SLIDE_GENERATE_EVENT),
      data: { slideId: "slide-1", position: 1, workspaceId: "workspace-1", workItemId: "work-1" },
    });
    // queue timestamp is recorded by the claim
    expect(queueSlide).toHaveBeenCalledOnce();
  });

  it("replay joins the already-claimed row without a second charge", async () => {
    queueSlide.mockResolvedValue(null);
    listSlides.mockResolvedValue([carouselSlideFixture({ status: "queued" })]);
    getUsage.mockImplementation(async (_workspaceId: string, idempotencyKey: string) =>
      idempotencyKey.endsWith(":dispatch-refund")
        ? null
        : { metadata: { settlementDispatchAckRequired: true, settlementDispatchAckKey: `${billingKey}:dispatch-ack` } }
    );

    const result = await startGenerationSettlement(adapter());

    expect(result.ok).toBe(true);
    expect(spendPaywall).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("dispatches one stable Inngest event id derived from the billing key", async () => {
    const slide = carouselSlideFixture({ status: "queued" });
    const first = adapter();
    const second = adapter();

    await first.dispatch({ claimed: true, value: { slide } });
    await second.dispatch({ claimed: true, value: { slide } });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0].id).toBe(send.mock.calls[1][0].id);
    expect(send.mock.calls[0][0].id).toBe(`${billingKey}:dispatch`);
  });

  it("dispatch failure marks only that slide and refunds only its own key", async () => {
    const queued = carouselSlideFixture({ status: "queued" });
    queueSlide.mockResolvedValue(queued);
    listSlides.mockResolvedValue([carouselSlideFixture({ status: "draft" })]);
    send.mockRejectedValue(new Error("inngest unavailable"));

    const result = await startGenerationSettlement(adapter());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("dispatch_failed");
    expect(result.error.value.slide.id).toBe("slide-1");
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: `${billingKey}:dispatch-refund`,
      amount: 50,
    }));
  });

  it("a pre-provider failure settles net zero without dispatching or refunding", async () => {
    const queued = carouselSlideFixture({ status: "queued" });
    queueSlide.mockResolvedValue(queued);
    listSlides.mockResolvedValue([carouselSlideFixture({ status: "draft" })]);
    spendPaywall.mockResolvedValue({
      ok: false,
      status: 402,
      conversionPayload: { reason: "insufficient_credits" },
    });

    const result = await startGenerationSettlement(adapter());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("credit_blocked");
    expect(send).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
  });

  it("completed slide replay does not re-dispatch", async () => {
    queueSlide.mockResolvedValue(null);
    listSlides.mockResolvedValue([
      carouselSlideFixture({ status: "completed", providerBaseKey: "base-1", outputKey: "out-1" }),
    ]);

    const result = await startGenerationSettlement(adapter());

    expect(result.ok).toBe(true);
    expect(spendPaywall).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("a non-anchor cannot queue without an anchorKey", async () => {
    listSlides.mockResolvedValue([
      carouselSlideFixture({ id: "slide-2", position: 2, status: "draft" }),
    ]);

    await expect(
      startGenerationSettlement(carouselSlideSettlementAdapter({
        workspaceId: "workspace-1",
        workItemId: "work-1",
        slideId: "slide-2",
        userId: "user-1",
        anchorKey: null,
        operationKey: carouselSlideBillingKey("work-1", "slide-2"),
      })),
    ).rejects.toThrow("carousel_slide_missing_anchor_key");
    expect(queueSlide).not.toHaveBeenCalled();
    expect(spendPaywall).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("takes over a queued row that no charge owns instead of stranding it", async () => {
    queueSlide.mockResolvedValue(null);
    listSlides.mockResolvedValue([carouselSlideFixture({ status: "queued" })]);
    getUsage.mockResolvedValue(null);

    const result = await startGenerationSettlement(adapter());

    expect(result.ok).toBe(true);
    expect(spendPaywall).toHaveBeenCalledTimes(1);
    expect(spendPaywall).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: billingKey,
      amount: 50,
    }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].id).toBe(`${billingKey}:dispatch`);
  });

  it("does not charge when the authorized queue CAS refuses the current revision", async () => {
    queueAuthorized.mockResolvedValue({ outcome: "unauthorized" });
    listSlides.mockResolvedValue([carouselSlideFixture({ status: "draft" })]);

    await expect(startGenerationSettlement(adapter())).rejects.toMatchObject({
      name: "CarouselGenerationGateError",
      code: "invalid_generation_gate",
    });
    expect(spendPaywall).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not take over a queued row after the generation gate is invalidated", async () => {
    const queued = carouselSlideFixture({ status: "queued" });
    queueAuthorized
      .mockResolvedValueOnce({ outcome: "already_claimed", slide: queued })
      .mockResolvedValueOnce({ outcome: "unauthorized" });
    listSlides.mockResolvedValue([queued]);
    getUsage.mockResolvedValue(null);

    await expect(startGenerationSettlement(adapter())).rejects.toMatchObject({
      name: "CarouselGenerationGateError",
      code: "invalid_generation_gate",
    });
    expect(spendPaywall).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

/**
 * Task 18 (PR-06): characterization of the eight settlement wait loops, one
 * test per loop grouped by policy family. Each test pins observable behavior
 * only — logical charge operations, literal idempotency keys, terminal state —
 * so it keeps passing WITHOUT edits after Task 19 batches the fan-out reads
 * and adds a monotonic deadline. Deliberately asserts nothing about read
 * counts or wait mechanics.
 */
describe("settlement loop families (Task 18 characterization)", () => {
  const slideBillingKey = carouselSlideBillingKey("work-1", "slide-1");

  function slideAdapter() {
    return carouselSlideSettlementAdapter({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      slideId: "slide-1",
      userId: "user-1",
      anchorKey: null,
      operationKey: slideBillingKey,
    });
  }

  function unitReplayAdapter(onComplete: () => void) {
    return campaignDerivationUnitSettlementAdapter({
      workspaceId: "workspace-1",
      userId: "user-1",
      campaignId: "campaign-1",
      billingKey: "campaign:campaign-1:unit-1",
      amount: 50,
      action: "image_derivation",
      intentMode: "creative_revision",
      eventIdPrefix: "campaign-unit",
      refundDescription: "campaign_unit_dispatch_refund",
      promptText: "characterization",
      targetFormat: "1:1",
      reserve: async () => ({
        claimed: true,
        value: { derivation: unitDerivation as never },
      }),
      buildEventData: (derivation) => ({ derivationId: derivation.id }),
      onComplete: async () => {
        onComplete();
      },
    });
  }

  const unitDerivation = {
    id: "unit-1",
    status: "queued",
    updatedAt: new Date("2026-07-26T12:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    chargeUnit.mockResolvedValue({ ok: true, creditsSpent: 5 });
    chargeBatch.mockResolvedValue({ ok: true, creditsSpent: 15 });
    spendPaywall.mockResolvedValue({ ok: true, creditsSpent: 50 });
    refund.mockResolvedValue({ status: "refunded" });
    send.mockResolvedValue(undefined);
    trackUsage.mockResolvedValue({ id: "usage-event" });
    updateCampaign.mockResolvedValue(undefined);
    setWorkStatus.mockResolvedValue({ ...work, status: "generating" });
    getUsage.mockResolvedValue(null);
  });

  it("loop 378 (creative batch join): one recorded refund fails the batch with one unit refund per output", async () => {
    getWork.mockResolvedValue({ work, outputs });
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) =>
      idempotencyKey === "creative-work:work-1:output:a:dispatch-refund"
        ? { id: "refund-a" }
        : null,
    );

    const result = await batchAdapter().join!(undefined as never);

    expect(result?.status).toBe("dispatch_failed");
    if (result?.status !== "dispatch_failed") return;
    expect(result.failure.refunds.map((entry) => entry.idempotencyKey)).toEqual([
      "creative-work:work-1:output:a:dispatch-refund",
      "creative-work:work-1:output:b:dispatch-refund",
      "creative-work:work-1:output:c:dispatch-refund",
    ]);
    expect(result.failure.refunds.map((entry) => entry.amount)).toEqual([50, 50, 50]);
    expect(result.failure.resumeAfterCompensation).toBe(false);
    expect(chargeBatch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(setWorkStatus).not.toHaveBeenCalled();
  });

  it("loop 692 (carousel join): a queued row with no charge is taken over with exactly one recovery spend", async () => {
    const queued = carouselSlideFixture({ status: "queued" });
    listSlides.mockResolvedValue([queued]);
    queueAuthorized.mockResolvedValue({ outcome: "already_claimed", slide: queued });

    const result = await slideAdapter().join!({ claimed: false, value: { slide: queued } });

    expect(result?.status).toBe("settled");
    expect(spendPaywall).toHaveBeenCalledTimes(1);
    expect(spendPaywall).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: slideBillingKey,
      amount: 50,
    }));
    expect(chargeUnit).not.toHaveBeenCalled();
    expect(chargeBatch).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].id).toBe(`${slideBillingKey}:dispatch`);
    expect(trackUsage).toHaveBeenCalledWith(
      "workspace-1",
      "generation_dispatch_ack",
      0,
      expect.objectContaining({ slideId: "slide-1" }),
      `${slideBillingKey}:dispatch-ack`,
    );
  });

  it("loop 818 (carousel replay): a recorded ack settles without charging or dispatching", async () => {
    const queued = carouselSlideFixture({ status: "queued" });
    listSlides.mockResolvedValue([queued]);
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === slideBillingKey) {
        return {
          metadata: {
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey: `${slideBillingKey}:dispatch-ack`,
          },
        };
      }
      return idempotencyKey === `${slideBillingKey}:dispatch-ack` ? { id: "slide-ack" } : null;
    });

    const result = await slideAdapter().resolveReplay!({ claimed: false, value: { slide: queued } });

    expect(result?.status).toBe("settled");
    if (result?.status !== "settled") return;
    expect(result.value.slide.id).toBe("slide-1");
    expect(spendPaywall).not.toHaveBeenCalled();
    expect(chargeUnit).not.toHaveBeenCalled();
    expect(chargeBatch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(getUsage).toHaveBeenCalledWith("workspace-1", `${slideBillingKey}:dispatch-ack`);
  });

  it("loop 1068 (format replay): a recorded ack settles the original derivation and retries the campaign status", async () => {
    getChild.mockResolvedValue(originalChild);
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "adapt:source-1") {
        return {
          metadata: {
            derivationId: originalChild.id,
            reservationUpdatedAt: "2026-07-26T12:00:00.000Z",
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey: "adapt:source-1:dispatch-ack",
          },
        };
      }
      return idempotencyKey === "adapt:source-1:dispatch-ack" ? { id: "format-ack" } : null;
    });

    const result = await unitAdapter().resolveReplay!({
      claimed: true,
      value: { derivation: child as never, source: source as never },
      previous: null,
    });

    expect(result?.status).toBe("settled");
    if (result?.status !== "settled") return;
    expect(result.value.derivation.id).toBe("original-child");
    expect(updateCampaign).toHaveBeenCalledWith("campaign-1", "workspace-1", { status: "generating" });
    expect(chargeUnit).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("loop 1397 (revision join): a dispatch_failed marker fails the revision with its own literal refund key", async () => {
    const failedOutput = { ...revisionOutput, status: "failed", failureCode: "dispatch_failed" };
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) =>
      idempotencyKey === "creative-work:work-1:revision:output-v2"
        ? {
            metadata: {
              settlementDispatchAckRequired: true,
              settlementDispatchAckKey: "creative-work:work-1:revision:output-v2:dispatch-ack",
            },
          }
        : null,
    );

    const result = await revisionAdapter().join!({ claimed: true, value: { output: failedOutput as never } });

    expect(result?.status).toBe("dispatch_failed");
    if (result?.status !== "dispatch_failed") return;
    expect(result.failure.refunds.map((entry) => entry.idempotencyKey)).toEqual([
      "creative-work:work-1:revision:output-v2:dispatch-refund",
    ]);
    expect(result.failure.refunds.map((entry) => entry.amount)).toEqual([50]);
    expect(getUsage).toHaveBeenCalledWith("workspace-1", "creative-work:work-1:revision:output-v2");
    expect(chargeBatch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(trackUsage).not.toHaveBeenCalled();
  });

  it("loop 1664 (derivation batch replay): one recorded refund fails the batch with a single full-amount refund", async () => {
    getChild.mockImplementation(async (id: string) => ({
      id,
      status: "queued",
      updatedAt: new Date("2026-07-26T12:00:00.000Z"),
    }));
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "assistant-action:action-triplet:creative-triplet") {
        return { metadata: { derivationIds: ["t1", "t2", "t3"] } };
      }
      return idempotencyKey === "assistant-action:action-triplet:creative-triplet:dispatch-refund"
        ? { id: "triplet-refund" }
        : null;
    });

    const result = await tripletAdapter().resolveReplay!({
      claimed: true,
      value: { derivations: tripletDerivations as never },
      newlyCreatedIds: ["t1", "t2", "t3"],
    });

    expect(result?.status).toBe("dispatch_failed");
    if (result?.status !== "dispatch_failed") return;
    expect(result.failure.refunds).toHaveLength(1);
    expect(result.failure.refunds[0]).toMatchObject({
      action: "image_derivation",
      idempotencyKey: "assistant-action:action-triplet:creative-triplet:dispatch-refund",
      amount: 150,
    });
    expect(result.failure.value.derivations.map((row) => row.id)).toEqual(["t1", "t2", "t3"]);
    expect(chargeBatch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(updateCampaign).not.toHaveBeenCalled();
  });

  it("loop 2284 (preview replay): one recorded refund fails the preview with its own literal refund key", async () => {
    getChild.mockResolvedValue(previewDerivation);
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "assistant-action:action-preview:preview") {
        return {
          metadata: {
            derivationId: "preview-1",
            reservationUpdatedAt: "2026-07-26T12:00:00.000Z",
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey: "assistant-action:action-preview:preview:dispatch-ack",
          },
        };
      }
      return idempotencyKey === "assistant-action:action-preview:preview:dispatch-refund"
        ? { id: "preview-refund" }
        : null;
    });

    const result = await previewAdapter().resolveReplay!(undefined as never);

    expect(result?.status).toBe("dispatch_failed");
    if (result?.status !== "dispatch_failed") return;
    expect(result.failure.refunds.map((entry) => entry.idempotencyKey)).toEqual([
      "assistant-action:action-preview:preview:dispatch-refund",
    ]);
    expect(result.failure.refunds.map((entry) => entry.amount)).toEqual([50]);
    expect(chargeUnit).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(updateCampaign).not.toHaveBeenCalled();
  });

  it("loop 2658 (campaign unit replay): a recorded ack settles, retries the campaign status, and runs onComplete", async () => {
    const onComplete = vi.fn();
    getChild.mockResolvedValue(unitDerivation);
    getUsage.mockImplementation(async (_workspaceId, idempotencyKey) => {
      if (idempotencyKey === "campaign:campaign-1:unit-1") {
        return {
          metadata: {
            derivationId: "unit-1",
            reservationUpdatedAt: "2026-07-26T12:00:00.000Z",
            settlementDispatchAckRequired: true,
            settlementDispatchAckKey: "campaign:campaign-1:unit-1:dispatch-ack",
          },
        };
      }
      return idempotencyKey === "campaign:campaign-1:unit-1:dispatch-ack" ? { id: "unit-ack" } : null;
    });

    const result = await unitReplayAdapter(onComplete).resolveReplay!({
      claimed: true,
      value: { derivation: unitDerivation as never },
    });

    expect(result?.status).toBe("settled");
    if (result?.status !== "settled") return;
    expect(result.value.derivation.id).toBe("unit-1");
    expect(updateCampaign).toHaveBeenCalledWith("campaign-1", "workspace-1", { status: "generating" });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(chargeUnit).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});



describe("settlement batched refund reads", () => {
  it.each([3, 30])("uses one refund query for %i outputs", async (count) => {
    vi.clearAllMocks();
    const rows = Array.from({ length: count }, (_, i) => ({ ...outputs[0], id: `out-${i}`, status: "processing" }));
    getWork.mockResolvedValue({ work: { ...work, status: "generating" }, outputs: rows });
    getUsage.mockResolvedValue(null);
    getUsages.mockResolvedValueOnce(new Map());
    const result = await batchAdapter().join!(undefined as never);
    expect(result?.status).toBe("settled");
    expect(getUsages).toHaveBeenCalledExactlyOnceWith("workspace-1", rows.map((row) => `creative-work:work-1:output:${row.id}:dispatch-refund`));
    expect(getUsage).toHaveBeenCalledTimes(1);
    expect(refund).not.toHaveBeenCalled();
  });
});

it("a timed-out settlement read does not authorize a refund or another dispatch", async () => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    getWork.mockImplementationOnce(() => new Promise(() => {}));
    const pending = startGenerationSettlement(batchAdapter({ work, outputs }));
    const assertion = expect(pending).rejects.toThrow("settlement_read_timeout");
    await vi.runAllTimersAsync();
    await assertion;
    expect(refund).not.toHaveBeenCalled();
    expect(chargeBatch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
