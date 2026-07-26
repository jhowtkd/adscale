import { beforeEach, describe, expect, it, vi } from "vitest";

const spend = vi.hoisted(() => vi.fn());
const chargeBatch = vi.hoisted(() => vi.fn());
const refund = vi.hoisted(() => vi.fn());
const send = vi.hoisted(() => vi.fn());
const createOutputs = vi.hoisted(() => vi.fn());
const deleteOutputs = vi.hoisted(() => vi.fn());
const failOutput = vi.hoisted(() => vi.fn());
const refreshWork = vi.hoisted(() => vi.fn());
const setWorkStatus = vi.hoisted(() => vi.fn());
const createChild = vi.hoisted(() => vi.fn());
const deleteChild = vi.hoisted(() => vi.fn());
const updateDerivationStatus = vi.hoisted(() => vi.fn());
const updateCampaign = vi.hoisted(() => vi.fn());

vi.mock("@/server/billing/paywall", () => ({ spend }));
vi.mock("@/server/generation/canonical/charge", () => ({
  chargeForGenerationBatch: chargeBatch,
}));
vi.mock("@/server/billing/credits", () => ({ refundCredits: refund }));
vi.mock("@/server/jobs/client", () => ({ inngest: { send } }));
vi.mock("@/server/repositories/creative-work", () => ({
  createPlannedCreativeWorkOutputs: createOutputs,
  deleteQueuedCreativeWorkOutputs: deleteOutputs,
  failQueuedCreativeWorkOutput: failOutput,
  refreshCreativeWorkStatus: refreshWork,
  setCreativeWorkStatus: setWorkStatus,
}));
vi.mock("@/server/repositories/derivation", () => ({
  createPackageChildIfAbsent: createChild,
  deleteQueuedDerivation: deleteChild,
  updateDerivationStatus,
}));
vi.mock("@/server/repositories/campaign", () => ({ updateCampaign }));

import {
  creativeWorkSettlementAdapter,
  formatAdaptationSettlementAdapter,
} from "./settlement-adapters";
import { startGenerationSettlement } from "./settlement";

const work = { id: "work-1", status: "ready" };
const output = { id: "output-1", status: "queued" };
const source = {
  id: "source-1",
  campaignId: "campaign-1",
  planId: null,
  variantIndex: 0,
  ctaText: "Buy",
};
const child = { id: "child-1", status: "queued" };
const batch = {
  kind: "batch",
  authorship: { workspaceId: "workspace-1", userId: "user-1" },
  origin: "quick_tool",
  surface: "quick_tool",
  intent: { mode: "social_post", objective: "Sell" },
  parentId: "work-1",
  unitCount: 1,
  chargeAmount: 5,
  unitChargeAmount: 5,
  billingKey: "creative-work:work-1:initial",
  refundPolicy: "default",
} as const;

function adapter(kind: "batch" | "unit") {
  if (kind === "batch") {
    return creativeWorkSettlementAdapter({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      userId: "user-1",
      readyWork: work as never,
      plans: [{ creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1 }],
      batch,
    });
  }
  return formatAdaptationSettlementAdapter({
    workspaceId: "workspace-1",
    userId: "user-1",
    targetFormat: "9:16",
    billingIdempotencyKey: "adapt:source-1",
    source: source as never,
  });
}

describe("Generation Settlement production adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spend.mockResolvedValue({ ok: true, creditsSpent: 5 });
    chargeBatch.mockResolvedValue({ ok: true, creditsSpent: 5 });
    refund.mockResolvedValue({ status: "refunded" });
    send.mockResolvedValue(undefined);
    createOutputs.mockResolvedValue({
      outputs: [output],
      newlyCreatedIds: [output.id],
    });
    failOutput.mockResolvedValue({
      ...output,
      status: "failed",
      failureCode: "dispatch_failed",
    });
    refreshWork.mockResolvedValue("failed");
    setWorkStatus.mockResolvedValue({ ...work, status: "generating" });
    createChild.mockResolvedValue({ child, created: true });
    updateDerivationStatus.mockResolvedValue({ ...child, status: "failed" });
    updateCampaign.mockResolvedValue(undefined);
  });

  it.each(["batch", "unit"] as const)(
    "settles a claimed %s and dispatches once",
    async (kind) => {
      const result = await startGenerationSettlement(adapter(kind) as never);

      expect(result.ok).toBe(true);
      expect(send).toHaveBeenCalledOnce();
    },
  );

  it.each(["batch", "unit"] as const)(
    "releases a reserved %s when credits are insufficient",
    async (kind) => {
      const blocked = {
        ok: false,
        status: 402,
        conversionPayload: { reason: "insufficient_credits" },
      };
      if (kind === "batch") chargeBatch.mockResolvedValue(blocked);
      else spend.mockResolvedValue(blocked);

      const result = await startGenerationSettlement(adapter(kind) as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: "credit_blocked" },
      });
      expect(kind === "batch" ? deleteOutputs : deleteChild).toHaveBeenCalledOnce();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each(["batch", "unit"] as const)(
    "does not recharge an idempotent %s replay",
    async (kind) => {
      if (kind === "batch") {
        createOutputs.mockResolvedValue({
          outputs: [output],
          newlyCreatedIds: [],
        });
      } else {
        createChild.mockResolvedValue({ child, created: false });
      }

      const result = await startGenerationSettlement(adapter(kind) as never);

      expect(result.ok).toBe(true);
      expect(kind === "batch" ? chargeBatch : spend).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each(["batch", "unit"] as const)(
    "lets only one concurrent %s claim charge and dispatch",
    async (kind) => {
      let claimed = false;
      if (kind === "batch") {
        createOutputs.mockImplementation(async () => ({
          outputs: [output],
          newlyCreatedIds: claimed ? [] : ((claimed = true), [output.id]),
        }));
      } else {
        createChild.mockImplementation(async () => ({
          child,
          created: claimed ? false : ((claimed = true), true),
        }));
      }

      await Promise.all([
        startGenerationSettlement(adapter(kind) as never),
        startGenerationSettlement(adapter(kind) as never),
      ]);

      expect(kind === "batch" ? chargeBatch : spend).toHaveBeenCalledOnce();
      expect(send).toHaveBeenCalledOnce();
    },
  );

  it.each(["batch", "unit"] as const)(
    "compensates a synchronous %s dispatch failure",
    async (kind) => {
      send.mockRejectedValue(new Error("transport down"));

      const result = await startGenerationSettlement(adapter(kind) as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: "dispatch_failed", compensated: true },
      });
      expect(refund).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 5 }),
      );
    },
  );
});
