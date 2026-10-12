import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewOutputDecisionEvent } from "../db/schema";

const mocks = vi.hoisted(() => ({
  validateCampaign: vi.fn(),
  validateDerivation: vi.fn(),
  insert: vi.fn(),
  dispatch: vi.fn(),
  warn: vi.fn(),
  getBrand: vi.fn(),
  getCampaign: vi.fn(),
  scopeRows: vi.fn(),
}));

vi.mock("../db", () => ({
  db: { select: () => {
    const query = { from: () => query, innerJoin: () => query, where: () => query, limit: mocks.scopeRows };
    return query;
  } },
}));
vi.mock("../feedback/validate-refs", async (importOriginal) => ({
  ...await importOriginal<typeof import("../feedback/validate-refs")>(),
  validateCampaignOwnership: mocks.validateCampaign,
  validateDerivationOwnership: mocks.validateDerivation,
}));
vi.mock("../repositories/output-decision-event", () => ({ insertOutputDecisionEvent: mocks.insert }));
vi.mock("./dispatch", () => ({ dispatchOutputLearningRecomputeBestEffort: mocks.dispatch }));
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.warn } }));
vi.mock("../repositories/client-reference", () => ({ getClientProfile: mocks.getBrand }));
vi.mock("../repositories/campaign", () => ({ getCampaignById: mocks.getCampaign }));

