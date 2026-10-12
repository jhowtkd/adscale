import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ campaign: vi.fn(), brand: vi.fn() }));
vi.mock("./service", () => ({
  recomputeOutputLearningsForCampaign: mocks.campaign,
  recomputeClientOutputLearnings: mocks.brand,
}));
import { dispatchOutputLearningRecomputeBestEffort } from "./dispatch";

describe("output learning recompute scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recomputes current Peça evidence by brand without a campaign", async () => {
    await dispatchOutputLearningRecomputeBestEffort({ workspaceId: "ws-1", clientProfileId: "brand-1", campaignId: null });
    expect(mocks.brand).toHaveBeenCalledWith({ workspaceId: "ws-1", clientProfileId: "brand-1" });
    expect(mocks.campaign).not.toHaveBeenCalled();
  });

  it("keeps legacy campaign recomputation and ignores an absent scope", async () => {
    await dispatchOutputLearningRecomputeBestEffort({ workspaceId: "ws-1", campaignId: "campaign-1" });
    expect(mocks.campaign).toHaveBeenCalledWith({ workspaceId: "ws-1", campaignId: "campaign-1" });
    expect(await dispatchOutputLearningRecomputeBestEffort({ workspaceId: "ws-1", campaignId: null })).toBeNull();
    expect(mocks.campaign).toHaveBeenCalledOnce();
    expect(mocks.brand).not.toHaveBeenCalled();
  });
});
