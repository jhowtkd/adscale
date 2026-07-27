import { beforeEach, describe, expect, it, vi } from "vitest";

const createDerivationMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const getGoalMock = vi.hoisted(() => vi.fn());
const listAnnotationsMock = vi.hoisted(() => vi.fn());
const resolveVersionMock = vi.hoisted(() => vi.fn());
const markAddressedMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/billing/paywall", () => ({
  spendOrApiError: vi.fn(),
  spend: vi.fn(() => Promise.resolve({ ok: true, creditsSpent: 5 })),
}));
vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: createDerivationMock,
  failQueuedDerivation: vi.fn(),
  deleteQueuedDerivation: vi.fn(),
  touchQueuedDerivation: vi.fn(),
}));
vi.mock("@/server/assistant/goal/service", () => ({
  resolveGoalCreativeVersion: resolveVersionMock,
}));
vi.mock("@/server/jobs/client", () => ({ inngest: { send: sendMock } }));
vi.mock("@/server/repositories/assistant-goal", () => ({
  getGoalRunScoped: getGoalMock,
  listAnnotationsForVersion: listAnnotationsMock,
  markAnnotationsAddressed: markAddressedMock,
}));
vi.mock("@/server/repositories/campaign", () => ({
  updateCampaign: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: vi.fn(() => Promise.resolve(null)),
  trackUsage: vi.fn(() => Promise.resolve({ id: "u-1" })),
}));
vi.mock("@/server/billing/credits", () => ({
  refundCredits: vi.fn(),
  CREDIT_COSTS: { image_derivation: 5, creative_work_output: 5, social_post: 5, restyling: 5, regeneration: 5 },
}));
vi.mock("@/server/generation/settlement", () => ({
  startGenerationSettlement: vi.fn(),
}));

import { executeReviseCreativeAnnotations } from "./revise-creative-annotations";
import { AssistantActionExecutionError } from "../types";
import { startGenerationSettlement } from "@/server/generation/settlement";
const mockStartSettlement = vi.mocked(startGenerationSettlement);

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
    getGoalMock.mockResolvedValue(goal);
    listAnnotationsMock.mockResolvedValue([
      { id: ctx.inputSnapshot.annotationIds[0], comment: "c1", status: "submitted", x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      { id: ctx.inputSnapshot.annotationIds[1], comment: "c2", status: "submitted", x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
    ]);
    resolveVersionMock.mockResolvedValue({
      version: { id: ctx.inputSnapshot.sourceVersionId },
      derivation: {
        id: "00000000-0000-4000-8000-000000000011",
        outputKey: "outputs/source.png",
        creativeLevel: "balanced",
        format: "1:1",
      },
    });
    createDerivationMock.mockResolvedValue({
      id: "child-1",
      campaignId: "campaign-1",
      workspaceId: "ws-1",
      status: "queued",
      format: "1:1",
      generationMode: "creative_revision",
      updatedAt: new Date("2026-07-27T12:00:00.000Z"),
    });
    sendMock.mockResolvedValue(undefined);
    markAddressedMock.mockResolvedValue([]);
    mockStartSettlement.mockImplementation(async (adapter) => {
      const reservation = await adapter.reserve();
      const charge = await adapter.charge(reservation);
      if (!charge.ok) {
        return { ok: false, error: { code: "credit_blocked", reason: charge.reason } };
      }
      await adapter.dispatch(reservation);
      await adapter.completeDispatch(reservation);
      return { ok: true, value: reservation.value };
    });
  });

  it("delegates charge, reservation, and dispatch to Generation Settlement", async () => {
    await executeReviseCreativeAnnotations(ctx);

    expect(mockStartSettlement).toHaveBeenCalledTimes(1);
    expect(createDerivationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "00000000-0000-4000-8000-000000000011",
        generationMode: "creative_revision",
        format: "1:1",
      })
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("dispatches a creative_revision event with non-refundable policy", async () => {
    await executeReviseCreativeAnnotations(ctx);

    const data = sendMock.mock.calls[0][0].data;
    expect(sendMock.mock.calls[0][0].name).toBe("derivation.generate");
    expect(data.refundPolicy).toBe("none");
    expect(data.generationMode).toBe("creative_revision");
    expect(data.assistantActionId).toBe(ctx.actionId);
  });

  it("throws credit_blocked when settlement reports insufficient credits", async () => {
    mockStartSettlement.mockResolvedValueOnce({
      ok: false,
      error: { code: "credit_blocked", reason: "insufficient_credits" },
    });

    await expect(executeReviseCreativeAnnotations(ctx)).rejects.toMatchObject({
      code: "credit_blocked",
    });
  });

  it("rejects a stale goal revision", async () => {
    getGoalMock.mockResolvedValue({ ...goal, revision: 99 });

    await expect(executeReviseCreativeAnnotations(ctx)).rejects.toBeInstanceOf(
      AssistantActionExecutionError
    );
    expect(mockStartSettlement).not.toHaveBeenCalled();
  });

  it("rejects when annotations do not match the submitted ids", async () => {
    listAnnotationsMock.mockResolvedValue([
      { id: ctx.inputSnapshot.annotationIds[0], comment: "c1", status: "submitted" },
    ]);

    await expect(executeReviseCreativeAnnotations(ctx)).rejects.toBeInstanceOf(
      AssistantActionExecutionError
    );
    expect(mockStartSettlement).not.toHaveBeenCalled();
  });
});