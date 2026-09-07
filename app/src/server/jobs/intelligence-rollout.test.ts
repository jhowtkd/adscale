import { describe, expect, it } from "vitest";
import { intelligenceRollbackValue, intelligenceRolloutDecision, INTELLIGENCE_ROLLOUT_FLAGS } from "./intelligence-rollout";

describe("intelligence rollout inventory", () => {
  it("blocks enabling flags without an evidence SHA even when rollback exists", () => {
    expect(intelligenceRolloutDecision({
      evidenceCommitSha: null,
      rollbackDocumented: true,
      productionFlagValue: "false",
    })).toEqual({ ready: false, blockedReason: "waiting_for_evidence_sha" });
  });

  it("rejects a production flag that is on without a SHA", () => {
    expect(intelligenceRolloutDecision({
      evidenceCommitSha: null,
      rollbackDocumented: true,
      productionFlagValue: "true",
    }).blockedReason).toBe("flag_on_without_evidence_sha");
  });

  it("rolls back by setting the env to false", () => {
    expect(intelligenceRollbackValue()).toBe("false");
  });

  it("records owner, dependency, evidence, and rollback for every flag", () => {
    expect(INTELLIGENCE_ROLLOUT_FLAGS).toHaveLength(2);
    for (const flag of INTELLIGENCE_ROLLOUT_FLAGS) {
      expect(flag.owner.length).toBeGreaterThan(0);
      expect(flag.dependsOn.length).toBeGreaterThan(0);
      expect(flag.requiredEvidence.length).toBeGreaterThan(0);
      expect(flag.rollback).toMatch(/false/);
    }
  });
});
