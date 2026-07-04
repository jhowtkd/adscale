import { beforeEach, describe, expect, it, vi } from "vitest";

const spendMock = vi.hoisted(() => vi.fn());
const createDerivationMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const getGoalMock = vi.hoisted(() => vi.fn());
const listAnnotationsMock = vi.hoisted(() => vi.fn());
const getDerivationMock = vi.hoisted(() => vi.fn());
const markAddressedMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/billing/paywall", () => ({ spendOrApiError: spendMock }));
vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: createDerivationMock,
  getDerivationById: getDerivationMock,
}));
vi.mock("@/server/jobs/client", () => ({ inngest: { send: sendMock } }));
vi.mock("@/server/repositories/assistant-goal", () => ({
  getGoalRunScoped: getGoalMock,
  listAnnotationsForVersion: listAnnotationsMock,
  markAnnotationsAddressed: markAddressedMock,
}));

import { executeReviseCreativeAnnotations } from "./revise-creative-annotations";
import { AssistantActionExecutionError } from "../types";

const ctx = {
  workspaceId: "ws-1",
  actionId: "00000000-0000-4000-8000-0000000000a1",
  threadId: "00000000-0000-4000-8000-0000000000t1",
  clientProfileId: "client-1",
  userId: "user-1",
  locale: "pt-BR",
  actionType: "revise_creative_annotations",
  inputSnapshot: {
    goalRunId: "00000000-0000-4000-8000-000000000001",
    goalRevision: 4,
    sourceVersionId: "00000000-0000-4000-8000-000000000021",
    planVersionId: "00000000-0000-4000-8000-000000000002",
    annotationIds: [
      "00000000-0000-4000-8000-000000000031",
      "00000000-0000-4000-8000-000000000032",
    ],
  },
};

const goal = {
  id: ctx.inputSnapshot.goalRunId,
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  threadId: ctx.threadId,
  campaignId: "campaign-1",
  revision: 4,
};

describe("executeReviseCreativeAnnotations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spendMock.mockResolvedValue(null);
    getGoalMock.mockResolvedValue(goal);
    listAnnotationsMock.mockResolvedValue([
      { id: ctx.inputSnapshot.annotationIds[0], comment: "c1", status: "submitted", x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      { id: ctx.inputSnapshot.annotationIds[1], comment: "c2", status: "submitted", x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
    ]);
    getDerivationMock.mockResolvedValue({
      id: ctx.inputSnapshot.sourceVersionId,
      outputKey: "outputs/source.png",
      creativeLevel: "balanced",
    });
    createDerivationMock.mockResolvedValue({ id: "child-1", campaignId: "campaign-1" });
    sendMock.mockResolvedValue(undefined);
    markAddressedMock.mockResolvedValue([]);
  });

  it("charges 5 credits once and never refunds", async () => {
    await executeReviseCreativeAnnotations(ctx);

    expect(spendMock).toHaveBeenCalledTimes(1);
    expect(spendMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "image_derivation", amount: 5 })
    );
  });

  it("creates a child derivation with parentId equal to the source", async () => {
    await executeReviseCreativeAnnotations(ctx);

    expect(createDerivationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: ctx.inputSnapshot.sourceVersionId,
        generationMode: "creative_revision",
        format: "1:1",
      })
    );
  });

  it("dispatches one creative_revision event with non-refundable policy", async () => {
    await executeReviseCreativeAnnotations(ctx);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const data = sendMock.mock.calls[0][0].data;
    expect(sendMock.mock.calls[0][0].name).toBe("derivation.generate");
    expect(data.refundPolicy).toBe("none");
    expect(data.generationMode).toBe("creative_revision");
    expect(data.assistantActionId).toBe(ctx.actionId);
  });

  it("rejects a stale goal revision", async () => {
    getGoalMock.mockResolvedValue({ ...goal, revision: 99 });

    await expect(executeReviseCreativeAnnotations(ctx)).rejects.toBeInstanceOf(
      AssistantActionExecutionError
    );
  });

  it("rejects when annotations do not match the submitted ids", async () => {
    listAnnotationsMock.mockResolvedValue([
      { id: ctx.inputSnapshot.annotationIds[0], comment: "c1", status: "submitted" },
    ]);

    await expect(executeReviseCreativeAnnotations(ctx)).rejects.toBeInstanceOf(
      AssistantActionExecutionError
    );
    expect(spendMock).not.toHaveBeenCalled();
  });
});
