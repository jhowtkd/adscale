import { beforeEach, describe, expect, it, vi } from "vitest";

const spendMock = vi.hoisted(() => vi.fn());
const createChildMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const getGoalMock = vi.hoisted(() => vi.fn());
const getDerivationMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/billing/paywall", () => ({ spendOrApiError: spendMock }));
vi.mock("@/server/repositories/derivation", () => ({
  createPackageChildIfAbsent: createChildMock,
  getDerivationById: getDerivationMock,
}));
vi.mock("@/server/jobs/client", () => ({ inngest: { send: sendMock } }));
vi.mock("@/server/repositories/assistant-goal", () => ({
  getGoalRunScoped: getGoalMock,
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
  id: ctx.inputSnapshot.baseVersionId,
  outputKey: "outputs/base.png",
  creativeLevel: "balanced",
  ctaText: "Compre",
};

describe("executeGenerateGoalPackage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spendMock.mockResolvedValue(null);
    getGoalMock.mockResolvedValue(goal);
    getDerivationMock.mockResolvedValue(baseDerivation);
    let i = 0;
    createChildMock.mockImplementation((data: { format: string }) => {
      i += 1;
      return {
        child: { id: `child-${i}`, campaignId: "campaign-1", format: data.format },
        created: true,
      };
    });
    sendMock.mockResolvedValue(undefined);
  });

  it("charges 15 credits once before dispatch", async () => {
    await executeGenerateGoalPackage(ctx);

    expect(spendMock).toHaveBeenCalledTimes(1);
    expect(spendMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "delivery_package_child", amount: 15 })
    );
  });

  it("proposes exactly 4:5, 9:16, and 16:9 children", async () => {
    await executeGenerateGoalPackage(ctx);

    expect(createChildMock).toHaveBeenCalledTimes(3);
    const formats = createChildMock.mock.calls.map((c) => c[0].format).sort();
    expect(formats).toEqual(["16:9", "4:5", "9:16"]);
  });

  it("binds every child to the approved base and copies creativeLevel", async () => {
    await executeGenerateGoalPackage(ctx);

    for (const call of createChildMock.mock.calls) {
      expect(call[0].parentId).toBe(ctx.inputSnapshot.baseVersionId);
      expect(call[0].generationMode).toBe("format_adaptation");
      expect(call[0].creativeLevel).toBe("balanced");
    }
  });

  it("dispatches three non-refundable package events", async () => {
    await executeGenerateGoalPackage(ctx);

    expect(sendMock).toHaveBeenCalledTimes(3);
    for (const call of sendMock.mock.calls) {
      expect(call[0].data.refundPolicy).toBe("none");
      expect(call[0].data.generationMode).toBe("format_adaptation");
      expect(call[0].data.assistantActionId).toBe(ctx.actionId);
    }
  });

  it("rejects a stale goal revision", async () => {
    getGoalMock.mockResolvedValue({ ...goal, revision: 99 });

    await expect(executeGenerateGoalPackage(ctx)).rejects.toBeInstanceOf(
      AssistantActionExecutionError
    );
  });

  it("returns all three child job refs", async () => {
    const result = await executeGenerateGoalPackage(ctx);

    expect(result.mode).toBe("async");
    expect(result.jobRefs).toHaveLength(3);
  });
});