import {
  recordLocalLearningDecisionEvidence,
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

const localScope = {
  workspaceId: "770e8400-e29b-41d4-a716-446655440001",
  clientProfileId: "770e8400-e29b-41d4-a716-446655440002",
};

describe("output decision ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockResolvedValue({ id: "event-1" });
    mocks.dispatch.mockResolvedValue(undefined);
    mocks.getCampaign.mockResolvedValue({ id: input.campaignId, ...localScope });
    mocks.scopeRows.mockResolvedValue([{ clientProfileId: localScope.clientProfileId, campaignId: null }]);
  });

  it("resolves the brand from the current Peça's Trabalho without a campaign or derivation", async () => {
    mocks.insert.mockImplementation(async (event: NewOutputDecisionEvent) => ({ ...event, id: "current-event" }));
    const event = await recordOutputDecisionEvidence({
      workspaceId: localScope.workspaceId, userId: input.userId,
      creativeWorkOutputId: "current-output", action: "approved", source: "test",
    });
    expect(event).toMatchObject({
      clientProfileId: localScope.clientProfileId, campaignId: null,
      derivationId: null, creativeWorkOutputId: "current-output",
    });
    expect(mocks.validateCampaign).not.toHaveBeenCalled();
    expect(mocks.validateDerivation).not.toHaveBeenCalled();
    expect(mocks.dispatch).toHaveBeenCalledWith({ ...localScope, campaignId: null });
  });

  it("consults local authorization using the current Trabalho's brand", async () => {
    const authorize = vi.fn().mockResolvedValue({ allowed: false, reason: "local_learning_denied" });
    await expect(recordLocalLearningDecisionEvidence({
      workspaceId: localScope.workspaceId, userId: input.userId,
      creativeWorkOutputId: "current-output", action: "approved", source: "test",
    }, authorize)).rejects.toMatchObject({ reason: "local_learning_denied" });
    expect(authorize).toHaveBeenCalledWith(localScope);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("resolves and preserves the linked campaign from the current Trabalho", async () => {
    mocks.scopeRows.mockResolvedValue([{ clientProfileId: localScope.clientProfileId, campaignId: "linked-campaign" }]);
    await recordOutputDecisionEvidence({
      workspaceId: localScope.workspaceId, userId: input.userId,
      creativeWorkOutputId: "current-output", action: "approved", source: "test",
    });
    expect(mocks.validateCampaign).toHaveBeenCalledWith(localScope.workspaceId, "linked-campaign", localScope.clientProfileId);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      ...localScope, campaignId: "linked-campaign", derivationId: null, creativeWorkOutputId: "current-output",
    }));
    expect(mocks.validateDerivation).not.toHaveBeenCalled();
  });

  it.each([
    { refs: { campaignId: null, derivationId: null }, code: "invalid_output_reference" },
    { refs: { creativeWorkOutputId: "current-output" }, code: "invalid_output_reference" },
    { refs: { campaignId: null }, code: "invalid_campaign" },
  ])("refuses invalid Peça references before writing ($code)", async ({ refs, code }) => {
    await expect(recordOutputDecisionEvidence({ ...input, ...refs })).rejects.toMatchObject({ code });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it.each([
    { clientProfileId: "other-brand", code: "invalid_creative_work_output_brand" },
    { campaignId: "other-campaign", code: "invalid_creative_work_output_campaign" },
  ])("refuses relabeling a current Peça ($code)", async ({ code, ...refs }) => {
    await expect(recordOutputDecisionEvidence({
      workspaceId: localScope.workspaceId, userId: input.userId,
      creativeWorkOutputId: "current-output", action: "approved", source: "test", ...refs,
    })).rejects.toMatchObject({ code });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("refuses a current Peça outside the workspace", async () => {
    mocks.scopeRows.mockResolvedValue([]);
    await expect(recordOutputDecisionEvidence({
      workspaceId: localScope.workspaceId, userId: input.userId,
      creativeWorkOutputId: "foreign-output", action: "approved", source: "test",
    })).rejects.toMatchObject({ code: "invalid_creative_work_output" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("still validates both references for an isolated write", async () => {
    await recordOutputDecisionEvidence(input);

    expect(mocks.validateCampaign).toHaveBeenCalledWith("workspace-1", "campaign-1", undefined);
    expect(mocks.validateDerivation).toHaveBeenCalledWith("workspace-1", "root-1", "campaign-1");
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.getBrand).not.toHaveBeenCalled();
    expect(mocks.getCampaign).not.toHaveBeenCalled();
  });

  it("resolves the evidence owner and refuses local capture before writing through the injected port", async () => {
    mocks.getCampaign.mockResolvedValue({ id: input.campaignId, workspaceId: input.workspaceId, clientProfileId: "brand-1" });
    const authorize = vi.fn().mockResolvedValue({ allowed: false, reason: "local_learning_denied" });

    await expect(recordLocalLearningDecisionEvidence(
      { ...input, clientProfileId: "brand-1", source: "real_customer" }, authorize,
    )).rejects.toMatchObject({ reason: "local_learning_denied" });
    expect(authorize).toHaveBeenCalledWith({ workspaceId: "workspace-1", clientProfileId: "brand-1" });
    expect(mocks.validateCampaign).not.toHaveBeenCalled();
    expect(mocks.validateDerivation).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it.each([null, localScope.clientProfileId])("uses the production refusal before local capture (%s)", async (clientProfileId) => {
    mocks.getCampaign.mockResolvedValue({ id: input.campaignId, ...localScope, clientProfileId });
    mocks.getBrand.mockResolvedValue(null);
    await expect(recordLocalLearningDecisionEvidence({ ...input, ...localScope, clientProfileId }))
      .rejects.toMatchObject({ reason: clientProfileId ? "brand_out_of_scope" : "missing_brand" });
    expect(mocks.validateCampaign).not.toHaveBeenCalled();
    expect(mocks.validateDerivation).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it.each([
    { campaign: null, reason: "brand_out_of_scope" },
    { campaign: { id: input.campaignId, ...localScope, clientProfileId: null }, reason: "missing_brand" },
  ])("refuses missing or unbranded evidence ($reason) before consulting the port", async ({ campaign, reason }) => {
    mocks.getCampaign.mockResolvedValue(campaign);
    const authorize = vi.fn().mockResolvedValue({ allowed: true });

    await expect(recordLocalLearningDecisionEvidence({ ...input, ...localScope }, authorize))
      .rejects.toMatchObject({ reason });
    expect(authorize).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("captures authorized local evidence with the existing ownership checks and dispatch", async () => {
    mocks.getBrand.mockResolvedValue({ id: localScope.clientProfileId, workspaceId: localScope.workspaceId });

    expect(await recordLocalLearningDecisionEvidence({ ...input, ...localScope })).toEqual({ id: "event-1" });
    expect(mocks.getBrand).toHaveBeenCalledWith(localScope.workspaceId, localScope.clientProfileId);
    expect(mocks.validateCampaign).toHaveBeenCalledWith(localScope.workspaceId, input.campaignId, localScope.clientProfileId);
    expect(mocks.validateDerivation).toHaveBeenCalledWith(localScope.workspaceId, input.derivationId, input.campaignId);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining(localScope));
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
  });

  it("refuses evidence belonging to another brand in the same workspace even if the port would allow it", async () => {
    mocks.getCampaign.mockResolvedValue({ id: input.campaignId, ...localScope, clientProfileId: "other-brand" });
    const authorize = vi.fn().mockResolvedValue({ allowed: true });

    await expect(recordLocalLearningDecisionEvidence({ ...input, ...localScope }, authorize))
      .rejects.toMatchObject({ reason: "brand_out_of_scope" });
    expect(mocks.getCampaign).toHaveBeenCalledWith(input.campaignId, localScope.workspaceId);
    expect(authorize).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
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
