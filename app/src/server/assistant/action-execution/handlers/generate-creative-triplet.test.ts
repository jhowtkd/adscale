import { beforeEach, describe, expect, it, vi } from "vitest";

const getGoalMock = vi.hoisted(() => vi.fn());
const settleMock = vi.hoisted(() => vi.fn());
const buildAdapterMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/assistant-goal", () => ({
  getGoalRunScoped: getGoalMock,
}));
vi.mock("@/server/generation/settlement", () => ({
  startGenerationSettlement: settleMock,
}));
vi.mock("@/server/generation/settlement-adapters", () => ({
  assistantCreativeTripletSettlementAdapter: buildAdapterMock,
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

const adapter = { kind: "triplet-adapter" };
const derivations = [
  { id: "deriv-1" },
  { id: "deriv-2" },
  { id: "deriv-3" },
];

describe("executeGenerateCreativeTriplet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGoalMock.mockResolvedValue(goal);
    buildAdapterMock.mockReturnValue(adapter);
    settleMock.mockResolvedValue({ ok: true, value: { derivations } });
  });

  it("translates a settled triplet through the canonical interface", async () => {
    const result = await executeGenerateCreativeTriplet(ctx);

    expect(buildAdapterMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      userId: "user-1",
      campaignId: "campaign-1",
      actionId: "action-1",
      format: "1:1",
      planVersionId: ctx.inputSnapshot.planVersionId,
      goalRunId: ctx.inputSnapshot.goalRunId,
      locale: "pt-BR",
    });
    expect(settleMock).toHaveBeenCalledWith(adapter);
    expect(result).toEqual({
      mode: "async",
      jobRefs: [
        { kind: "derivation", id: "deriv-1" },
        { kind: "derivation", id: "deriv-2" },
        { kind: "derivation", id: "deriv-3" },
      ],
      resultSummary: "Três direções criativas disparadas",
      campaignId: "campaign-1",
    });
  });

  it("maps credit_blocked and dispatch_failed from typed settlement results", async () => {
    settleMock
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "credit_blocked", reason: "insufficient_credits" },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "dispatch_failed",
          value: { derivations },
          compensated: true,
        },
      });

    await expect(executeGenerateCreativeTriplet(ctx)).rejects.toMatchObject({
      code: "credit_blocked",
      message: "Insufficient credits",
    });
    await expect(executeGenerateCreativeTriplet(ctx)).rejects.toMatchObject({
      code: "execution_failed",
      message: "Failed to queue creative triplet",
    });
  });

  it("rejects a stale goal revision without settling", async () => {
    getGoalMock.mockResolvedValue({ ...goal, revision: 99 });

    await expect(executeGenerateCreativeTriplet(ctx)).rejects.toBeInstanceOf(
      AssistantActionExecutionError,
    );
    expect(settleMock).not.toHaveBeenCalled();
  });
});
