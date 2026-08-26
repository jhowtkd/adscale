import { beforeEach, describe, expect, it, vi } from "vitest";

const getGoalMock = vi.hoisted(() => vi.fn());
const listAnnotationsMock = vi.hoisted(() => vi.fn());
const resolveVersionMock = vi.hoisted(() => vi.fn());
const markAddressedMock = vi.hoisted(() => vi.fn());
const adapterInputMock = vi.hoisted(() => vi.fn());
const startSettlementMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/billing/paywall", () => ({
  spendOrApiError: vi.fn(),
  spend: vi.fn(() => Promise.resolve({ ok: true, creditsSpent: 5 })),
}));
vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: vi.fn(),
  failQueuedDerivation: vi.fn(),
  deleteQueuedDerivation: vi.fn(),
  touchQueuedDerivation: vi.fn(),
}));
vi.mock("@/server/assistant/goal/service", () => ({
  resolveGoalCreativeVersion: resolveVersionMock,
}));
vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn(() => Promise.resolve({ ids: ["event-1"] })) },
}));
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
  CREDIT_COSTS: {
    image_derivation: 50,
    creative_work_output: 50,
    social_post: 50,
    restyling: 50,
    regeneration: 50,
  },
}));
vi.mock("@/server/generation/settlement-adapters", () => ({
  campaignDerivationUnitSettlementAdapter: adapterInputMock,
}));
vi.mock("@/server/generation/settlement", () => ({
  startGenerationSettlement: startSettlementMock,
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
      "00000000-4000-4000-8000-000000000032" as unknown as string,
    ] as string[],
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

const settledValue = {
  derivation: {
    id: "child-1",
    campaignId: "campaign-1",
    workspaceId: "ws-1",
    status: "queued",
    format: "1:1",
    generationMode: "creative_revision",
  },
};

describe("executeReviseCreativeAnnotations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGoalMock.mockResolvedValue(goal);
    listAnnotationsMock.mockResolvedValue([
      { id: ctx.inputSnapshot.annotationIds[0], comment: "c1", status: "submitted", x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      { id: ctx.inputSnapshot.annotationIds[1], comment: "c2", status: "submitted", x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
    ]);
    // Source derivation uses a different format than 1:1 so a regression
    // that copied the source format into the generation would be observable.
    resolveVersionMock.mockResolvedValue({
      version: { id: ctx.inputSnapshot.sourceVersionId },
      derivation: {
        id: "00000000-0000-4000-8000-000000000011",
        outputKey: "outputs/source.png",
        creativeLevel: "balanced",
        format: "9:16",
      },
    });
    markAddressedMock.mockResolvedValue([]);
    adapterInputMock.mockReturnValue({ marker: "adapter-input" });
    startSettlementMock.mockResolvedValue({ ok: true, value: settledValue });
  });

  it("delegates to startGenerationSettlement with the adapter factory output and translates the typed derivation result", async () => {
    const result = await executeReviseCreativeAnnotations(ctx);

    expect(adapterInputMock).toHaveBeenCalledTimes(1);
    expect(startSettlementMock).toHaveBeenCalledTimes(1);
    expect(startSettlementMock).toHaveBeenCalledWith({ marker: "adapter-input" });
    expect(result).toEqual({
      mode: "async",
      jobRefs: [{ kind: "derivation", id: "child-1" }],
      resultSummary: "Revisão anotada disparada",
      campaignId: "campaign-1",
    });
  });

  it("pins the annotation generation to 1:1 even when the source derivation is 9:16", async () => {
    await executeReviseCreativeAnnotations(ctx);

    expect(adapterInputMock).toHaveBeenCalledTimes(1);
    const adapterInput = adapterInputMock.mock.calls[0][0];
    expect(adapterInput).toMatchObject({
      targetFormat: "1:1",
      intentMode: "creative_revision",
      assistantActionId: ctx.actionId,
      parentId: "00000000-0000-4000-8000-000000000011",
    });
    const buildEventData = adapterInput.buildEventData;
    expect(
      buildEventData({ id: "child-1", format: "1:1", updatedAt: new Date() }),
    ).toMatchObject({
      format: "1:1",
      generationMode: "creative_revision",
      assistantActionId: ctx.actionId,
    });
  });

  it("throws credit_blocked when settlement reports insufficient credits", async () => {
    startSettlementMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "credit_blocked", reason: "insufficient_credits" },
    });

    await expect(executeReviseCreativeAnnotations(ctx)).rejects.toMatchObject({
      code: "credit_blocked",
    });
  });

  it("throws execution_failed when settlement reports dispatch_failed", async () => {
    startSettlementMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "dispatch_failed", value: settledValue, compensated: true },
    });

    await expect(executeReviseCreativeAnnotations(ctx)).rejects.toMatchObject({
      code: "execution_failed",
    });
  });

  it("rejects a stale goal revision without reaching settlement", async () => {
    getGoalMock.mockResolvedValue({ ...goal, revision: 99 });

    await expect(executeReviseCreativeAnnotations(ctx)).rejects.toBeInstanceOf(
      AssistantActionExecutionError
    );
    expect(startSettlementMock).not.toHaveBeenCalled();
  });

  it("rejects when annotations do not match the submitted ids without reaching settlement", async () => {
    listAnnotationsMock.mockResolvedValue([
      { id: ctx.inputSnapshot.annotationIds[0], comment: "c1", status: "submitted" },
    ]);

    await expect(executeReviseCreativeAnnotations(ctx)).rejects.toBeInstanceOf(
      AssistantActionExecutionError
    );
    expect(startSettlementMock).not.toHaveBeenCalled();
  });
});