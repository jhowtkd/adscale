import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewOutputDecisionEvent } from "../db/schema";

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

    expect(mocks.validateCampaign).toHaveBeenCalledWith("workspace-1", "campaign-1", undefined);
    expect(mocks.validateDerivation).toHaveBeenCalledWith("workspace-1", "root-1", "campaign-1");
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "secret", feedback: "DATABASE_URL=postgres://discarded-secret", userFeedback: null },
    { label: "overlong", feedback: "x".repeat(700), userFeedback: "x".repeat(500) },
  ])("sanitizes $label regeneration feedback in the recorded evidence", async ({ feedback, userFeedback }) => {
    mocks.insert.mockImplementation(async (event: NewOutputDecisionEvent) => ({ ...event, id: "event-1" }));
    const event = await recordOutputDecisionEvidence({
      ...input, action: "regenerated",
      snapshotExtras: {
        userFeedback: feedback,
        reason: { code: "cta_drift", text: "CTA incorreto", source: "hard_failures" },
      },
    });

    expect(event.contextSnapshot).toMatchObject({
      userFeedback, evidenceSanitized: true,
      reason: { code: "cta_drift", text: "CTA incorreto", source: "hard_failures" },
    });
    expect(JSON.stringify(event)).not.toContain("discarded-secret");
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
