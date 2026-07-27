import { beforeEach, describe, expect, it, vi } from "vitest";

const getContract = vi.hoisted(() => vi.fn());
const getThread = vi.hoisted(() => vi.fn());
const getCampaign = vi.hoisted(() => vi.fn());
const updateCampaign = vi.hoisted(() => vi.fn());
const getAsset = vi.hoisted(() => vi.fn());
const getPlan = vi.hoisted(() => vi.fn());
const settle = vi.hoisted(() => vi.fn());
const buildAdapter = vi.hoisted(() => vi.fn());

vi.mock("@/server/assistant/action-contracts/registry", () => ({
  getActionContract: getContract,
}));
vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: getThread,
}));
vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: getCampaign,
  updateCampaign,
}));
vi.mock("@/server/repositories/asset", () => ({
  getAssetWithMetadata: getAsset,
  getAssetsByCampaign: vi.fn(),
}));
vi.mock("@/server/repositories/plan", () => ({
  getPlanByCampaign: getPlan,
  createPlan: vi.fn(),
}));
vi.mock("@/server/repositories/guided-flow", () => ({
  getGuidedFlowByThread: vi.fn(),
}));
vi.mock("@/server/generation/settlement", () => ({
  startGenerationSettlement: settle,
}));
vi.mock("@/server/generation/settlement-adapters", () => ({
  assistantPreviewSettlementAdapter: buildAdapter,
}));

import { z } from "zod";
import { executeStartCompleteCampaign } from "./start-complete-campaign";

const inputSnapshot = {
  baseCreativeId: "00000000-0000-4000-8000-0000000000a1",
  productOffer: "Curso",
  audience: "Pais",
  objective: "Matriculas",
  constraints: "",
  platformOrFormat: "1:1",
  cta: "Saiba mais",
  styleReferenceId: null,
};

const ctx = {
  workspaceId: "ws-1",
  actionId: "action-1",
  threadId: "thread-1",
  clientProfileId: "client-1",
  userId: "user-1",
  locale: "pt-BR",
  actionType: "start_complete_campaign",
  inputSnapshot,
};

const adapter = { kind: "preview-adapter" };
const derivation = { id: "preview-1" };

describe("executeStartCompleteCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getContract.mockReturnValue({
      inputSchema: z.object({
        baseCreativeId: z.string(),
        productOffer: z.string(),
        audience: z.string(),
        objective: z.string(),
        constraints: z.string(),
        platformOrFormat: z.string(),
        cta: z.string(),
        styleReferenceId: z.string().nullable(),
      }),
    });
    getThread.mockResolvedValue({ campaignId: "campaign-1" });
    getCampaign.mockResolvedValue({ id: "campaign-1" });
    getAsset.mockResolvedValue({
      id: inputSnapshot.baseCreativeId,
      campaignId: "campaign-1",
    });
    getPlan.mockResolvedValue({ id: "plan-1" });
    buildAdapter.mockReturnValue(adapter);
    settle.mockResolvedValue({ ok: true, value: { derivation } });
  });

  it("translates preview generation through canonical settlement", async () => {
    const result = await executeStartCompleteCampaign(ctx);

    expect(buildAdapter).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      userId: "user-1",
      campaignId: "campaign-1",
      actionId: "action-1",
      planId: "plan-1",
      format: "1:1",
      ctaText: "Saiba mais",
      styleAssetId: null,
      locale: "pt-BR",
    });
    expect(settle).toHaveBeenCalledWith(adapter);
    expect(result).toEqual({
      mode: "async",
      jobRef: { kind: "derivation", id: "preview-1" },
      resultSummary: "Preview generation queued (preview-1)",
      campaignId: "campaign-1",
    });
  });

  it("maps credit_blocked and dispatch_failed from typed settlement results", async () => {
    settle
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "credit_blocked", reason: "insufficient_credits" },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "dispatch_failed",
          value: { derivation },
          compensated: true,
        },
      });

    await expect(executeStartCompleteCampaign(ctx)).rejects.toMatchObject({
      code: "credit_blocked",
      message: "Insufficient credits",
    });
    await expect(executeStartCompleteCampaign(ctx)).rejects.toMatchObject({
      code: "execution_failed",
      message: "Failed to queue preview generation",
    });
  });
});
