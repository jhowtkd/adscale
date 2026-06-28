import { describe, expect, it } from "vitest";
import {
  ArtifactVersionValidationError,
  assertArtifactScope,
  assertSafeArtifactJson,
  isValidProposalTransition,
} from "./artifact-version";
import {
  artifactPromotionCommandSchema,
  comparisonAcknowledgementCommandSchema,
} from "../../lib/assistant/artifact-version";

const scope = {
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  campaignId: "campaign-1",
  threadId: "thread-1",
};

describe("artifact version repository invariants", () => {
  it.each([
    ["workspaceId", "Cross-workspace"],
    ["clientProfileId", "Cross-client"],
    ["campaignId", "Cross-campaign"],
    ["threadId", "Cross-thread"],
  ] as const)("rejects mismatched %s", (key, message) => {
    expect(() => assertArtifactScope(scope, { ...scope, [key]: "other" })).toThrow(
      message
    );
  });

  it("accepts an exact four-dimensional scope", () => {
    expect(() => assertArtifactScope(scope, scope)).not.toThrow();
  });

  it("rejects nested denied proposal payloads", () => {
    expect(() =>
      assertSafeArtifactJson({ change: { signedUrl: "secret" } }, "payload")
    ).toThrow(ArtifactVersionValidationError);
  });

  it("rejects prompt and provider payload fields outside the shared denylist", () => {
    expect(() =>
      assertSafeArtifactJson(
        { intendedChange: { inputPrompt: "hidden", providerPayload: {} } },
        "payload"
      )
    ).toThrow(ArtifactVersionValidationError);
  });

  it("allows pending proposals to become stale, confirmed, or canceled", () => {
    expect(isValidProposalTransition("pending", "stale")).toBe(true);
    expect(isValidProposalTransition("pending", "confirmed")).toBe(true);
    expect(isValidProposalTransition("pending", "canceled")).toBe(true);
  });

  it("does not revive stale or terminal proposals", () => {
    expect(isValidProposalTransition("stale", "confirmed")).toBe(false);
    expect(isValidProposalTransition("confirmed", "pending")).toBe(false);
    expect(isValidProposalTransition("canceled", "pending")).toBe(false);
  });

  it("requires every promotion head revision and rejects mixed or unknown targets", () => {
    const plan = {
      type: "plan",
      operationId: "00000000-0000-4000-8000-000000000001",
      lineageId: "00000000-0000-4000-8000-000000000002",
      targetVersionId: "00000000-0000-4000-8000-000000000003",
      expectedRevision: 2,
    };

    expect(artifactPromotionCommandSchema.safeParse(plan).success).toBe(true);
    expect(
      artifactPromotionCommandSchema.safeParse({
        ...plan,
        expectedRevision: undefined,
      }).success
    ).toBe(false);
    expect(
      artifactPromotionCommandSchema.safeParse({
        ...plan,
        planTransition: null,
      }).success
    ).toBe(false);
    expect(
      artifactPromotionCommandSchema.safeParse({
        ...plan,
        unknown: true,
      }).success
    ).toBe(false);
  });

  it("binds comparison acknowledgement to both versions, lineage, and revision", () => {
    const command = {
      creativeTargetVersionId: "00000000-0000-4000-8000-000000000001",
      planLineageId: "00000000-0000-4000-8000-000000000002",
      linkedPlanVersionId: "00000000-0000-4000-8000-000000000003",
      comparedOfficialPlanVersionId: "00000000-0000-4000-8000-000000000004",
      expectedPlanRevision: 3,
    };

    expect(comparisonAcknowledgementCommandSchema.safeParse(command).success).toBe(
      true
    );
    expect(
      comparisonAcknowledgementCommandSchema.safeParse({
        ...command,
        expectedPlanRevision: undefined,
      }).success
    ).toBe(false);
    expect(
      comparisonAcknowledgementCommandSchema.safeParse({
        ...command,
        clientApproved: true,
      }).success
    ).toBe(false);
  });
});
