import { beforeEach, describe, expect, it, vi } from "vitest";

const getWork = vi.hoisted(() => vi.fn());
const createRevision = vi.hoisted(() => vi.fn());
const charge = vi.hoisted(() => vi.fn());
const send = vi.hoisted(() => vi.fn());
const failQueued = vi.hoisted(() => vi.fn());
const requeue = vi.hoisted(() => vi.fn());
const refund = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: getWork,
  createCreativeWorkRevision: createRevision,
  failQueuedCreativeWorkOutput: failQueued,
  requeueFailedCreativeWorkOutput: requeue,
}));
vi.mock("@/server/generation/canonical/charge", () => ({
  chargeForGenerationBatch: charge,
}));
vi.mock("@/server/jobs/client", () => ({ inngest: { send } }));
vi.mock("@/server/billing/credits", () => ({ refundCredits: refund }));

import { reviseCreativeWorkOutput } from "./revise-creative-work-output";

const parent = {
  id: "output-v1",
  workspaceId: "ws-1",
  workItemId: "work-1",
  creativeLevel: "balanced",
  targetFormat: "4:5",
  versionNumber: 1,
  operationKey: "balanced:4:5:1",
  parentOutputId: null,
  revisionInstruction: null,
  revisionAssetId: null,
  status: "completed",
  outputKey: "creative-work/output-v1/original.png",
  cost: 5,
  failureCode: null,
  quality: null,
  isSelected: false,
  createdAt: new Date("2026-07-16T12:00:00.000Z"),
  updatedAt: new Date("2026-07-16T12:00:00.000Z"),
};

const revision = {
  ...parent,
  id: "output-v2",
  versionNumber: 2,
  operationKey: "revision-1",
  parentOutputId: parent.id,
  revisionInstruction: "Use mais contraste",
  status: "queued",
  outputKey: null,
  cost: null,
};

const work = {
  id: "work-1",
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
  createdByUserId: "user-1",
  request: "Campanha de matrícula",
  status: "completed",
};

describe("reviseCreativeWorkOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWork.mockResolvedValue({ work, outputs: [parent], sources: [] });
    createRevision.mockResolvedValue(revision);
    charge.mockResolvedValue({ ok: true, creditsSpent: 5 });
    send.mockResolvedValue(undefined);
    failQueued.mockResolvedValue({ ...revision, status: "failed" });
    requeue.mockResolvedValue(revision);
    refund.mockResolvedValue({ status: "refunded" });
  });

  it("creates version 2, charges five credits, and dispatches only the new output", async () => {
    const result = await reviseCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
      outputId: parent.id,
      revisionKey: "revision-1",
      instruction: "Use mais contraste",
      revisionAssetId: null,
    });

    expect(result).toEqual({ ok: true, value: { output: revision } });
    expect(createRevision).toHaveBeenCalledWith(
      "ws-1",
      "work-1",
      "revision-1",
      parent.id,
      "Use mais contraste",
      null,
    );
    expect(charge).toHaveBeenCalledWith(
      expect.objectContaining({
        unitCount: 1,
        chargeAmount: 5,
        unitChargeAmount: 5,
        billingKey: "creative-work:work-1:revision:output-v2",
      }),
      expect.anything(),
    );
    expect(send).toHaveBeenCalledWith({
      id: "creative-work-revision:output-v2",
      name: "creative-work.generate",
      data: { workspaceId: "ws-1", workItemId: "work-1", outputId: "output-v2" },
    });
    expect(parent.outputKey).toBe("creative-work/output-v1/original.png");
  });

  it("returns the persisted revision without a second charge or job", async () => {
    getWork.mockResolvedValue({ work, outputs: [parent, revision], sources: [] });

    const result = await reviseCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
      outputId: parent.id,
      revisionKey: "revision-1",
      instruction: "Use mais contraste",
      revisionAssetId: null,
    });

    expect(result).toEqual({ ok: true, value: { output: revision } });
    expect(createRevision).not.toHaveBeenCalled();
    expect(charge).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects revision of an unfinished output", async () => {
    getWork.mockResolvedValue({
      work,
      outputs: [{ ...parent, status: "processing", outputKey: null }],
      sources: [],
    });

    await expect(reviseCreativeWorkOutput({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
      outputId: parent.id,
      revisionKey: "revision-1",
      instruction: "Use mais contraste",
      revisionAssetId: null,
    })).resolves.toMatchObject({ ok: false, error: { code: "output_not_ready" } });
    expect(charge).not.toHaveBeenCalled();
  });

  it("does not dispatch and marks the reserved version when credits are blocked", async () => {
    charge.mockResolvedValue({ ok: false, status: 402, conversionPayload: { reason: "insufficient_credits" } });
    const result = await reviseCreativeWorkOutput({
      workspaceId: "ws-1", workItemId: "work-1", userId: "user-1", outputId: parent.id,
      revisionKey: "revision-1", instruction: "Use mais contraste", revisionAssetId: null,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "credit_blocked" } });
    expect(failQueued).toHaveBeenCalledWith("ws-1", "work-1", "output-v2", "credit_blocked");
    expect(send).not.toHaveBeenCalled();
  });

  it("compensates a failed dispatch with an idempotent refund", async () => {
    send.mockRejectedValue(new Error("transport down"));
    const result = await reviseCreativeWorkOutput({
      workspaceId: "ws-1", workItemId: "work-1", userId: "user-1", outputId: parent.id,
      revisionKey: "revision-1", instruction: "Use mais contraste", revisionAssetId: null,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "dispatch_failed" } });
    expect(failQueued).toHaveBeenCalledWith("ws-1", "work-1", "output-v2", "dispatch_failed");
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({
      amount: 5,
      idempotencyKey: "creative-work:work-1:revision:output-v2:dispatch-refund",
    }));
  });
});
