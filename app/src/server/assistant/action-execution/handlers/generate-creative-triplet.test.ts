import { beforeEach, describe, expect, it, vi } from "vitest";

const spendMock = vi.hoisted(() => vi.fn());
const createDerivationMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const updateStatusMock = vi.hoisted(() => vi.fn());
const getGoalMock = vi.hoisted(() => vi.fn());
const getCampaignMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/billing/paywall", () => ({
  spendOrApiError: spendMock,
}));

vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: createDerivationMock,
  updateDerivationStatus: updateStatusMock,
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: sendMock },
}));

vi.mock("@/server/repositories/assistant-goal", () => ({
  getGoalRunScoped: getGoalMock,
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: getCampaignMock,
}));

import { executeGenerateCreativeTriplet } from "./generate-creative-triplet";
import { AssistantActionExecutionError } from "../types";

const ctx = {
  workspaceId: "ws-1",
  actionId: "action-1",
  threadId: "thread-1",
  clientProfileId: "client-1",
  userId: "user-1",
  locale: "pt-BR",
  actionType: "generate_creative_triplet",
  inputSnapshot: {
    goalRunId: "00000000-0000-4000-8000-000000000001",
    goalRevision: 1,
    planVersionId: "00000000-0000-4000-8000-000000000002",
    format: "1:1",
  },
};

const goal = {
  id: ctx.inputSnapshot.goalRunId,
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  threadId: "thread-1",
  campaignId: "campaign-1",
  revision: 1,
  stage: "awaiting_generation",
  brief: {},
  plan: {},
};

describe("executeGenerateCreativeTriplet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spendMock.mockResolvedValue(null);
    getGoalMock.mockResolvedValue(goal);
    getCampaignMock.mockResolvedValue({ id: "campaign-1", name: "Acme" });
    let derivIndex = 0;
    createDerivationMock.mockImplementation(() => {
      derivIndex += 1;
      return { id: `deriv-${derivIndex}`, campaignId: "campaign-1" };
    });
    sendMock.mockResolvedValue(undefined);
    updateStatusMock.mockResolvedValue(undefined);
  });

  it("marks a triplet slot failed when dispatch fails", async () => {
    sendMock.mockRejectedValueOnce(new Error("dispatch failed"));

    await executeGenerateCreativeTriplet(ctx);

    expect(updateStatusMock).toHaveBeenCalledWith("deriv-1", "ws-1", "failed");
  });

  it("charges 15 credits once before creating jobs", async () => {
    await executeGenerateCreativeTriplet(ctx);

    expect(spendMock).toHaveBeenCalledTimes(1);
    expect(spendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "image_derivation",
        amount: 15,
        idempotencyKey: expect.stringContaining("creative-triplet"),
      })
    );
  });

  it("creates exactly three 1:1 derivations with fixed creative levels", async () => {
    await executeGenerateCreativeTriplet(ctx);

    expect(createDerivationMock).toHaveBeenCalledTimes(3);
    const created = createDerivationMock.mock.calls.map((c) => c[0]);
    expect(created.every((d) => d.format === "1:1")).toBe(true);
    expect(created.map((d) => d.creativeLevel).sort()).toEqual([
      "balanced",
      "bold",
      "conservative",
    ]);
    // variantIndex stays 0 for every row so only intensity varies.
    expect(created.every((d) => d.variantIndex === 0)).toBe(true);
  });

  it("dispatches three derivation.generate events with non-refundable policy", async () => {
    await executeGenerateCreativeTriplet(ctx);

    expect(sendMock).toHaveBeenCalledTimes(3);
    for (const call of sendMock.mock.calls) {
      expect(call[0].name).toBe("derivation.generate");
      expect(call[0].data.refundPolicy).toBe("none");
      expect(call[0].data.assistantActionId).toBe("action-1");
      expect(call[0].data.generationMode).toBe("art_variation");
      expect(call[0].data.format).toBe("1:1");
      expect(call[0].data.variantIndex).toBe(0);
    }
  });

  it("throws credit_blocked when spend fails", async () => {
    spendMock.mockResolvedValue(new Response("blocked", { status: 402 }));

    await expect(executeGenerateCreativeTriplet(ctx)).rejects.toBeInstanceOf(
      AssistantActionExecutionError
    );
    expect(createDerivationMock).not.toHaveBeenCalled();
  });

  it("rejects a stale goal revision", async () => {
    getGoalMock.mockResolvedValue({ ...goal, revision: 99 });

    await expect(executeGenerateCreativeTriplet(ctx)).rejects.toBeInstanceOf(
      AssistantActionExecutionError
    );
  });

  it("returns all three derivation job refs", async () => {
    const result = await executeGenerateCreativeTriplet(ctx);

    expect(result.mode).toBe("async");
    expect(result.jobRefs).toHaveLength(3);
    expect(result.jobRefs?.every((r) => r.kind === "derivation")).toBe(true);
  });
});
