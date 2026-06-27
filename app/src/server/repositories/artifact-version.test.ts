import { describe, expect, it } from "vitest";
import {
  ArtifactVersionValidationError,
  assertArtifactScope,
  assertSafeArtifactJson,
  isValidProposalTransition,
} from "./artifact-version";

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
});
