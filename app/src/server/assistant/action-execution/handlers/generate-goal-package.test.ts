import { beforeEach, describe, expect, it, vi } from "vitest";

const getGoalMock = vi.hoisted(() => vi.fn());
const resolveVersionMock = vi.hoisted(() => vi.fn());
const settleMock = vi.hoisted(() => vi.fn());
const buildAdapterMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/assistant-goal", () => ({
  getGoalRunScoped: getGoalMock,
}));
vi.mock("@/server/assistant/goal/service", () => ({
  resolveGoalCreativeVersion: resolveVersionMock,
}));
vi.mock("@/server/generation/settlement", () => ({
  startGenerationSettlement: settleMock,
}));
vi.mock("@/server/generation/settlement-adapters", () => ({
  assistantGoalPackageSettlementAdapter: buildAdapterMock,
}));

import { executeGenerateGoalPackage } from "./generate-goal-package";
import { AssistantActionExecutionError } from "../types";

const ctx = {
  workspaceId: "ws-1",
  actionId: "00000000-0000-4000-8000-0000000000a1",
  threadId: "00000000-0000-4000-8000-0000000000t1",
  clientProfileId: "client-1",
  userId: "user-1",
  locale: "pt-BR",
  actionType: "generate_goal_package",
  inputSnapshot: {
    goalRunId: "00000000-0000-4000-8000-000000000001",
    goalRevision: 6,
    baseVersionId: "00000000-0000-4000-8000-000000000021",
    planVersionId: "00000000-0000-4000-8000-000000000002",
  },
};

const goal = {
  id: ctx.inputSnapshot.goalRunId,
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  threadId: ctx.threadId,
  campaignId: "campaign-1",
  revision: 6,
  stage: "awaiting_package",
  selectedBaseVersionId: ctx.inputSnapshot.baseVersionId,
};

const baseDerivation = {
  id: "00000000-0000-4000-8000-000000000011",
  outputKey: "outputs/base.png",
  creativeLevel: "balanced",
  ctaText: "Compre",
};

const adapter = { kind: "goal-package-adapter" };
const derivations = [
  { id: "child-1" },
  { id: "child-2" },
  { id: "child-3" },
];

describe("executeGenerateGoalPackage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGoalMock.mockResolvedValue(goal);
    resolveVersionMock.mockResolvedValue({
      version: { id: ctx.inputSnapshot.baseVersionId },
      derivation: baseDerivation,
    });
    buildAdapterMock.mockReturnValue(adapter);
    settleMock.mockResolvedValue({ ok: true, value: { derivations } });
  });

  it("translates a settled package through the canonical interface", async () => {
    const result = await executeGenerateGoalPackage(ctx);

    expect(buildAdapterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        userId: "user-1",
        campaignId: "campaign-1",
        actionId: ctx.actionId,
        baseDerivation,
        formats: ["4:5", "9:16", "16:9"],
        planVersionId: ctx.inputSnapshot.planVersionId,
        goalRunId: ctx.inputSnapshot.goalRunId,
        locale: "pt-BR",
        amount: 15,
        unitChargeAmount: 5,
      }),
    );
    expect(settleMock).toHaveBeenCalledWith(adapter);
    expect(result).toEqual({
      mode: "async",
      jobRefs: [
        { kind: "derivation", id: "child-1" },
        { kind: "derivation", id: "child-2" },
        { kind: "derivation", id: "child-3" },
      ],
      resultSummary: "Pacote de formatos disparado",
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

    await expect(executeGenerateGoalPackage(ctx)).rejects.toMatchObject({
      code: "credit_blocked",
    });
    await expect(executeGenerateGoalPackage(ctx)).rejects.toMatchObject({
      code: "execution_failed",
      message: "Failed to queue goal package",
    });
  });

  it("rejects a stale goal revision without settling", async () => {
    getGoalMock.mockResolvedValue({ ...goal, revision: 99 });

    await expect(executeGenerateGoalPackage(ctx)).rejects.toBeInstanceOf(
      AssistantActionExecutionError,
    );
    expect(settleMock).not.toHaveBeenCalled();
  });

  it("maps missing base to derivation_not_found", async () => {
    resolveVersionMock.mockResolvedValue(null);

    await expect(executeGenerateGoalPackage(ctx)).rejects.toMatchObject({
      code: "derivation_not_found",
    });
    expect(settleMock).not.toHaveBeenCalled();
  });
});
