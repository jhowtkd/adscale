import { describe, expect, it } from "vitest";
import {
  buildPromotionEffect,
  isArtifactPromotionEligible,
} from "./promotion";

describe("artifact promotion policy", () => {
  it("allows only ready or provably previously approved targets", () => {
    expect(isArtifactPromotionEligible("ready", false)).toBe(true);
    expect(isArtifactPromotionEligible("approved", false)).toBe(true);
    expect(isArtifactPromotionEligible("stale", true)).toBe(true);

    for (const status of [
      "pending",
      "running",
      "failed",
      "canceled",
      "invalid",
      "stale",
      "superseded",
      "unknown",
    ]) {
      expect(isArtifactPromotionEligible(status, false)).toBe(false);
    }
  });

  it("previews explicit transitions and guarantees zero credit impact", () => {
    expect(
      buildPromotionEffect({
        transitions: [
          { artifactType: "plan", fromVersion: "v1", toVersion: "v2" },
          { artifactType: "creative", fromVersion: "v3", toVersion: "v4" },
        ],
        canonicalWrites: ["Plano", "Criativo"],
        staleProposalCount: 2,
      })
    ).toEqual({
      transitions: [
        { artifactType: "plan", fromVersion: "v1", toVersion: "v2" },
        { artifactType: "creative", fromVersion: "v3", toVersion: "v4" },
      ],
      canonicalWrites: ["Plano", "Criativo"],
      staleProposalCount: 2,
      creditImpact: 0,
    });
  });
});
