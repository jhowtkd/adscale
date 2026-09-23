import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validateCampaign: vi.fn(),
  validateDerivation: vi.fn(),
  insert: vi.fn(),
  dispatch: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../feedback/validate-refs", () => ({
  validateCampaignOwnership: mocks.validateCampaign,
  validateDerivationOwnership: mocks.validateDerivation,
}));
vi.mock("../repositories/output-decision-event", () => ({ insertOutputDecisionEvent: mocks.insert }));
vi.mock("./dispatch", () => ({ dispatchOutputLearningRecomputeBestEffort: mocks.dispatch }));
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.warn } }));

import {
  recordOutputDecisionEvidence,
  recordOutputDecisionEvidenceFromValidatedRootsBestEffort,
} from "./output-decision-recorder";

const input = {
  workspaceId: "workspace-1",
  userId: "user-1",
  campaignId: "campaign-1",
  derivationId: "root-1",
  action: "selected_for_delivery" as const,
  source: "test",
};

describe("output decision ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockResolvedValue({ id: "event-1" });
    mocks.dispatch.mockResolvedValue(undefined);
  });

  it("still validates both references for an isolated write", async () => {
    await recordOutputDecisionEvidence(input);

    expect(mocks.validateCampaign).toHaveBeenCalledWith("workspace-1", "campaign-1");
    expect(mocks.validateDerivation).toHaveBeenCalledWith("workspace-1", "root-1", "campaign-1");
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it("uses the scoped approval context and rejects roots outside it", async () => {
    const context = {
      campaign: { id: "campaign-1", workspaceId: "workspace-1" },
      approvedRootIds: new Set(["root-1"]),
    };

    expect(await recordOutputDecisionEvidenceFromValidatedRootsBestEffort(input, context))
      .toEqual({ id: "event-1" });
    expect(mocks.validateCampaign).not.toHaveBeenCalled();
    expect(mocks.validateDerivation).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledTimes(1);

    expect(await recordOutputDecisionEvidenceFromValidatedRootsBestEffort(
      { ...input, derivationId: "foreign-root" }, context,
    )).toBeNull();
    expect(await recordOutputDecisionEvidenceFromValidatedRootsBestEffort(input, {
      ...context,
      campaign: { ...context.campaign, workspaceId: "other-workspace" },
    })).toBeNull();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});
