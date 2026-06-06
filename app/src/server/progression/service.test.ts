import { describe, expect, it } from "vitest";
import {
  calculateLevel,
  calculateProgressPercent,
  buildNextAction,
  EVIDENCE_ORDER,
} from "./levels";
import type { ProgressionEvidenceKey } from "@/lib/progression/types";

describe("progression levels", () => {
  it("keeps aprendiz until creative_approved is complete", () => {
    const completed = new Set<ProgressionEvidenceKey>([
      "campaign_created",
      "base_creative_uploaded",
      "readiness_ran",
      "derivation_generated",
    ]);

    expect(calculateLevel(completed)).toBe("aprendiz");
  });

  it("advances to analista_criativo after creative_approved", () => {
    const completed = new Set<ProgressionEvidenceKey>([
      "campaign_created",
      "base_creative_uploaded",
      "readiness_ran",
      "derivation_generated",
      "creative_approved",
    ]);

    expect(calculateLevel(completed)).toBe("analista_criativo");
  });

  it("calculates progress percent from completed evidence", () => {
    const completed = new Set<ProgressionEvidenceKey>([
      "campaign_created",
      "base_creative_uploaded",
    ]);

    expect(calculateProgressPercent(completed)).toBe(
      Math.round((2 / EVIDENCE_ORDER.length) * 100)
    );
  });

  it("marks next action blocked when prerequisite is missing", () => {
    const completed = new Set<ProgressionEvidenceKey>(["campaign_created"]);
    const next = buildNextAction(completed);

    expect(next.key).toBe("base_creative_uploaded");
    expect(next.blocked).toBe(false);
  });

  it("blocks readiness when base creative is missing", () => {
    const next = buildNextAction(
      new Set<ProgressionEvidenceKey>(["campaign_created", "base_creative_uploaded"])
    );

    expect(next.key).toBe("readiness_ran");
    expect(next.blocked).toBe(false);
  });
});
